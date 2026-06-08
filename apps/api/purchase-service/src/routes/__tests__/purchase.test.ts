import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifySensible from '@fastify/sensible'

// ── Hoist all mocks ───────────────────────────────────────────

const {
    mockIsSaleOpen,
    mockClaimPurchaseSlot,
    mockReleasePurchaseSlot,
    mockAtomicDecrement,
    mockIncrementInventory,
    mockSqsSend,
} = vi.hoisted(() => ({
    mockIsSaleOpen: vi.fn(),
    mockClaimPurchaseSlot: vi.fn(),
    mockReleasePurchaseSlot: vi.fn(),
    mockAtomicDecrement: vi.fn(),
    mockIncrementInventory: vi.fn(),
    mockSqsSend: vi.fn(),
}))

vi.mock('../../lib/redis-lua.js', () => ({
    isSaleOpen: mockIsSaleOpen,
    atomicDecrementInventory: mockAtomicDecrement,
    incrementInventory: mockIncrementInventory,
}))

vi.mock('../../lib/dynamo.js', () => ({
    claimPurchaseSlot: mockClaimPurchaseSlot,
    releasePurchaseSlot: mockReleasePurchaseSlot,
}))

vi.mock('@aws-sdk/client-sqs', () => ({
    SQSClient: vi.fn().mockImplementation(() => ({ send: mockSqsSend })),
    SendMessageCommand: vi.fn().mockImplementation((input) => ({ input })),
}))

// Import AFTER mocks
const { purchaseRoutes } = await import('../purchase.js')

// ── Fixtures ──────────────────────────────────────────────────

const JWT_SECRET = 'test-secret'
const SALE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const USER_ID = 'user-abc-123'

// ── Build test app ────────────────────────────────────────────

async function buildApp() {
    const app = Fastify({ logger: false })

    await app.register(fastifySensible)
    await app.register(fastifyJwt, { secret: JWT_SECRET })

    // Mock Redis on the app instance
    app.decorate('redis', { eval: vi.fn(), get: vi.fn(), incr: vi.fn() })

    app.decorate('authenticate', async (request: any, reply: any) => {
        try {
            await request.jwtVerify()
        } catch {
            reply.unauthorized('Invalid or missing token')
        }
    })

    await app.register(purchaseRoutes, { prefix: '/purchase' })
    await app.ready()
    return app
}

function makeToken(app: any, payload = { sub: USER_ID, email: 'user@test.com', role: 'buyer' }) {
    return app.jwt.sign(payload)
}

function authHeader(token: string) {
    return { Authorization: `Bearer ${token}` }
}

// ── Tests ─────────────────────────────────────────────────────

