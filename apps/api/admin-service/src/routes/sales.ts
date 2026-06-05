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

            if (new Date(endsAt) <= new Date(startsAt)) {
                return reply.badRequest("endsAt must be after startsAt");
            }

            const [sale] = await db
                .insert(flashSales)
                .values({
                    title,
                    startsAt: new Date(startsAt),
                    endsAt: new Date(endsAt),
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

    // PUT /admin/sales/:id — update sale schedule
    app.put<{
        Params: { id: string };
        Body: { title?: string; startsAt?: string; endsAt?: string; status?: string };
    }>("/:id", adminGuard, async (request, reply) => {
        const { id } = request.params;
        const { title, startsAt, endsAt, status } = request.body;

        const [sale] = await db
            .update(flashSales)
            .set({
                ...(title && { title }),
                ...(startsAt && { startsAt: new Date(startsAt) }),
                ...(endsAt && { endsAt: new Date(endsAt) }),
                ...(status && { status: status as any }),
                updatedAt: new Date(),
            })
            .where(eq(flashSales.id, id))
            .returning();

        if (!sale) return reply.notFound("Sale not found");

        return reply.send(sale);
    });
}