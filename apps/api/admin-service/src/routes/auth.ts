import type { FastifyInstance } from "fastify";
import { db, users } from "@flash-sale/db";
import { asc } from "drizzle-orm"; // Import asc for sorting
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

            // 1. Get the absolute first created record in the entire users table
            const [firstUser] = await db
                .select()
                .from(users)
                .orderBy(asc(users.createdAt)) // Sort entire table by oldest first
                .limit(1);

            // 2. Reject if the table is completely empty
            if (!firstUser) {
                return reply.unauthorized("Invalid credentials");
            }

            // 3. Check if the provided email matches this specific record's email
            if (firstUser.email !== email) {
                return reply.unauthorized("Invalid credentials");
            }

            // 4. Check if the provided password matches this specific record's hash
            const valid = await bcrypt.compare(password, firstUser.passwordHash);
            if (!valid) {
                return reply.unauthorized("Invalid credentials");
            }

            // 5. If everything matches, generate token and authorize
            const token = app.jwt.sign(
                { id: firstUser.id, email: firstUser.email, role: firstUser.role },
                { expiresIn: "8h" }
            );

            return reply.send({
                token,
                user: { id: firstUser.id, name: firstUser.name, role: firstUser.role }
            });
        }
    );
}