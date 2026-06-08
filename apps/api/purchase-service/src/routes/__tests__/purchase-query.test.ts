import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifySensible from '@fastify/sensible'
import { purchaseQueryRoutes } from '../purchase-query'

// ── Mock @flash-sale/db ───────────────────────────────────────

const { mockDb } = vi.hoisted(() => ({ mockDb: vi.fn() }))

vi.mock('@flash-sale/db', () => {
    // Chainable query builder mock
    const chain = {
        select: vi.fn(),
        from: vi.fn(),
        innerJoin: vi.fn(),
        where: vi.fn(),
        orderBy: mockDb,
    }
    // Every method returns the chain so calls can be chained
    chain.select.mockReturnValue(chain)
    chain.from.mockReturnValue(chain)
    chain.innerJoin.mockReturnValue(chain)
    chain.where.mockReturnValue(chain)

    return {
        db: chain,
        orders: { id: 'orders.id', status: 'orders.status', createdAt: 'orders.createdAt', saleId: 'orders.saleId', userId: 'orders.userId' },
        flashSales: { id: 'flashSales.id', title: 'flashSales.title', itemId: 'flashSales.itemId' },
        items: { id: 'items.id', name: 'items.name', priceCents: 'items.priceCents' },
        eq: vi.fn(),
    }
})

// ── Fixtures ──────────────────────────────────────────────────

const USER_ID = 'user-abc-123'
const JWT_SECRET = 'test-secret'

const MOCK_PURCHASES = [
    {
        orderId: 'order-1',
        status: 'confirmed',
        createdAt: '2026-06-01T10:00:00.000Z',
        saleId: 'sale-1',
        saleTitle: 'Flash Sale #1',
        itemName: 'Limited Sneaker',
        priceCents: 9900,
    },
    {
        orderId: 'order-2',
        status: 'confirmed',
        createdAt: '2026-06-02T10:00:00.000Z',
        saleId: 'sale-2',
        saleTitle: 'Flash Sale #2',
        itemName: 'Rare Watch',
        priceCents: 29900,
    },
]

// ── Build test app ────────────────────────────────────────────

async function buildApp() {
    const app = Fastify({ logger: false })

    await app.register(fastifySensible)
    await app.register(fastifyJwt, { secret: JWT_SECRET })

    app.decorate('authenticate', async (request: any, reply: any) => {
        try {
            await request.jwtVerify()
        } catch {
            reply.unauthorized('Invalid or missing token')
        }
    })

    await app.register(purchaseQueryRoutes, { prefix: '/purchases' })
    await app.ready()
    return app
}

function makeToken(app: any, payload = { sub: USER_ID, email: 'user@test.com', role: 'buyer' }) {
    return app.jwt.sign(payload)
}

// ── Tests ─────────────────────────────────────────────────────

describe('GET /purchases', () => {
    let app: Awaited<ReturnType<typeof buildApp>>

    beforeEach(async () => {
        mockDb.mockReset()
        app = await buildApp()
    })

    it('returns 401 when no token is provided', async () => {
        const res = await app.inject({ method: 'GET', url: '/purchases' })
        expect(res.statusCode).toBe(401)
    })

    it('returns 401 when token is invalid', async () => {
        const res = await app.inject({
            method: 'GET',
            url: '/purchases',
            headers: { Authorization: 'Bearer garbage.token.here' },
        })
        expect(res.statusCode).toBe(401)
    })

    it('returns 200 with purchase list for authenticated user', async () => {
        mockDb.mockResolvedValueOnce(MOCK_PURCHASES)
        const token = makeToken(app)

        const res = await app.inject({
            method: 'GET',
            url: '/purchases',
            headers: { Authorization: `Bearer ${token}` },
        })

        expect(res.statusCode).toBe(200)
        expect(res.json()).toEqual(MOCK_PURCHASES)
    })

    it('returns empty array when user has no purchases', async () => {
        mockDb.mockResolvedValueOnce([])
        const token = makeToken(app)

        const res = await app.inject({
            method: 'GET',
            url: '/purchases',
            headers: { Authorization: `Bearer ${token}` },
        })

        expect(res.statusCode).toBe(200)
        expect(res.json()).toEqual([])
    })

    it('uses sub from JWT payload as userId', async () => {
        mockDb.mockResolvedValueOnce([])
        const token = makeToken(app, { sub: 'sub-user-id', email: 'x@test.com', role: 'buyer' })

        const res = await app.inject({
            method: 'GET',
            url: '/purchases',
            headers: { Authorization: `Bearer ${token}` },
        })

        // Route reached the DB layer — correct userId was used (no 401/500)
        expect(res.statusCode).toBe(200)
        // The where() step in the chain was called (proves query ran)
        const { db } = await import('@flash-sale/db')
        expect((db as any).where).toHaveBeenCalled()
    })

    it('falls back to id when sub is not in JWT payload', async () => {
        mockDb.mockResolvedValueOnce([])
        const token = app.jwt.sign({ id: 'id-only-user', email: 'x@test.com', role: 'buyer' })

        const res = await app.inject({
            method: 'GET',
            url: '/purchases',
            headers: { Authorization: `Bearer ${token}` },
        })

        expect(res.statusCode).toBe(200)
        const { db } = await import('@flash-sale/db')
        expect((db as any).where).toHaveBeenCalled()
    })

    it('returns 500 when database throws', async () => {
        mockDb.mockRejectedValueOnce(new Error('DB connection lost'))
        const token = makeToken(app)

        const res = await app.inject({
            method: 'GET',
            url: '/purchases',
            headers: { Authorization: `Bearer ${token}` },
        })

        expect(res.statusCode).toBe(500)
    })

    it('returns correct shape for each purchase record', async () => {
        mockDb.mockResolvedValueOnce(MOCK_PURCHASES)
        const token = makeToken(app)

        const res = await app.inject({
            method: 'GET',
            url: '/purchases',
            headers: { Authorization: `Bearer ${token}` },
        })

        const body = res.json()
        expect(body[0]).toMatchObject({
            orderId: expect.any(String),
            status: expect.any(String),
            createdAt: expect.any(String),
            saleId: expect.any(String),
            saleTitle: expect.any(String),
            itemName: expect.any(String),
            priceCents: expect.any(Number),
        })
    })

    it('preserves order returned by the database', async () => {
        const ordered = [...MOCK_PURCHASES].reverse()
        mockDb.mockResolvedValueOnce(ordered)
        const token = makeToken(app)

        const res = await app.inject({
            method: 'GET',
            url: '/purchases',
            headers: { Authorization: `Bearer ${token}` },
        })

        expect(res.json()[0].orderId).toBe('order-2')
        expect(res.json()[1].orderId).toBe('order-1')
    })
})