import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import fastifySensible from '@fastify/sensible'

// ── Hoist mocks ───────────────────────────────────────────────

const { mockDbSelect, mockDbInsert, mockBcryptHash, mockBcryptCompare, mockJwtSign } = vi.hoisted(() => ({
    mockDbSelect: vi.fn(),
    mockDbInsert: vi.fn(),
    mockBcryptHash: vi.fn(),
    mockBcryptCompare: vi.fn(),
    mockJwtSign: vi.fn(),
}))

vi.mock('@flash-sale/db', () => {
    const selectChain = {
        select: vi.fn(),
        from: vi.fn(),
        where: vi.fn(),
        limit: mockDbSelect,
    }
    selectChain.select.mockReturnValue(selectChain)
    selectChain.from.mockReturnValue(selectChain)
    selectChain.where.mockReturnValue(selectChain)

    const insertChain = {
        insert: vi.fn(),
        values: vi.fn(),
        returning: mockDbInsert,
    }
    insertChain.insert.mockReturnValue(insertChain)
    insertChain.values.mockReturnValue(insertChain)

    return {
        db: { select: selectChain.select, insert: insertChain.insert },
        users: { id: 'users.id', email: 'users.email', name: 'users.name', passwordHash: 'users.passwordHash' },
        eq: vi.fn(),
    }
})

vi.mock('bcryptjs', () => ({
    default: {
        hash: mockBcryptHash,
        compare: mockBcryptCompare,
    },
}))

vi.mock('jsonwebtoken', () => ({
    default: { sign: mockJwtSign },
}))

process.env['JWT_SECRET'] = 'test-jwt-secret'

const { authRoutes } = await import('../auth.js')

// ── Fixtures ──────────────────────────────────────────────────

const VALID_USER = {
    id: 'user-123',
    email: 'buyer@test.com',
    name: 'Test Buyer',
    passwordHash: '$2a$10$hashedpassword',
    role: 'buyer',
}

async function buildApp() {
    const app = Fastify({ logger: false })
    await app.register(fastifySensible)
    await app.register(authRoutes, { prefix: '/auth' })
    await app.ready()
    return app
}

// ── Tests ─────────────────────────────────────────────────────

describe('POST /auth/register', () => {
    let app: Awaited<ReturnType<typeof buildApp>>

    beforeEach(async () => {
        vi.clearAllMocks()
        app = await buildApp()
    })

    const validBody = {
        email: 'newbuyer@test.com',
        password: 'password123',
        name: 'New Buyer',
    }

    // ── Validation ──────────────────────────────────────────

    it('returns 400 when email is invalid', async () => {
        const res = await app.inject({
            method: 'POST', url: '/auth/register',
            payload: { ...validBody, email: 'not-an-email' },
        })
        expect(res.statusCode).toBe(400)
        expect(res.json().error).toBe('Invalid input')
    })

    it('returns 400 when password is less than 8 characters', async () => {
        const res = await app.inject({
            method: 'POST', url: '/auth/register',
            payload: { ...validBody, password: 'short' },
        })
        expect(res.statusCode).toBe(400)
    })

    it('returns 400 when name is empty', async () => {
        const res = await app.inject({
            method: 'POST', url: '/auth/register',
            payload: { ...validBody, name: '' },
        })
        expect(res.statusCode).toBe(400)
    })

    it('returns 400 when body is missing required fields', async () => {
        const res = await app.inject({
            method: 'POST', url: '/auth/register',
            payload: {},
        })
        expect(res.statusCode).toBe(400)
    })

    // ── Duplicate email ─────────────────────────────────────

    it('returns 409 when email is already registered', async () => {
        mockDbSelect.mockResolvedValueOnce([VALID_USER])

        const res = await app.inject({
            method: 'POST', url: '/auth/register',
            payload: validBody,
        })

        expect(res.statusCode).toBe(409)
        expect(res.json()).toMatchObject({ error: 'Email already registered' })
    })

    // ── Happy path ──────────────────────────────────────────

    it('returns 201 with token and user on success', async () => {
        mockDbSelect.mockResolvedValueOnce([])
        mockBcryptHash.mockResolvedValueOnce('$2a$10$hashed')
        mockDbInsert.mockResolvedValueOnce([{ id: 'user-123', email: validBody.email, name: validBody.name }])
        mockJwtSign.mockReturnValueOnce('signed.jwt.token')

        const res = await app.inject({
            method: 'POST', url: '/auth/register',
            payload: validBody,
        })

        expect(res.statusCode).toBe(201)
        expect(res.json()).toMatchObject({
            token: 'signed.jwt.token',
            user: { id: 'user-123', email: validBody.email, name: validBody.name },
        })
    })

    it('hashes the password before storing', async () => {
        mockDbSelect.mockResolvedValueOnce([])
        mockBcryptHash.mockResolvedValueOnce('$2a$10$hashed')
        mockDbInsert.mockResolvedValueOnce([{ id: 'user-123', email: validBody.email, name: validBody.name }])
        mockJwtSign.mockReturnValueOnce('token')

        await app.inject({
            method: 'POST', url: '/auth/register',
            payload: validBody,
        })

        expect(mockBcryptHash).toHaveBeenCalledWith(validBody.password, 10)
    })

    it('signs JWT with sub, email, and buyer role', async () => {
        mockDbSelect.mockResolvedValueOnce([])
        mockBcryptHash.mockResolvedValueOnce('$2a$10$hashed')
        mockDbInsert.mockResolvedValueOnce([{ id: 'user-123', email: validBody.email, name: validBody.name }])
        mockJwtSign.mockReturnValueOnce('token')

        await app.inject({
            method: 'POST', url: '/auth/register',
            payload: validBody,
        })

        expect(mockJwtSign).toHaveBeenCalledWith(
            { sub: 'user-123', email: validBody.email, role: 'buyer' },
            'test-jwt-secret',
            expect.objectContaining({ expiresIn: '8h' })
        )
    })

    it('inserts user with role buyer', async () => {
        mockDbSelect.mockResolvedValueOnce([])
        mockBcryptHash.mockResolvedValueOnce('$2a$10$hashed')
        mockDbInsert.mockResolvedValueOnce([{ id: 'user-123', email: validBody.email, name: validBody.name }])
        mockJwtSign.mockReturnValueOnce('token')

        await app.inject({
            method: 'POST', url: '/auth/register',
            payload: validBody,
        })

        const { db } = await import('@flash-sale/db')
        expect((db as any).insert).toHaveBeenCalled()
    })
})

