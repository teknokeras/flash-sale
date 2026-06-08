import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import fastifySensible from '@fastify/sensible'

// ── Hoist mocks ───────────────────────────────────────────────

const { mockDbExecute, mockRedisGet, mockRedisSet } = vi.hoisted(() => ({
    mockDbExecute: vi.fn(),
    mockRedisGet: vi.fn(),
    mockRedisSet: vi.fn(),
}))

vi.mock('@flash-sale/db', () => ({
    db: { execute: mockDbExecute },
    sql: (strings: TemplateStringsArray, ...values: any[]) => ({ strings, values }), // passthrough
}))

vi.mock('drizzle-orm', () => ({
    sql: (strings: TemplateStringsArray, ...values: any[]) => ({ strings, values }),
}))

const { salesRoutes } = await import('../sales.js')

// ── Fixtures ──────────────────────────────────────────────────

const SALE_ID = 'sale-abc-123'
const ITEM_ID = 'item-xyz-456'

const MOCK_ACTIVE_SALE = {
    id: SALE_ID,
    itemId: ITEM_ID,
    title: 'Flash Sale #1',
    startsAt: '2026-06-01T10:00:00.000Z',
    endsAt: '2026-06-01T11:00:00.000Z',
    status: 'active',
    initialQuantity: '10',
    priceCents: '9900',
}

const MOCK_SCHEDULED_SALE = {
    id: 'sale-next-789',
    title: 'Upcoming Sale',
    startsAt: '2026-06-10T10:00:00.000Z',
    endsAt: '2026-06-10T11:00:00.000Z',
    status: 'scheduled',
}

const MOCK_ITEM = {
    id: ITEM_ID,
    name: 'Limited Sneaker',
    description: 'Only 10 available',
    priceCents: 9900,
    imageUrls: [],
}

// ── Build test app ────────────────────────────────────────────

async function buildApp() {
    const app = Fastify({ logger: false })
    await app.register(fastifySensible)

    // Mock Redis on the app instance
    app.decorate('redis', {
        get: mockRedisGet,
        set: mockRedisSet,
    })

    await app.register(salesRoutes, { prefix: '/sales' })
    await app.ready()
    return app
}

// ── Tests ─────────────────────────────────────────────────────

describe('GET /sales/active', () => {
    let app: Awaited<ReturnType<typeof buildApp>>

    beforeEach(async () => {
        vi.clearAllMocks()
        app = await buildApp()
    })

    // ── No active sale ────────────────────────────────────────

    describe('when no active sale exists', () => {
        it('returns active: false with next scheduled sale', async () => {
            mockDbExecute
                .mockResolvedValueOnce([])                    // active sale query → empty
                .mockResolvedValueOnce([MOCK_SCHEDULED_SALE]) // next scheduled query

            const res = await app.inject({ method: 'GET', url: '/sales/active' })

            expect(res.statusCode).toBe(200)
            expect(res.json()).toMatchObject({
                active: false,
                nextSale: MOCK_SCHEDULED_SALE,
            })
        })

        it('returns active: false with null nextSale when no upcoming sale', async () => {
            mockDbExecute
                .mockResolvedValueOnce([])  // active → empty
                .mockResolvedValueOnce([])  // next → empty

            const res = await app.inject({ method: 'GET', url: '/sales/active' })

            expect(res.statusCode).toBe(200)
            expect(res.json()).toMatchObject({ active: false, nextSale: null })
        })

        it('handles rows wrapper response shape from DB', async () => {
            mockDbExecute
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [MOCK_SCHEDULED_SALE] })

            const res = await app.inject({ method: 'GET', url: '/sales/active' })

            expect(res.statusCode).toBe(200)
            expect(res.json().active).toBe(false)
        })
    })

    // ── Active sale — item from Redis cache ───────────────────

    describe('when active sale exists with cached item', () => {
        it('returns active: true with sale and cached item', async () => {
            mockDbExecute.mockResolvedValueOnce([MOCK_ACTIVE_SALE])
            mockRedisGet
                .mockResolvedValueOnce('7')                        // qty key
                .mockResolvedValueOnce(JSON.stringify(MOCK_ITEM))  // item cache key

            const res = await app.inject({ method: 'GET', url: '/sales/active' })

            expect(res.statusCode).toBe(200)
            expect(res.json()).toMatchObject({
                active: true,
                sale: expect.objectContaining({ id: SALE_ID, remainingQty: 7 }),
                item: MOCK_ITEM,
            })
        })

        it('does not call db.execute for item when cache hit', async () => {
            mockDbExecute.mockResolvedValueOnce([MOCK_ACTIVE_SALE])
            mockRedisGet
                .mockResolvedValueOnce('5')
                .mockResolvedValueOnce(JSON.stringify(MOCK_ITEM))

            await app.inject({ method: 'GET', url: '/sales/active' })

            // Only 1 execute call (for the active sale query) — item came from cache
            expect(mockDbExecute).toHaveBeenCalledTimes(1)
        })

        it('parses remainingQty as integer from Redis', async () => {
            mockDbExecute.mockResolvedValueOnce([MOCK_ACTIVE_SALE])
            mockRedisGet
                .mockResolvedValueOnce('42')
                .mockResolvedValueOnce(JSON.stringify(MOCK_ITEM))

            const res = await app.inject({ method: 'GET', url: '/sales/active' })

            expect(res.json().sale.remainingQty).toBe(42)
            expect(typeof res.json().sale.remainingQty).toBe('number')
        })
    })

    // ── Active sale — item from DB (cache miss) ───────────────

    describe('when active sale exists with cache miss', () => {
        it('fetches item from DB and caches it', async () => {
            mockDbExecute
                .mockResolvedValueOnce([MOCK_ACTIVE_SALE]) // sale query
                .mockResolvedValueOnce([MOCK_ITEM])         // item query
            mockRedisGet
                .mockResolvedValueOnce('3')   // qty
                .mockResolvedValueOnce(null)  // item cache miss
            mockRedisSet.mockResolvedValueOnce('OK')

            const res = await app.inject({ method: 'GET', url: '/sales/active' })

            expect(res.statusCode).toBe(200)
            expect(res.json().item).toMatchObject({ id: ITEM_ID })
            expect(mockRedisSet).toHaveBeenCalledWith(
                `sale:${SALE_ID}:info`,
                JSON.stringify(MOCK_ITEM),
                'EX',
                60
            )
        })

        it('returns item: null when item not found in DB', async () => {
            mockDbExecute
                .mockResolvedValueOnce([MOCK_ACTIVE_SALE])
                .mockResolvedValueOnce([]) // item not found
            mockRedisGet
                .mockResolvedValueOnce('5')
                .mockResolvedValueOnce(null)

            const res = await app.inject({ method: 'GET', url: '/sales/active' })

            expect(res.json().item).toBeNull()
        })

        it('returns remainingQty: 0 when qty key missing from Redis', async () => {
            mockDbExecute
                .mockResolvedValueOnce([MOCK_ACTIVE_SALE])
                .mockResolvedValueOnce([MOCK_ITEM])
            mockRedisGet
                .mockResolvedValueOnce(null)  // qty key missing
                .mockResolvedValueOnce(null)  // item cache miss

            const res = await app.inject({ method: 'GET', url: '/sales/active' })

            expect(res.json().sale.remainingQty).toBe(0)
        })
    })

    // ── Numeric coercion ──────────────────────────────────────

    describe('numeric coercion', () => {
        it('coerces initialQuantity and priceCents to numbers', async () => {
            mockDbExecute.mockResolvedValueOnce([MOCK_ACTIVE_SALE]) // DB returns strings
            mockRedisGet
                .mockResolvedValueOnce('5')
                .mockResolvedValueOnce(JSON.stringify(MOCK_ITEM))

            const res = await app.inject({ method: 'GET', url: '/sales/active' })
            const { sale } = res.json()

            expect(typeof sale.initialQuantity).toBe('number')
            expect(typeof sale.priceCents).toBe('number')
            expect(sale.initialQuantity).toBe(10)
            expect(sale.priceCents).toBe(9900)
        })
    })
})

