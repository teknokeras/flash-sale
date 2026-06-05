import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyRedis from "@fastify/redis";
import fastifySensible from "@fastify/sensible";
import { purchaseRoutes } from "./routes/purchase.js";

const JWT_SECRET = process.env["JWT_SECRET"];
const REDIS_URL = process.env["REDIS_URL"];

if (!JWT_SECRET) throw new Error("JWT_SECRET is required");
if (!REDIS_URL) throw new Error("REDIS_URL is required");

export function buildApp() {
    const app = Fastify({
        logger: {
            level: process.env["LOG_LEVEL"] ?? "info",
            ...(process.env["NODE_ENV"] === "local" && {
                transport: { target: "pino-pretty" },
            }),
        },
    });

    app.register(fastifySensible);
    app.register(fastifyJwt, { secret: JWT_SECRET });
    app.register(fastifyRedis, { url: REDIS_URL });

    // Auth decorator — call request.authenticate() in protected routes
    app.decorate("authenticate", async function (request: any, reply: any) {
        try {
            await request.jwtVerify();
        } catch {
            reply.unauthorized("Invalid or missing token");
        }
    });

    app.get("/health", async () => ({ status: "ok", service: "purchase-service" }));

    app.register(purchaseRoutes, { prefix: "/purchase" });

    return app;
}