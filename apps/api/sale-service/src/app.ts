import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyRedis from "@fastify/redis";
import fastifySensible from "@fastify/sensible";
import { salesRoutes } from "./routes/sales.js";
import { authRoutes } from './routes/auth.js'

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

    // ── Plugins ──────────────────────────────────────────
    app.register(fastifySensible);

    app.register(fastifyJwt, { secret: JWT_SECRET });

    app.register(fastifyRedis, { url: REDIS_URL });

    // ── Health check ─────────────────────────────────────
    app.get("/health", async () => ({ status: "ok", service: "sale-service" }));

    // ── Routes ───────────────────────────────────────────
    app.register(salesRoutes, { prefix: "/sales" });
    app.register(authRoutes, { prefix: "/auth" });
    return app;
}