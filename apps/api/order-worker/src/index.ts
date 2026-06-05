import {
    SQSClient,
    ReceiveMessageCommand,
    DeleteMessageCommand,
} from "@aws-sdk/client-sqs";
import { db, orders, flashSales } from "@flash-sale/db";
import { eq } from "drizzle-orm";
import pino from "pino";

const log = pino({
    level: process.env["LOG_LEVEL"] ?? "info",
    ...(process.env["NODE_ENV"] === "local" && {
        transport: { target: "pino-pretty" },
    }),
});

// ── SQS client ────────────────────────────────────────────────────────────────
const sqs = new SQSClient({
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
const POLL_INTERVAL = 2000; // ms between polls when queue is empty
const MAX_MESSAGES = 10;   // SQS max per receive call

if (!QUEUE_URL) throw new Error("SQS_PURCHASE_QUEUE_URL is required");

// ── Message processor ─────────────────────────────────────────────────────────
async function processMessage(body: string, receiptHandle: string) {
    let payload: { userId: string; saleId: string; requestId: string };

    try {
        payload = JSON.parse(body);
    } catch {
        log.error({ body }, "Invalid message body — skipping");
        return;
    }

    const { userId, saleId, requestId } = payload;
    log.info({ userId, saleId, requestId }, "Processing purchase");

    try {
        // Fetch sale to get itemId and price
        const [sale] = await db
            .select()
            .from(flashSales)
            .where(eq(flashSales.id, saleId))
            .limit(1);

        if (!sale || !sale.itemId) {
            log.error({ saleId }, "Sale or item not found — skipping");
            return;
        }

        // Fetch item price
        const item = await db.query.items.findFirst({
            where: (items, { eq }) => eq(items.id, sale.itemId!),
        });

        if (!item) {
            log.error({ itemId: sale.itemId }, "Item not found — skipping");
            return;
        }

        // Persist the confirmed order
        // ON CONFLICT DO NOTHING — safe to retry if the worker crashes mid-flight
        await db
            .insert(orders)
            .values({
                userId,
                saleId,
                itemId: sale.itemId,
                priceCents: item.priceCents,
                status: "confirmed",
                sqsMessageId: requestId,
            })
            .onConflictDoNothing(); // unique(userId, saleId) constraint

        // Delete from queue only after successful DB write
        await sqs.send(new DeleteMessageCommand({
            QueueUrl: QUEUE_URL,
            ReceiptHandle: receiptHandle,
        }));

        log.info({ userId, saleId }, "Order confirmed");

    } catch (err) {
        // Don't delete from queue — SQS will redeliver after visibility timeout
        log.error({ err, userId, saleId }, "Failed to process order — will retry");
    }
}

// ── Poll loop ─────────────────────────────────────────────────────────────────
async function poll() {
    try {
        const response = await sqs.send(
            new ReceiveMessageCommand({
                QueueUrl: QUEUE_URL,
                MaxNumberOfMessages: MAX_MESSAGES,
                WaitTimeSeconds: 5, // long polling — reduces empty responses
                VisibilityTimeout: 30,
            })
        );

        const messages = response.Messages ?? [];

        if (messages.length > 0) {
            log.debug({ count: messages.length }, "Received messages");
            // Process concurrently within the batch
            await Promise.allSettled(
                messages.map((msg) =>
                    processMessage(msg.Body ?? "", msg.ReceiptHandle ?? "")
                )
            );
        }
    } catch (err) {
        log.error({ err }, "Poll error");
    }

    // Schedule next poll
    setTimeout(poll, messages?.length === 0 ? POLL_INTERVAL : 0);
}

// Keep reference to avoid GC
let messages: any[] = [];

log.info({ queueUrl: QUEUE_URL }, "Order worker started");
poll();

// Graceful shutdown
process.on("SIGTERM", () => {
    log.info("SIGTERM received — shutting down");
    process.exit(0);
});