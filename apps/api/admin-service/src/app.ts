import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyRedis from "@fastify/redis";
import fastifySensible from "@fastify/sensible";
import { authRoutes } from "./routes/auth.js";
import { adminSalesRoutes } from "./routes/sales.js";
import { adminItemsRoutes } from "./routes/items.js";

export function buildApp() {
    // Validate env vars inside the function so TypeScript narrows the type
    const JWT_SECRET = process.env["JWT_SECRET"];
    const REDIS_URL = process.env["REDIS_URL"];

    if (!JWT_SECRET) throw new Error("JWT_SECRET is required");
    if (!REDIS_URL) throw new Error("REDIS_URL is required");

    const app = Fastify({
        logger: {
            level: process.env["LOG_LEVEL"] ?? "info",
            ...(process.env["NODE_ENV"] === "local" && {
                transport: { target: "pino-pretty" },
            }),
        },
    });

    app.register(fastifySensible);
    // After the throw-guards above, TypeScript now knows these are `string`, not `string | undefined`
    app.register(fastifyJwt, { secret: JWT_SECRET });
    app.register(fastifyRedis, { url: REDIS_URL });

    // Admin-only auth guard
    app.decorate("authenticateAdmin", async function (request: any, reply: any) {
        try {
            await request.jwtVerify();
            const user = request.user as { role: string };
            if (user.role !== "admin") {
                return reply.forbidden("Admin access required");
            }
        } catch {
            reply.unauthorized("Invalid or missing token");
        }
    });

    app.get("/health", async () => ({ status: "ok", service: "admin-service" }));

    app.register(authRoutes, { prefix: "/auth" });
    app.register(adminSalesRoutes, { prefix: "/admin/sales" });
    app.register(adminItemsRoutes, { prefix: "/admin/items" });

    return app;
}