// ── GET /sales/:id ────────────────────────────────────────────

describe('GET /sales/:id', () => {
    let app: Awaited<ReturnType<typeof buildApp>>

    beforeEach(async () => {
        vi.clearAllMocks()
        app = await buildApp()
    })

    it('returns 404 when sale not found', async () => {
        mockDbExecute.mockResolvedValueOnce([])

        const res = await app.inject({ method: 'GET', url: `/sales/${SALE_ID}` })

        expect(res.statusCode).toBe(404)
    })

    it('returns 200 with sale and item', async () => {
        mockDbExecute
            .mockResolvedValueOnce([MOCK_ACTIVE_SALE])
            .mockResolvedValueOnce([MOCK_ITEM])
        mockRedisGet.mockResolvedValueOnce('8')

        const res = await app.inject({ method: 'GET', url: `/sales/${SALE_ID}` })

        expect(res.statusCode).toBe(200)
        expect(res.json()).toMatchObject({
            sale: expect.objectContaining({ id: SALE_ID }),
            item: expect.objectContaining({ id: ITEM_ID }),
            remainingQty: 8,
        })
    })

    it('returns remainingQty: null when qty key missing from Redis', async () => {
        mockDbExecute
            .mockResolvedValueOnce([MOCK_ACTIVE_SALE])
            .mockResolvedValueOnce([MOCK_ITEM])
        mockRedisGet.mockResolvedValueOnce(null)

        const res = await app.inject({ method: 'GET', url: `/sales/${SALE_ID}` })

        expect(res.json().remainingQty).toBeNull()
    })

    it('returns item: null when sale has no itemId', async () => {
        mockDbExecute.mockResolvedValueOnce([{ ...MOCK_ACTIVE_SALE, itemId: null }])
        mockRedisGet.mockResolvedValueOnce('5')

        const res = await app.inject({ method: 'GET', url: `/sales/${SALE_ID}` })

        expect(res.json().item).toBeNull()
    })

    it('coerces initialQuantity and priceCents to numbers', async () => {
        mockDbExecute
            .mockResolvedValueOnce([MOCK_ACTIVE_SALE])
            .mockResolvedValueOnce([MOCK_ITEM])
        mockRedisGet.mockResolvedValueOnce('3')

        const res = await app.inject({ method: 'GET', url: `/sales/${SALE_ID}` })
        const { sale } = res.json()

        expect(typeof sale.initialQuantity).toBe('number')
        expect(typeof sale.priceCents).toBe('number')
    })

    it('handles rows wrapper response shape from DB', async () => {
        mockDbExecute
            .mockResolvedValueOnce({ rows: [MOCK_ACTIVE_SALE] })
            .mockResolvedValueOnce({ rows: [MOCK_ITEM] })
        mockRedisGet.mockResolvedValueOnce('2')

        const res = await app.inject({ method: 'GET', url: `/sales/${SALE_ID}` })

        expect(res.statusCode).toBe(200)
        expect(res.json().sale.id).toBe(SALE_ID)
    })
})