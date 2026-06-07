import type { FastifyInstance } from "fastify";
import { db, orders, flashSales, items } from "@flash-sale/db";
import { eq } from "drizzle-orm";

export async function purchaseQueryRoutes(app: FastifyInstance) {
    // GET / (Gateway strips prefix, so this catches root)
    app.get(
        "/",
        { onRequest: [(app as any).authenticate] },
        async (request, reply) => {
            const user = request.user as { id: string; sub?: string };
            const userId = user.sub ?? user.id;

            try {
                const userPurchases = await db
                    .select({
                        orderId: orders.id,
                        status: orders.status,
                        createdAt: orders.createdAt,
                        saleId: flashSales.id,
                        saleTitle: flashSales.title,
                        itemName: items.name,
                        priceCents: items.priceCents,
                    })
                    .from(orders)
                    .innerJoin(flashSales, eq(orders.saleId, flashSales.id))
                    .innerJoin(items, eq(flashSales.itemId, items.id))
                    .where(eq(orders.userId, userId))
                    .orderBy(orders.createdAt);

                return reply.send(userPurchases);
            } catch (err) {
                app.log.error({ err, userId }, "Failed to fetch user purchases");
                return reply.internalServerError("Could not retrieve purchase history.");
            }
        }
    );
}