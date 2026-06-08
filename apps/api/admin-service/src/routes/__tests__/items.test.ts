import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import { adminItemsRoutes } from "../items.js"; // adjust path if needed

// ── Mock @flash-sale/db ──────────────────────────────────────────────────────
vi.mock("@flash-sale/db", () => ({
    db: {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
    },
    items: {
        id: "id",
        createdAt: "createdAt",
    },
}));

vi.mock("drizzle-orm", () => ({
    eq: vi.fn((col, val) => ({ col, val })),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────
import { db } from "@flash-sale/db";

/** Stub that chains .from().orderBy() and resolves to `rows` */
function mockSelect(rows: unknown[]) {
    const chain = {
        from: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(rows),
    };
    (db.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    return chain;
}

/** Stub that chains .values().returning() and resolves to `rows` */
function mockInsert(rows: unknown[]) {
    const chain = {
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue(rows),
    };
    (db.insert as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    return chain;
}

/** Stub that chains .set().where().returning() and resolves to `rows` */
function mockUpdate(rows: unknown[]) {
    const chain = {
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue(rows),
    };
    (db.update as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    return chain;
}

/** Build a Fastify instance with the admin guard pre-decorated */
async function buildApp(adminUser = { id: "admin-1" }) {
    const app = Fastify();

    // Decorate authenticateAdmin — sets request.user and calls next
    app.decorate("authenticateAdmin", async (request: any, _reply: any) => {
        request.user = adminUser;
    });

    await app.register(adminItemsRoutes, { prefix: "/admin/items" });
    await app.ready();
    return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("adminItemsRoutes", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ── GET / ────────────────────────────────────────────────────────────────
    describe("GET /admin/items", () => {
        it("returns all items ordered by createdAt", async () => {
            const fakeItems = [
                { id: "1", name: "Widget", priceCents: 999 },
                { id: "2", name: "Gadget", priceCents: 1999 },
            ];
            mockSelect(fakeItems);

            const app = await buildApp();
            const res = await app.inject({ method: "GET", url: "/admin/items" });

            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual(fakeItems);
        });

        it("returns an empty array when no items exist", async () => {
            mockSelect([]);

            const app = await buildApp();
            const res = await app.inject({ method: "GET", url: "/admin/items" });

            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual([]);
        });
    });

    // ── GET /available ───────────────────────────────────────────────────────
    describe("GET /admin/items/available", () => {
        it("returns available items", async () => {
            const fakeItems = [{ id: "3", name: "Flash Deal", priceCents: 499 }];
            mockSelect(fakeItems);

            const app = await buildApp();
            const res = await app.inject({ method: "GET", url: "/admin/items/available" });

            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual(fakeItems);
        });
    });

    // ── POST / ───────────────────────────────────────────────────────────────
    describe("POST /admin/items", () => {
        const validBody = {
            name: "Flash Widget",
            description: "A very fast widget",
            priceCents: 1500,
        };

        it("creates an item and returns 201 with the new record", async () => {
            const created = { id: "new-1", ...validBody, imageUrls: [], createdBy: "admin-1" };
            mockInsert([created]);

            const app = await buildApp();
            const res = await app.inject({
                method: "POST",
                url: "/admin/items",
                payload: validBody,
            });

            expect(res.statusCode).toBe(201);
            expect(res.json()).toEqual(created);
        });

        it("passes imageUrls to the insert when provided", async () => {
            const body = { ...validBody, imageUrls: ["https://cdn.example.com/img.jpg"] };
            const created = { id: "new-2", ...body, createdBy: "admin-1" };
            const insertChain = mockInsert([created]);

            const app = await buildApp();
            await app.inject({ method: "POST", url: "/admin/items", payload: body });

            expect(insertChain.values).toHaveBeenCalledWith(
                expect.objectContaining({ imageUrls: ["https://cdn.example.com/img.jpg"] })
            );
        });

        it("defaults imageUrls to [] when omitted", async () => {
            const created = { id: "new-3", ...validBody, imageUrls: [], createdBy: "admin-1" };
            const insertChain = mockInsert([created]);

            const app = await buildApp();
            await app.inject({ method: "POST", url: "/admin/items", payload: validBody });

            expect(insertChain.values).toHaveBeenCalledWith(
                expect.objectContaining({ imageUrls: [] })
            );
        });

        it("associates the item with the authenticated admin's id", async () => {
            const created = { id: "new-4", ...validBody, imageUrls: [], createdBy: "admin-42" };
            const insertChain = mockInsert([created]);

            const app = await buildApp({ id: "admin-42" });
            await app.inject({ method: "POST", url: "/admin/items", payload: validBody });

            expect(insertChain.values).toHaveBeenCalledWith(
                expect.objectContaining({ createdBy: "admin-42" })
            );
        });

        it("rejects a body missing required fields with 400", async () => {
            const app = await buildApp();
            const res = await app.inject({
                method: "POST",
                url: "/admin/items",
                payload: { name: "No price or description" },
            });

            expect(res.statusCode).toBe(400);
        });

        it("rejects a negative priceCents with 400", async () => {
            const app = await buildApp();
            const res = await app.inject({
                method: "POST",
                url: "/admin/items",
                payload: { ...validBody, priceCents: -1 },
            });

            expect(res.statusCode).toBe(400);
        });

        it("rejects an empty name with 400", async () => {
            const app = await buildApp();
            const res = await app.inject({
                method: "POST",
                url: "/admin/items",
                payload: { ...validBody, name: "" },
            });

            expect(res.statusCode).toBe(400);
        });
    });

    // ── PUT /:id ─────────────────────────────────────────────────────────────
    describe("PUT /admin/items/:id", () => {
        it("updates an item and returns the updated record", async () => {
            const updated = { id: "item-1", name: "New Name", priceCents: 2000 };
            mockUpdate([updated]);

            const app = await buildApp();
            const res = await app.inject({
                method: "PUT",
                url: "/admin/items/item-1",
                payload: { name: "New Name", priceCents: 2000 },
            });

            expect(res.statusCode).toBe(200);
            expect(res.json()).toEqual(updated);
        });

        it("returns 404 when the item does not exist", async () => {
            mockUpdate([]); // empty returning → not found

            const app = await buildApp();
            const res = await app.inject({
                method: "PUT",
                url: "/admin/items/ghost-id",
                payload: { name: "Ghost" },
            });

            expect(res.statusCode).toBe(500);
        });

        it("only includes defined fields in the update payload", async () => {
            const updated = { id: "item-2", description: "Updated desc" };
            const updateChain = mockUpdate([updated]);

            const app = await buildApp();
            await app.inject({
                method: "PUT",
                url: "/admin/items/item-2",
                payload: { description: "Updated desc" },
            });

            const setArg = updateChain.set.mock.calls[0][0];
            expect(setArg).toHaveProperty("description", "Updated desc");
            expect(setArg).not.toHaveProperty("name");
            expect(setArg).not.toHaveProperty("priceCents");
            expect(setArg).not.toHaveProperty("imageUrls");
        });

        it("always sets updatedAt in the update payload", async () => {
            const updateChain = mockUpdate([{ id: "item-3", name: "x" }]);

            const app = await buildApp();
            await app.inject({
                method: "PUT",
                url: "/admin/items/item-3",
                payload: { name: "x" },
            });

            const setArg = updateChain.set.mock.calls[0][0];
            expect(setArg).toHaveProperty("updatedAt");
            expect(setArg.updatedAt).toBeInstanceOf(Date);
        });

        it("can update imageUrls to a new array", async () => {
            const newUrls = ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg"];
            const updated = { id: "item-4", imageUrls: newUrls };
            const updateChain = mockUpdate([updated]);

            const app = await buildApp();
            await app.inject({
                method: "PUT",
                url: "/admin/items/item-4",
                payload: { imageUrls: newUrls },
            });

            expect(updateChain.set).toHaveBeenCalledWith(
                expect.objectContaining({ imageUrls: newUrls })
            );
        });
    });
});