describe('POST /auth/login', () => {
    let app: Awaited<ReturnType<typeof buildApp>>

    beforeEach(async () => {
        vi.clearAllMocks()
        app = await buildApp()
    })

    const validBody = { email: VALID_USER.email, password: 'password123' }

    // ── Validation ──────────────────────────────────────────

    it('returns 400 when email is invalid', async () => {
        const res = await app.inject({
            method: 'POST', url: '/auth/login',
            payload: { email: 'not-an-email', password: 'password123' },
        })
        expect(res.statusCode).toBe(400)
        expect(res.json().error).toBe('Invalid input')
    })

    it('returns 400 when body is empty', async () => {
        const res = await app.inject({
            method: 'POST', url: '/auth/login',
            payload: {},
        })
        expect(res.statusCode).toBe(400)
    })

    // ── User not found / wrong role ─────────────────────────

    it('returns 401 when user does not exist', async () => {
        mockDbSelect.mockResolvedValueOnce([])

        const res = await app.inject({
            method: 'POST', url: '/auth/login',
            payload: validBody,
        })

        expect(res.statusCode).toBe(401)
        expect(res.json()).toMatchObject({ error: 'Invalid credentials' })
    })

    it('returns 401 when user role is not buyer (admin trying to use buyer login)', async () => {
        mockDbSelect.mockResolvedValueOnce([{ ...VALID_USER, role: 'admin' }])

        const res = await app.inject({
            method: 'POST', url: '/auth/login',
            payload: validBody,
        })

        expect(res.statusCode).toBe(401)
        expect(res.json()).toMatchObject({ error: 'Invalid credentials' })
    })

    // ── Wrong password ──────────────────────────────────────

    it('returns 401 when password is incorrect', async () => {
        mockDbSelect.mockResolvedValueOnce([VALID_USER])
        mockBcryptCompare.mockResolvedValueOnce(false)

        const res = await app.inject({
            method: 'POST', url: '/auth/login',
            payload: { ...validBody, password: 'wrongpassword' },
        })

        expect(res.statusCode).toBe(401)
        expect(res.json()).toMatchObject({ error: 'Invalid credentials' })
    })

    // ── Happy path ──────────────────────────────────────────

    it('returns 200 with token and user on success', async () => {
        mockDbSelect.mockResolvedValueOnce([VALID_USER])
        mockBcryptCompare.mockResolvedValueOnce(true)
        mockJwtSign.mockReturnValueOnce('signed.jwt.token')

        const res = await app.inject({
            method: 'POST', url: '/auth/login',
            payload: validBody,
        })

        expect(res.statusCode).toBe(200)
        expect(res.json()).toMatchObject({
            token: 'signed.jwt.token',
            user: { id: VALID_USER.id, email: VALID_USER.email, name: VALID_USER.name },
        })
    })

    it('compares password against stored hash', async () => {
        mockDbSelect.mockResolvedValueOnce([VALID_USER])
        mockBcryptCompare.mockResolvedValueOnce(true)
        mockJwtSign.mockReturnValueOnce('token')

        await app.inject({
            method: 'POST', url: '/auth/login',
            payload: validBody,
        })

        expect(mockBcryptCompare).toHaveBeenCalledWith(validBody.password, VALID_USER.passwordHash)
    })

    it('signs JWT with sub, email, and buyer role', async () => {
        mockDbSelect.mockResolvedValueOnce([VALID_USER])
        mockBcryptCompare.mockResolvedValueOnce(true)
        mockJwtSign.mockReturnValueOnce('token')

        await app.inject({
            method: 'POST', url: '/auth/login',
            payload: validBody,
        })

        expect(mockJwtSign).toHaveBeenCalledWith(
            { sub: VALID_USER.id, email: VALID_USER.email, role: 'buyer' },
            'test-jwt-secret',
            expect.objectContaining({ expiresIn: '8h' })
        )
    })

    it('does not return passwordHash in response', async () => {
        mockDbSelect.mockResolvedValueOnce([VALID_USER])
        mockBcryptCompare.mockResolvedValueOnce(true)
        mockJwtSign.mockReturnValueOnce('token')

        const res = await app.inject({
            method: 'POST', url: '/auth/login',
            payload: validBody,
        })

        expect(JSON.stringify(res.json())).not.toContain('passwordHash')
    })
})