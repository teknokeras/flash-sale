import { describe, it, expect, beforeEach, vi } from "vitest";

// 1. Mock the environment variables BEFORE importing the app
vi.stubEnv("JWT_SECRET", "test-jwt-secret-key-12345");
vi.stubEnv("REDIS_URL", "redis://localhost:6379");
vi.stubEnv("LOG_LEVEL", "silent"); // Keep test output clean

// 2. Mock @fastify/redis so it doesn't try to connect to a real Redis server
vi.mock("@fastify/redis", () => {
    return {
        default: async (fastifyInstance: any, options: any) => {
            // Decorate the fastify instance with a fake redis client object
            fastifyInstance.decorate("redis", {
                get: vi.fn(),
                set: vi.fn(),
            });
        },
    };
});

// Import your factory function after environments/mocks are set up
import { buildApp } from "../app.js"; // Adjust path to your file

describe("Fastify App Initialization & Global Routes", () => {
    let app: any;

    beforeEach(async () => {
        // Reset call counts on mocks before each test run
        vi.clearAllMocks();
        app = buildApp();
        await app.ready();
    });

    it("should boot up successfully and expose the health check endpoint", async () => {
        // Inject a simulated HTTP GET request
        const response = await app.inject({
            method: "GET",
            url: "/health",
        });

        expect(response.statusCode).toBe(200);

        const body = JSON.parse(response.payload);
        expect(body).toEqual({
            status: "ok",
            service: "sale-service",
        });
    });

    it("should have registered fastify-sensible decorators (e.g., httpErrors)", () => {
        // Check the main instance decorator provided by fastify-sensible
        expect(app.httpErrors).toBeDefined();
        expect(typeof app.httpErrors.notFound).toBe("function"); // 404 error factory
        expect(typeof app.httpErrors.badRequest).toBe("function"); // 400 error factory
    });

    it("should have registered fastify-jwt decorator", () => {
        expect(app.jwt).toBeDefined();
        expect(typeof app.jwt.sign).toBe("function");
    });
});