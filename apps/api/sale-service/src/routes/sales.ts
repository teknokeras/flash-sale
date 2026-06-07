import type { FastifyInstance } from "fastify";
import { db } from "@flash-sale/db"; // 💡 Completely dropped items and flashSales tokens to bypass schema corruption
import { sql } from "drizzle-orm";

export async function salesRoutes(app: FastifyInstance) {

    // GET /sales/active — returns the currently active sale with cached item info
    app.get("/active", async (request, reply) => {
        const redis = app.redis;

        const result = await db.execute(sql`
            SELECT 
                id, 
                item_id as "itemId", 
                title, 
                starts_at as "startsAt", 
                ends_at as "endsAt", 
                status, 
                initial_quantity as "initialQuantity", 
                price_cents as "priceCents"
            FROM flash_sales
            WHERE status = 'active'
            LIMIT 1
        `);

        const sale = (Array.isArray(result) ? result[0] : (result as any).rows?.[0]) || null;

        if (!sale) {
            const nextResult = await db.execute(sql`
                SELECT id, title, starts_at as "startsAt", ends_at as "endsAt", status
                FROM flash_sales
                WHERE status = 'scheduled'
                ORDER BY starts_at ASC
                LIMIT 1
            `);

            const next = (Array.isArray(nextResult) ? nextResult[0] : (nextResult as any).rows?.[0]) || null;

            return reply.send({
                active: false,
                nextSale: next,
            });
        }

        const qtyRaw = await redis.get(`sale:${sale.id}:qty`);
        const remainingQty = qtyRaw !== null ? parseInt(qtyRaw, 10) : 0;

        let item = null;
        if (sale.itemId) {
            const cacheKey = `sale:${sale.id}:info`;
            const cached = await redis.get(cacheKey);

            if (cached) {
                item = JSON.parse(cached);
            } else {
                // 💡 Fixed: Switched items table fetch to raw SQL to drop the phantom columns crashing Postgres
                const itemResult = await db.execute(sql`
                    SELECT id, name, description, price_cents as "priceCents", image_urls as "imageUrls"
                    FROM items
                    WHERE id = ${sale.itemId}
                    LIMIT 1
                `);

                const dbItem = (Array.isArray(itemResult) ? itemResult[0] : (itemResult as any).rows?.[0]) || null;

                if (dbItem) {
                    item = dbItem;
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
                initialQuantity: Number(sale.initialQuantity ?? 0),
                priceCents: Number(sale.priceCents ?? 0),
                remainingQty,
            },
            item,
        });
    });

    // GET /sales/:id — specific sale info
    app.get<{ Params: { id: string } }>("/:id", async (request, reply) => {
        const { id } = request.params;
        const redis = app.redis;

        const result = await db.execute(sql`
            SELECT 
                id, 
                item_id as "itemId", 
                title, 
                starts_at as "startsAt", 
                ends_at as "endsAt", 
                status, 
                initial_quantity as "initialQuantity", 
                price_cents as "priceCents"
            FROM flash_sales
            WHERE id = ${id}
            LIMIT 1
        `);

        const sale = (Array.isArray(result) ? result[0] : (result as any).rows?.[0]) || null;

        if (!sale) return reply.notFound("Sale not found");

        const qtyRaw = await redis.get(`sale:${sale.id}:qty`);
        const remainingQty = qtyRaw !== null ? parseInt(qtyRaw, 10) : null;

        let item = null;
        if (sale.itemId) {
            // 💡 Fixed: Switched to raw execution here too
            const itemResult = await db.execute(sql`
                SELECT id, name, description, price_cents as "priceCents", image_urls as "imageUrls"
                FROM items
                WHERE id = ${sale.itemId}
                LIMIT 1
            `);
            item = (Array.isArray(itemResult) ? itemResult[0] : (itemResult as any).rows?.[0]) || null;
        }

        return reply.send({
            sale: {
                ...sale,
                initialQuantity: Number(sale.initialQuantity ?? 0),
                priceCents: Number(sale.priceCents ?? 0),
            },
            item,
            remainingQty
        });
    });
}