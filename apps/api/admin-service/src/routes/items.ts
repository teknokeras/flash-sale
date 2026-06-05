import type { FastifyInstance } from "fastify";
import { db, items } from "@flash-sale/db";

export async function adminItemsRoutes(app: FastifyInstance) {
    const adminGuard = { onRequest: [(app as any).authenticateAdmin] };

    // GET /admin/items
    app.get("/", adminGuard, async (_request, reply) => {
        const all = await db.select().from(items).orderBy(items.createdAt);
        return reply.send(all);
    });

    // POST /admin/items — create a new item
    app.post<{
        Body: {
            name: string;
            description: string;
            priceCents: number;
            initialQuantity: number;
            imageUrls?: string[];
        };
    }>(
        "/",
        {
            ...adminGuard,
            schema: {
                body: {
                    type: "object",
                    required: ["name", "description", "priceCents", "initialQuantity"],
                    properties: {
                        name: { type: "string", minLength: 1 },
                        description: { type: "string", minLength: 1 },
                        priceCents: { type: "integer", minimum: 1 },
                        initialQuantity: { type: "integer", minimum: 1 },
                        imageUrls: { type: "array", items: { type: "string" } },
                    },
                },
            },
        },
        async (request, reply) => {
            const admin = request.user as { id: string };
            const { name, description, priceCents, initialQuantity, imageUrls } = request.body;

            const [item] = await db
                .insert(items)
                .values({
                    name,
                    description,
                    priceCents,
                    initialQuantity,
                    imageUrls: imageUrls ?? [],
                    createdBy: admin.id,
                })
                .returning();

            return reply.status(201).send(item);
        }
    );
}