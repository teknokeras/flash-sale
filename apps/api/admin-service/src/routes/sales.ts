import type { FastifyInstance } from "fastify";
import { db, flashSales, orders, users } from "@flash-sale/db";
import { eq } from "drizzle-orm";

export async function adminSalesRoutes(app: FastifyInstance) {
    const adminGuard = { onRequest: [(app as any).authenticateAdmin] };

    // GET /admin/sales — list all sales
    app.get("/", adminGuard, async (_request, reply) => {
        const all = await db
            .select()
            .from(flashSales)
            .orderBy(flashSales.startsAt);
        return reply.send(all);
    });

    // GET /admin/sales/:id/orders — list orders for a sale
    app.get<{ Params: { id: string } }>("/:id/orders", adminGuard, async (request, reply) => {
        const { id } = request.params;
        const saleOrders = await db
            .select({
                orderId: orders.id,
                status: orders.status,
                createdAt: orders.createdAt,
                userId: users.id,
                userName: users.name,
                userEmail: users.email,
            })
            .from(orders)
            .innerJoin(users, eq(orders.userId, users.id))
            .where(eq(orders.saleId, id));

        return reply.send(saleOrders);
    });

    // POST /admin/sales — create a new sale
    app.post<{
        Body: {
            title: string;
            startsAt: string;
            endsAt: string;
        };
    }>(
        "/",
        {
            ...adminGuard,
            schema: {
                body: {
                    type: "object",
                    required: ["title", "startsAt", "endsAt"],
                    properties: {
                        title: { type: "string", minLength: 1 },
                        startsAt: { type: "string", format: "date-time" },
                        endsAt: { type: "string", format: "date-time" },
                    },
                },
            },
        },
        async (request, reply) => {
            const admin = request.user as { id: string };
            const { title, startsAt, endsAt } = request.body;

            const startParsed = new Date(startsAt);
            const endParsed = new Date(endsAt);

            // Constraint 1: Must start at least 15 minutes from now
            const minAllowedStart = new Date(Date.now() + 15 * 60 * 1000);
            if (startParsed < minAllowedStart) {
                return reply.badRequest(
                    `Sale start time must be at least 15 minutes in the future. Earliest allowed start is: ${minAllowedStart.toISOString()}`
                );
            }

            // Constraint 2: Must end at least +1 minute after it starts
            const minAllowedEnd = new Date(startParsed.getTime() + 1 * 60 * 1000);
            if (endParsed < minAllowedEnd) {
                return reply.badRequest("Sale duration must be at least 1 minute long.");
            }

            const [sale] = await db
                .insert(flashSales)
                .values({
                    title,
                    startsAt: startParsed,
                    endsAt: endParsed,
                    status: "scheduled",
                    createdBy: admin.id,
                })
                .returning();

            return reply.status(201).send(sale);
        }
    );

    // PUT /admin/sales/:id/item — attach an item to a sale
    app.put<{ Params: { id: string }; Body: { itemId: string } }>(
        "/:id/item",
        {
            ...adminGuard,
            schema: {
                body: {
                    type: "object",
                    required: ["itemId"],
                    properties: {
                        itemId: { type: "string", format: "uuid" },
                    },
                },
            },
        },
        async (request, reply) => {
            const { id } = request.params;
            const { itemId } = request.body;

            const [sale] = await db
                .update(flashSales)
                .set({ itemId, updatedAt: new Date() })
                .where(eq(flashSales.id, id))
                .returning();

            if (!sale) return reply.notFound("Sale not found");

            return reply.send(sale);
        }
    );

    // ── FIXED: PUT /admin/sales/:id — update sale schedule ──
    app.put<{
        Params: { id: string };
        Body: { title?: string; startsAt?: string; endsAt?: string; status?: string };
    }>("/:id", adminGuard, async (request, reply) => {
        const { id } = request.params;
        const { title, startsAt, endsAt, status } = request.body;

        // FIXED: Initialized as undefined instead of null to respect exactOptionalPropertyTypes
        let finalStart: Date | undefined = startsAt ? new Date(startsAt) : undefined;
        let finalEnd: Date | undefined = endsAt ? new Date(endsAt) : undefined;

        if (startsAt || endsAt) {
            const [existing] = await db.select().from(flashSales).where(eq(flashSales.id, id));
            if (!existing) return reply.notFound("Sale not found");

            // Merge existing data to run validations if inputs are partially provided
            const checkStart = finalStart || new Date(existing.startsAt);
            const checkEnd = finalEnd || new Date(existing.endsAt);

            if (startsAt && finalStart) {
                const minAllowedStart = new Date(Date.now() + 15 * 60 * 1000);
                if (finalStart < minAllowedStart) {
                    return reply.badRequest(`Updated sale start time must be at least 15 minutes in the future.`);
                }
            }

            // Enforce minimum 1-minute window
            const minAllowedEnd = new Date(checkStart.getTime() + 1 * 60 * 1000);
            if (checkEnd < minAllowedEnd) {
                return reply.badRequest("Sale duration must be at least 1 minute long.");
            }
        }

        // FIXED: Conditional spreading ensures undefined keys are omitted entirely from the update payload
        const updatePayload: any = {
            updatedAt: new Date()
        };

        if (title !== undefined) updatePayload.title = title;
        if (finalStart !== undefined) updatePayload.startsAt = finalStart;
        if (finalEnd !== undefined) updatePayload.endsAt = finalEnd;
        if (status !== undefined) updatePayload.status = status as any;

        const [sale] = await db
            .update(flashSales)
            .set(updatePayload)
            .where(eq(flashSales.id, id))
            .returning();

        if (!sale) return reply.notFound("Sale not found");

        return reply.send(sale);
    });

    // DELETE /admin/sales/:id
    app.delete<{ Params: { id: string } }>("/:id", adminGuard, async (request, reply) => {
        const { id } = request.params;
        const now = new Date();

        const [sale] = await db
            .select()
            .from(flashSales)
            .where(eq(flashSales.id, id));

        if (!sale) return reply.notFound("Sale not found");

        if (now >= new Date(sale.startsAt) && now <= new Date(sale.endsAt)) {
            return reply.badRequest("Cannot delete an ongoing active flash sale.");
        }

        await db.delete(flashSales).where(eq(flashSales.id, id));
        return reply.send({ success: true, message: "Sale deleted successfully" });
    });
}