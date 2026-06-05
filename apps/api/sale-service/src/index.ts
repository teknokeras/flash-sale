import cron from "node-cron";
import { buildApp } from "./app.js";
import { db, flashSales } from "@flash-sale/db";
import { eq, and, lte, gte } from "drizzle-orm";

const PORT = Number(process.env["PORT"] ?? 3001);
const app = buildApp();

// ── Sale scheduler ────────────────────────────────────────────────────────────
// Runs every 30 seconds. Opens/closes sales based on current time.
// On open: seeds Redis with inventory count + TTL-based open flag.
// On close: cleans up Redis key (TTL handles it, but explicit is safer).
cron.schedule("*/30 * * * * *", async () => {
    const redis = app.redis;
    const now = new Date();

    try {
        // Open scheduled sales whose start time has passed
        const toOpen = await db
            .select()
            .from(flashSales)
            .where(
                and(
                    eq(flashSales.status, "scheduled"),
                    lte(flashSales.startsAt, now),
                    gte(flashSales.endsAt, now)
                )
            );

        for (const sale of toOpen) {
            if (!sale.itemId) continue;

            // Get initial quantity from item
            const [item] = await db.query.items.findMany({
                where: (items, { eq }) => eq(items.id, sale.itemId!),
                limit: 1,
            });
            if (!item) continue;

            const ttlSeconds = Math.floor(
                (sale.endsAt.getTime() - now.getTime()) / 1000
            );

            // Seed inventory only if not already set (idempotent)
            await redis.set(`sale:${sale.id}:qty`, item.initialQuantity, "NX");
            await redis.set(`sale:${sale.id}:open`, "1", "EX", ttlSeconds);

            await db
                .update(flashSales)
                .set({ status: "active", updatedAt: now })
                .where(eq(flashSales.id, sale.id));

            app.log.info({ saleId: sale.id, qty: item.initialQuantity, ttlSeconds },
                "Sale opened");
        }

        // Close active sales whose end time has passed
        const toClose = await db
            .select()
            .from(flashSales)
            .where(
                and(eq(flashSales.status, "active"), lte(flashSales.endsAt, now))
            );

        for (const sale of toClose) {
            await redis.del(`sale:${sale.id}:open`);
            await db
                .update(flashSales)
                .set({ status: "ended", updatedAt: now })
                .where(eq(flashSales.id, sale.id));

            app.log.info({ saleId: sale.id }, "Sale closed");
        }
    } catch (err) {
        app.log.error({ err }, "Scheduler error");
    }
});

// ── Start ─────────────────────────────────────────────────────────────────────
try {
    await app.listen({ port: PORT, host: "0.0.0.0" });
} catch (err) {
    app.log.error(err);
    process.exit(1);
}