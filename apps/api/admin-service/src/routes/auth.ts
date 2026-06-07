import type { FastifyInstance } from "fastify";
import { db, users } from "@flash-sale/db";
import { eq, and } from "drizzle-orm"; // 👈 Imported 'and' for combining query conditions
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

            // 1. Fetch user matching BOTH the email and the admin role
            const [user] = await db
                .select()
                .from(users)
                .where(
                    and(
                        eq(users.email, email),
                        eq(users.role, "admin") // 👈 Enforces admin role check in the query
                    )
                )
                .limit(1);

            // 2. If no user is found with that email OR they aren't an admin, reject safely
            if (!user) return reply.unauthorized("Invalid credentials");

            // 3. Verify the password hash
            const valid = await bcrypt.compare(password, user.passwordHash);
            if (!valid) return reply.unauthorized("Invalid credentials");

            // 4. Generate token and return data
            const token = app.jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                { expiresIn: "8h" }
            );

            return reply.send({ token, user: { id: user.id, name: user.name, role: user.role } });
        }
    );
}