describe('POST /purchase', () => {
    let app: Awaited<ReturnType<typeof buildApp>>
    let token: string

    beforeEach(async () => {
        vi.clearAllMocks()
        app = await buildApp()
        token = makeToken(app)
    })

    // ── Auth ──────────────────────────────────────────────────

    describe('authentication', () => {
        it('returns 401 with no token', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/purchase',
                payload: { saleId: SALE_ID },
            })
            expect(res.statusCode).toBe(401)
        })

        it('returns 401 with invalid token', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader('bad.token.here'),
                payload: { saleId: SALE_ID },
            })
            expect(res.statusCode).toBe(401)
        })
    })

    // ── Schema validation ─────────────────────────────────────

    describe('schema validation', () => {
        it('returns 400 when saleId is missing', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: {},
            })
            expect(res.statusCode).toBe(400)
        })

        it('returns 400 when saleId is not a UUID', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: { saleId: 'not-a-uuid' },
            })
            expect(res.statusCode).toBe(400)
        })
    })

    // ── Guard 1: Sale open check ──────────────────────────────

    describe('Guard 1 — sale open check', () => {
        it('returns 409 SaleNotActive when sale is closed', async () => {
            mockIsSaleOpen.mockResolvedValueOnce(false)

            const res = await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: { saleId: SALE_ID },
            })

            expect(res.statusCode).toBe(409)
            expect(res.json()).toMatchObject({ error: 'SaleNotActive' })
        })

        it('does not call claimPurchaseSlot when sale is closed', async () => {
            mockIsSaleOpen.mockResolvedValueOnce(false)

            await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: { saleId: SALE_ID },
            })

            expect(mockClaimPurchaseSlot).not.toHaveBeenCalled()
        })
    })

    // ── Guard 2: DynamoDB dedup ───────────────────────────────

    describe('Guard 2 — DynamoDB dedup', () => {
        it('returns 409 AlreadyPurchased when user already bought', async () => {
            mockIsSaleOpen.mockResolvedValueOnce(true)
            mockClaimPurchaseSlot.mockResolvedValueOnce(false)

            const res = await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: { saleId: SALE_ID },
            })

            expect(res.statusCode).toBe(409)
            expect(res.json()).toMatchObject({ error: 'AlreadyPurchased' })
        })

        it('does not decrement inventory when user already bought', async () => {
            mockIsSaleOpen.mockResolvedValueOnce(true)
            mockClaimPurchaseSlot.mockResolvedValueOnce(false)

            await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: { saleId: SALE_ID },
            })

            expect(mockAtomicDecrement).not.toHaveBeenCalled()
        })
    })

    // ── Guard 3: Inventory check ──────────────────────────────

    describe('Guard 3 — inventory check', () => {
        it('returns 410 SoldOut when inventory is 0', async () => {
            mockIsSaleOpen.mockResolvedValueOnce(true)
            mockClaimPurchaseSlot.mockResolvedValueOnce(true)
            mockAtomicDecrement.mockResolvedValueOnce({ success: false, remaining: 0 })

            const res = await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: { saleId: SALE_ID },
            })

            expect(res.statusCode).toBe(410)
            expect(res.json()).toMatchObject({ error: 'SoldOut' })
        })

        it('rolls back DynamoDB slot when sold out', async () => {
            mockIsSaleOpen.mockResolvedValueOnce(true)
            mockClaimPurchaseSlot.mockResolvedValueOnce(true)
            mockAtomicDecrement.mockResolvedValueOnce({ success: false, remaining: 0 })

            await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: { saleId: SALE_ID },
            })

            expect(mockReleasePurchaseSlot).toHaveBeenCalledWith(USER_ID, SALE_ID)
        })

        it('does not enqueue SQS message when sold out', async () => {
            mockIsSaleOpen.mockResolvedValueOnce(true)
            mockClaimPurchaseSlot.mockResolvedValueOnce(true)
            mockAtomicDecrement.mockResolvedValueOnce({ success: false, remaining: 0 })

            await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: { saleId: SALE_ID },
            })

            expect(mockSqsSend).not.toHaveBeenCalled()
        })
    })

    // ── Guard 4: SQS enqueue ──────────────────────────────────

    describe('Guard 4 — SQS enqueue failure', () => {
        it('returns 500 when SQS throws', async () => {
            mockIsSaleOpen.mockResolvedValueOnce(true)
            mockClaimPurchaseSlot.mockResolvedValueOnce(true)
            mockAtomicDecrement.mockResolvedValueOnce({ success: true, remaining: 4 })
            mockSqsSend.mockRejectedValueOnce(new Error('SQS unavailable'))

            const res = await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: { saleId: SALE_ID },
            })

            expect(res.statusCode).toBe(500)
        })

        it('rolls back DynamoDB when SQS fails', async () => {
            mockIsSaleOpen.mockResolvedValueOnce(true)
            mockClaimPurchaseSlot.mockResolvedValueOnce(true)
            mockAtomicDecrement.mockResolvedValueOnce({ success: true, remaining: 4 })
            mockSqsSend.mockRejectedValueOnce(new Error('SQS unavailable'))

            await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: { saleId: SALE_ID },
            })

            expect(mockReleasePurchaseSlot).toHaveBeenCalledWith(USER_ID, SALE_ID)
        })

        it('rolls back Redis inventory when SQS fails', async () => {
            mockIsSaleOpen.mockResolvedValueOnce(true)
            mockClaimPurchaseSlot.mockResolvedValueOnce(true)
            mockAtomicDecrement.mockResolvedValueOnce({ success: true, remaining: 4 })
            mockSqsSend.mockRejectedValueOnce(new Error('SQS unavailable'))

            await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: { saleId: SALE_ID },
            })

            expect(mockIncrementInventory).toHaveBeenCalled()
        })
    })

    // ── Happy path ────────────────────────────────────────────

    describe('happy path', () => {
        beforeEach(() => {
            mockIsSaleOpen.mockResolvedValue(true)
            mockClaimPurchaseSlot.mockResolvedValue(true)
            mockAtomicDecrement.mockResolvedValue({ success: true, remaining: 4 })
            mockSqsSend.mockResolvedValue({ MessageId: 'msg-123' })
        })

        it('returns 202 on successful purchase', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: { saleId: SALE_ID },
            })

            expect(res.statusCode).toBe(202)
        })

        it('returns reserved status and remaining count', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: { saleId: SALE_ID },
            })

            expect(res.json()).toMatchObject({
                status: 'reserved',
                message: expect.any(String),
                requestId: expect.any(String),
                remaining: 4,
            })
        })

        it('returns a valid UUID as requestId', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: { saleId: SALE_ID },
            })

            const { requestId } = res.json()
            expect(requestId).toMatch(
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
            )
        })

        it('calls all 4 guards in order', async () => {
            const order: string[] = []
            mockIsSaleOpen.mockImplementationOnce(async () => { order.push('isSaleOpen'); return true })
            mockClaimPurchaseSlot.mockImplementationOnce(async () => { order.push('claimSlot'); return true })
            mockAtomicDecrement.mockImplementationOnce(async () => { order.push('decrement'); return { success: true, remaining: 3 } })
            mockSqsSend.mockImplementationOnce(async () => { order.push('sqs'); return {} })

            await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: { saleId: SALE_ID },
            })

            expect(order).toEqual(['isSaleOpen', 'claimSlot', 'decrement', 'sqs'])
        })

        it('uses sub from JWT as userId when present', async () => {
            const token = makeToken(app, { sub: 'sub-user', email: 'x@test.com', role: 'buyer' })

            await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: { saleId: SALE_ID },
            })

            expect(mockClaimPurchaseSlot).toHaveBeenCalledWith('sub-user', SALE_ID, expect.any(String))
        })

        it('does not call releasePurchaseSlot on success', async () => {
            await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: { saleId: SALE_ID },
            })

            expect(mockReleasePurchaseSlot).not.toHaveBeenCalled()
        })

        it('does not call incrementInventory on success', async () => {
            await app.inject({
                method: 'POST',
                url: '/purchase',
                headers: authHeader(token),
                payload: { saleId: SALE_ID },
            })

            expect(mockIncrementInventory).not.toHaveBeenCalled()
        })
    })
})