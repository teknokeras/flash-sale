import { describe, it, expect, vi, beforeEach } from "vitest";
import fastify, { FastifyReply } from "fastify";
import fastifyJwt from "@fastify/jwt";
import { db, users } from "@flash-sale/db";
import bcrypt from "bcryptjs";
import { authRoutes } from "../auth.js";

// 1. Mock the dependencies
vi.mock("@flash-sale/db", () => {
    const mockSelect = vi.fn();
    const mockFrom = vi.fn();
    const mockWhere = vi.fn();
    const mockLimit = vi.fn();

    // Chain the query builder methods
    mockSelect.mockReturnValue({ from: mockFrom });
    mockFrom.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ limit: mockLimit });

    return {
        db: {
            select: mockSelect,
        },
        users: {
            email: "email_field",
            role: "role_field",
            passwordHash: "passwordHash_field",
        },
    };
});

vi.mock("bcryptjs", () => ({
    default: {
        compare: vi.fn(),
    },
}));

describe("POST /login", () => {
    let app: any;
    // Easily reference our mocked functions in tests
    const mockLimit = db.select().from(users).where(vi.fn() as any).limit as any;

    beforeEach(async () => {
        vi.clearAllMocks();

        // Create a fresh Fastify instance for every test
        app = fastify();

        // Register jwt plugin since your code relies on app.jwt.sign
        await app.register(fastifyJwt, {
            secret: "super-secret-test-key",
        });

        // Mock the reply.unauthorized decorator if you are using fastify-sensible
        app.decorateReply("unauthorized", function (this: FastifyReply, message: string) {
            this.status(401).send({ statusCode: 401, error: "Unauthorized", message });
        });

        // Register your authentication routes
        await app.register(authRoutes);
        await app.ready();
    });

    it("should successfully log in an admin user and return a JWT token", async () => {
        // Arrange: Mock database to return a valid admin user
        const mockUser = {
            id: "user-123",
            name: "Admin Joe",
            email: "admin@example.com",
            role: "admin",
            passwordHash: "$2a$10$hashedpassword...",
        };
        mockLimit.mockResolvedValue([mockUser]);

        // Arrange: Mock bcrypt to verify password successfully
        vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

        // Act: Send injection request to the mock Fastify server
        const response = await app.inject({
            method: "POST",
            url: "/login",
            payload: {
                email: "admin@example.com",
                password: "securepassword123",
            },
        });

        // Assert
        expect(response.statusCode).toBe(200);

        const body = JSON.parse(response.body);
        expect(body).toHaveProperty("token");
        expect(body.user).toEqual({
            id: "user-123",
            name: "Admin Joe",
            role: "admin",
        });
    });

    it("should return 400 Bad Request if email or password are missing or invalid", async () => {
        // Act: Missing fields
        const response = await app.inject({
            method: "POST",
            url: "/login",
            payload: {
                email: "not-an-email", // invalid format based on schema
            },
        });

        // Assert
        expect(response.statusCode).toBe(400);
    });

    it("should return 401 Unauthorized if the user is not found in the database", async () => {
        // Arrange: Database returns empty array (no user matches email + admin role)
        mockLimit.mockResolvedValue([]);

        // Act
        const response = await app.inject({
            method: "POST",
            url: "/login",
            payload: {
                email: "unknown@example.com",
                password: "any-password",
            },
        });

        // Assert
        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.message).toBe("Invalid credentials");
    });

    it("should return 401 Unauthorized if the password does not match", async () => {
        // Arrange: User exists
        const mockUser = {
            id: "user-123",
            name: "Admin Joe",
            email: "admin@example.com",
            role: "admin",
            passwordHash: "$2a$10$hashedpassword...",
        };
        mockLimit.mockResolvedValue([mockUser]);

        // Arrange: Bcrypt password validation fails
        vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

        // Act
        const response = await app.inject({
            method: "POST",
            url: "/login",
            payload: {
                email: "admin@example.com",
                password: "wrongpassword",
            },
        });

        // Assert
        expect(response.statusCode).toBe(401);
        const body = JSON.parse(response.body);
        expect(body.message).toBe("Invalid credentials");
    });
});