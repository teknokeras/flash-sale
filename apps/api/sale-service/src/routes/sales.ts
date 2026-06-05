import type { FastifyInstance } from "fastify";
import { db, flashSales, items } from "@flash-sale/db";
import { eq } from "drizzle-orm";

export async function salesRoutes(app: FastifyInstance) {

    // GET /sales/active — returns the currently active sale with cached item info
    app.get("/active", async (request, reply) => {
        const redis = app.redis;

        // Try to find an active sale
        const [sale] = await db
            .select()
            .from(flashSales)
            .where(eq(flashSales.status, "active"))
            .limit(1);

        if (!sale) {
            // Also check for the next scheduled sale so the frontend can show a countdown
            const [next] = await db
                .select()
                .from(flashSales)
                .where(eq(flashSales.status, "scheduled"))
                .orderBy(flashSales.startsAt)
                .limit(1);

            return reply.send({
                active: false,
                nextSale: next ?? null,
            });
        }

        // Get remaining quantity from Redis (source of truth for live qty)
        const qtyRaw = await redis.get(`sale:${sale.id}:qty`);
        const remainingQty = qtyRaw !== null ? parseInt(qtyRaw, 10) : 0;

        // Get item from cache or DB
        let item = null;
        if (sale.itemId) {
            const cacheKey = `sale:${sale.id}:info`;
            const cached = await redis.get(cacheKey);

            if (cached) {
                item = JSON.parse(cached);
            } else {
                const [dbItem] = await db
                    .select()
                    .from(items)
                    .where(eq(items.id, sale.itemId))
                    .limit(1);

                if (dbItem) {
                    item = dbItem;
                    // Cache for 60s — item info rarely changes during a live sale
                    await redis.set(cacheKey, JSON.stringify(dbItem), "EX", 60);
                }
            }
        }

        return reply.send({
            active: true,
            sale: {
                id: sale.id,
                title: sale.title,
                startsAt: sale.startsAt,
                endsAt: sale.endsAt,
                remainingQty,
            },
            item,
        });
    });

    // GET /sales/:id — specific sale info
    app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
        const { id } = request.params;
        const redis = app.redis;

        const [sale] = await db
            .select()
            .from(flashSales)
            .where(eq(flashSales.id, id))
            .limit(1);

        if (!sale) return reply.notFound("Sale not found");

        const qtyRaw = await redis.get(`sale:${sale.id}:qty`);
        const remainingQty = qtyRaw !== null ? parseInt(qtyRaw, 10) : null;

        let item = null;
        if (sale.itemId) {
            [item] = await db
                .select()
                .from(items)
                .where(eq(items.id, sale.itemId))
                .limit(1);
        }

        return reply.send({ sale, item, remainingQty });
    });
}