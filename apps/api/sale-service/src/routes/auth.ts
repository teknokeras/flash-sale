import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { db } from '@flash-sale/db'
import { users } from '@flash-sale/db'
import { eq } from 'drizzle-orm'

const registerSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1),
})

const loginSchema = z.object({
    email: z.string().email(),
    password: z.string(),
})

export async function authRoutes(app: FastifyInstance) {
    // POST /auth/register
    app.post('/register', async (req, reply) => {
        const body = registerSchema.safeParse(req.body)
        if (!body.success) {
            return reply.status(400).send({ error: 'Invalid input', details: body.error.flatten() })
        }

        const { email, password, name } = body.data

        const existing = await db.select().from(users).where(eq(users.email, email)).limit(1)
        if (existing.length > 0) {
            return reply.status(409).send({ error: 'Email already registered' })
        }

        const passwordHash = await bcrypt.hash(password, 10)

        const [user] = await db
            .insert(users)
            .values({ email, passwordHash, name, role: 'buyer' })
            .returning({ id: users.id, email: users.email, name: users.name })

        const token = jwt.sign(
            { sub: user.id, email: user.email, role: 'buyer' },
            process.env.JWT_SECRET!,
            { expiresIn: '8h' }
        )

        return reply.status(201).send({ token, user })
    })

    // POST /auth/login
    app.post('/login', async (req, reply) => {
        const body = loginSchema.safeParse(req.body)
        if (!body.success) {
            return reply.status(400).send({ error: 'Invalid input' })
        }

        const { email, password } = body.data

        const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1)
        if (!user || user.role !== 'buyer') {
            return reply.status(401).send({ error: 'Invalid credentials' })
        }

        const valid = await bcrypt.compare(password, user.passwordHash)
        if (!valid) {
            return reply.status(401).send({ error: 'Invalid credentials' })
        }

        const token = jwt.sign(
            { sub: user.id, email: user.email, role: 'buyer' },
            process.env.JWT_SECRET!,
            { expiresIn: '8h' }
        )

        return reply.send({ token, user: { id: user.id, email: user.email, name: user.name } })
    })
}