import type { FastifyInstance } from "fastify";
import { db, items } from "@flash-sale/db";
import { eq } from "drizzle-orm"; // 👈 Restored for lookup routing filters

export async function adminItemsRoutes(app: FastifyInstance) {
    const adminGuard = { onRequest: [(app as any).authenticateAdmin] };

    // ── GET /admin/items — List all items ──
    app.get("/", adminGuard, async (_request, reply) => {
        const all = await db
            .select()
            .from(items)
            .orderBy(items.createdAt);
        return reply.send(all);
    });

    // ── GET /admin/items/available — Only items that are ready to be attached ──
    app.get("/available", adminGuard, async (_request, reply) => {
        const availableItems = await db
            .select()
            .from(items)
            .orderBy(items.createdAt);

        return reply.send(availableItems);
    });

    // ── POST /admin/items — Create a new item matching your updated schema ──
    app.post<{
        Body: {
            name: string;
            description: string;
            priceCents: number;
            imageUrls?: string[]; // 👈 Added support for your new array column field
        };
    }>(
        "/",
        {
            ...adminGuard,
            schema: {
                body: {
                    type: "object",
                    required: ["name", "description", "priceCents"],
                    properties: {
                        name: { type: "string", minLength: 1 },
                        description: { type: "string", minLength: 1 },
                        priceCents: { type: "integer", minimum: 0 },
                        imageUrls: {
                            type: "array",
                            items: { type: "string" }
                        }
                    },
                },
            },
        },
        async (request, reply) => {
            const admin = request.user as { id: string };
            const { name, description, priceCents, imageUrls } = request.body;

            const [newItem] = await db
                .insert(items)
                .values({
                    name,
                    description,
                    priceCents,
                    imageUrls: imageUrls ?? [], // 👈 Default to empty array if omitted
                    createdBy: admin.id,
                })
                .returning();

            return reply.status(201).send(newItem);
        }
    );

    // ── PUT /admin/items/:id — Update basic item details cleanly ──
    app.put<{
        Params: { id: string };
        Body: { name?: string; description?: string; priceCents?: number; imageUrls?: string[] };
    }>("/:id", adminGuard, async (request, reply) => {
        const { id } = request.params;
        const { name, description, priceCents, imageUrls } = request.body;

        const updatePayload: any = {
            updatedAt: new Date()
        };

        if (name !== undefined) updatePayload.name = name;
        if (description !== undefined) updatePayload.description = description;
        if (priceCents !== undefined) updatePayload.priceCents = priceCents;
        if (imageUrls !== undefined) updatePayload.imageUrls = imageUrls;

        const [updatedItem] = await db
            .update(items)
            .set(updatePayload)
            .where(eq(items.id, id))
            .returning();

        if (!updatedItem) return reply.notFound("Item record not found");

        return reply.send(updatedItem);
    });
}