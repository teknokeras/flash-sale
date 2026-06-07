import type { FastifyInstance } from "fastify";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { randomUUID } from "crypto";
import { isSaleOpen, atomicDecrementInventory, incrementInventory } from "../lib/redis-lua.js";
import { claimPurchaseSlot, releasePurchaseSlot } from "../lib/dynamo.js";

// ── SQS client (switches endpoint for local vs AWS) ───────────────────────────
const sqsClient = new SQSClient({
    region: process.env["SQS_REGION"] ?? "us-east-1",
    ...(process.env["NODE_ENV"] === "local" && {
        endpoint: process.env["SQS_ENDPOINT"] ?? "http://localhost:9324",
        credentials: {
            accessKeyId: process.env["SQS_ACCESS_KEY"] ?? "local",
            secretAccessKey: process.env["SQS_SECRET_KEY"] ?? "local",
        },
    }),
});

const QUEUE_URL = process.env["SQS_PURCHASE_QUEUE_URL"]!;

export async function purchaseRoutes(app: FastifyInstance) {

    // POST /purchase
    app.post<{ Body: { saleId: string } }>(
        "/",
        {
            onRequest: [(app as any).authenticate],
            schema: {
                body: {
                    type: "object",
                    required: ["saleId"],
                    properties: {
                        saleId: { type: "string", format: "uuid" },
                    },
                },
            },
        },
        async (request, reply) => {
            const { saleId } = request.body;
            const user = request.user as { id: string; email: string; sub?: string };
            const userId = user.sub ?? user.id;
            const requestId = randomUUID();
            const redis = app.redis;

            // ── Guard 1: Is the sale currently open? ──────────────────────────────
            const open = await isSaleOpen(redis, saleId);
            if (!open) {
                return reply.status(409).send({
                    error: "SaleNotActive",
                    message: "This sale is not currently active.",
                });
            }

            // ── Guard 2: Has this user already purchased? (DynamoDB) ──────────────
            const claimed = await claimPurchaseSlot(userId, saleId, requestId);
            if (!claimed) {
                return reply.status(409).send({
                    error: "AlreadyPurchased",
                    message: "You have already purchased this item.",
                });
            }

            // ── Guard 3: Is there inventory left? (Redis Lua atomic decrement) ────
            const { success, remaining } = await atomicDecrementInventory(redis, saleId);
            if (!success) {
                // Rollback the DynamoDB slot claim — item was sold out
                await releasePurchaseSlot(userId, saleId);
                return reply.status(410).send({
                    error: "SoldOut",
                    message: "Sorry, this item is sold out.",
                });
            }

            // ── Guard 4: Enqueue the purchase job ─────────────────────────────────
            try {
                await sqsClient.send(
                    new SendMessageCommand({
                        QueueUrl: QUEUE_URL,
                        MessageBody: JSON.stringify({ userId, saleId, requestId }),
                        MessageGroupId: saleId,
                        // Dedup at SQS level — second layer of safety
                        MessageDeduplicationId: `${userId}#${saleId}`,
                    })
                );
            } catch (err) {
                // SQS enqueue failed — rollback both DynamoDB and Redis
                app.log.error({ err, userId, saleId }, "SQS enqueue failed — rolling back");
                await releasePurchaseSlot(userId, saleId);
                await updateInventory(redis, saleId); // Assuming 'incrementInventory' alias pattern handles rollback decrements safely
                return reply.internalServerError("Failed to process purchase. Please try again.");
            }

            app.log.info({ userId, saleId, remaining }, "Purchase reserved");

            return reply.status(202).send({
                status: "reserved",
                message: "Your purchase is being processed.",
                requestId,
                remaining,
            });
        }
    );
}

// Quick helper alignment mapping matching internal file dependencies
async function updateInventory(redis: any, saleId: string) {
    try {
        await incrementInventory(redis, saleId);
    } catch (e) {
        // Fail-safe catch
    }
}