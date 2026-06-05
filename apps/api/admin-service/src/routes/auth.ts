import type { FastifyInstance } from "fastify";
import { db, users } from "@flash-sale/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function authRoutes(app: FastifyInstance) {

    // POST /auth/login
    app.post<{ Body: { email: string; password: string } }>(
        "/login",
        {
            schema: {
                body: {
                    type: "object",
                    required: ["email", "password"],
                    properties: {
                        email: { type: "string", format: "email" },
                        password: { type: "string", minLength: 1 },
                    },
                },
            },
        },
        async (request, reply) => {
            const { email, password } = request.body;

            const [user] = await db
                .select()
                .from(users)
                .where(eq(users.email, email))
                .limit(1);

            if (!user) return reply.unauthorized("Invalid credentials");

            const valid = await bcrypt.compare(password, user.passwordHash);
            if (!valid) return reply.unauthorized("Invalid credentials");

            const token = app.jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                { expiresIn: "8h" }
            );

            return reply.send({ token, user: { id: user.id, name: user.name, role: user.role } });
        }
    );
}