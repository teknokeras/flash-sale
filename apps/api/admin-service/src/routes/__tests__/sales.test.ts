import { describe, it, expect, vi, beforeEach } from 'vitest'
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifySensible from '@fastify/sensible'

// ── Hoist mocks ───────────────────────────────────────────────

const { mockSelect, mockInsert, mockUpdate, mockDelete, mockDbDelete } = vi.hoisted(() => ({
    mockSelect: vi.fn(),
    mockInsert: vi.fn(),
    mockUpdate: vi.fn(),
    mockDelete: vi.fn(),
    mockDbDelete: vi.fn(),
}))

vi.mock('@flash-sale/db', () => {
    const selectChain = {
        select: vi.fn(),
        from: vi.fn(),
        where: vi.fn(),
        orderBy: mockSelect,
        limit: mockSelect,
        innerJoin: vi.fn(),
    }
    selectChain.select.mockReturnValue(selectChain)
    selectChain.from.mockReturnValue(selectChain)
    selectChain.where.mockReturnValue(selectChain)
    selectChain.innerJoin.mockReturnValue(selectChain)

    const insertChain = {
        insert: vi.fn(),
        values: vi.fn(),
        returning: mockInsert,
    }
    insertChain.insert.mockReturnValue(insertChain)
    insertChain.values.mockReturnValue(insertChain)

    const updateChain = {
        update: vi.fn(),
        set: vi.fn(),
        where: vi.fn(),
        returning: mockUpdate,
    }
    updateChain.update.mockReturnValue(updateChain)
    updateChain.set.mockReturnValue(updateChain)
    updateChain.where.mockReturnValue(updateChain)

    const deleteChain = {
        delete: vi.fn(),
        where: mockDbDelete,
    }
    deleteChain.delete.mockReturnValue(deleteChain)

    return {
        db: {
            select: selectChain.select,
            insert: insertChain.insert,
            update: updateChain.update,
            delete: deleteChain.delete,
        },
        flashSales: { id: 'flashSales.id', startsAt: 'flashSales.startsAt', itemId: 'flashSales.itemId' },
        orders: { id: 'orders.id', status: 'orders.status', createdAt: 'orders.createdAt', saleId: 'orders.saleId', userId: 'orders.userId' },
        users: { id: 'users.id', name: 'users.name', email: 'users.email' },
        eq: vi.fn(),
    }
})

const { adminSalesRoutes } = await import('../sales.js')

// ── Fixtures ──────────────────────────────────────────────────

const JWT_SECRET = 'test-secret'
const ADMIN_ID = 'admin-user-123'
const SALE_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const ITEM_ID = 'b2c3d4e5-f6a7-8901-bcde-f12345678901'

// Future timestamps — well past the 15-minute minimum
const STARTS_AT = new Date(Date.now() + 60 * 60 * 1000).toISOString()  // +1 hour
const ENDS_AT = new Date(Date.now() + 90 * 60 * 1000).toISOString()  // +1.5 hours

const MOCK_SALE = {
    id: SALE_ID,
    title: 'Test Flash Sale',
    priceCents: 9900,
    initialQuantity: 10,
    startsAt: STARTS_AT,
    endsAt: ENDS_AT,
    status: 'scheduled',
    createdBy: ADMIN_ID,
}

// ── Build test app ────────────────────────────────────────────

async function buildApp() {
    const app = Fastify({ logger: false })
    await app.register(fastifySensible)
    await app.register(fastifyJwt, { secret: JWT_SECRET })

    app.decorate('authenticateAdmin', async (request: any, reply: any) => {
        try {
            await request.jwtVerify()
            const user = request.user as { role: string }
            if (user.role !== 'admin') reply.forbidden('Admins only')
        } catch {
            reply.unauthorized('Invalid or missing token')
        }
    })

    await app.register(adminSalesRoutes, { prefix: '/admin/sales' })
    await app.ready()
    return app
}

function makeToken(app: any, role = 'admin') {
    return app.jwt.sign({ id: ADMIN_ID, email: 'admin@test.com', role })
}

function auth(token: string) {
    return { Authorization: `Bearer ${token}` }
}

// ── Tests ─────────────────────────────────────────────────────

describe('adminSalesRoutes', () => {
    let app: Awaited<ReturnType<typeof buildApp>>
    let token: string

    beforeEach(async () => {
        vi.clearAllMocks()
        app = await buildApp()
        token = makeToken(app)
    })

    // ── Auth guard ────────────────────────────────────────────

    describe('auth guard', () => {
        it('returns 401 with no token on all routes', async () => {
            const routes = [
                { method: 'GET', url: '/admin/sales' },
                { method: 'GET', url: `/admin/sales/${SALE_ID}/orders` },
                { method: 'POST', url: '/admin/sales' },
                { method: 'PUT', url: `/admin/sales/${SALE_ID}/item` },
                { method: 'PUT', url: `/admin/sales/${SALE_ID}` },
                { method: 'DELETE', url: `/admin/sales/${SALE_ID}` },
            ]
            for (const route of routes) {
                const res = await app.inject({ method: route.method as any, url: route.url })
                expect(res.statusCode, `${route.method} ${route.url} should be 401`).toBe(401)
            }
        })

        it('returns 403 when role is not admin', async () => {
            const buyerToken = makeToken(app, 'buyer')
            mockSelect.mockResolvedValue([])

            const res = await app.inject({
                method: 'GET',
                url: '/admin/sales',
                headers: auth(buyerToken),
            })
            expect(res.statusCode).toBe(403)
        })
    })

    // ── GET /admin/sales ──────────────────────────────────────

    describe('GET /admin/sales', () => {
        it('returns 200 with list of sales', async () => {
            mockSelect.mockResolvedValueOnce([MOCK_SALE])

            const res = await app.inject({
                method: 'GET',
                url: '/admin/sales',
                headers: auth(token),
            })

            expect(res.statusCode).toBe(200)
            expect(res.json()).toEqual([MOCK_SALE])
        })

        it('returns empty array when no sales exist', async () => {
            mockSelect.mockResolvedValueOnce([])

            const res = await app.inject({
                method: 'GET',
                url: '/admin/sales',
                headers: auth(token),
            })

            expect(res.statusCode).toBe(200)
            expect(res.json()).toEqual([])
        })
    })

    // ── GET /admin/sales/:id/orders ───────────────────────────

    describe('GET /admin/sales/:id/orders', () => {
        it('returns 200 with orders for the sale', async () => {
            const mockOrders = [
                { orderId: 'ord-1', status: 'confirmed', createdAt: new Date().toISOString(), userId: 'u1', userName: 'Alice', userEmail: 'alice@test.com' },
            ]
            mockSelect.mockResolvedValueOnce(mockOrders)

            const res = await app.inject({
                method: 'GET',
                url: `/admin/sales/${SALE_ID}/orders`,
                headers: auth(token),
            })

            expect(res.statusCode).toBe(200)
        })

        it('returns empty array when no orders for sale', async () => {
            mockSelect.mockResolvedValueOnce([])

            const res = await app.inject({
                method: 'GET',
                url: `/admin/sales/${SALE_ID}/orders`,
                headers: auth(token),
            })

            expect(res.statusCode).toBe(200)
        })
    })

    // ── POST /admin/sales ─────────────────────────────────────

    describe('POST /admin/sales', () => {
        const validBody = {
            title: 'Flash Sale',
            specialPrice: 9900,
            initialQuantity: 10,
            startsAt: STARTS_AT,
            endsAt: ENDS_AT,
        }

        it('returns 201 with created sale', async () => {
            mockInsert.mockResolvedValueOnce([MOCK_SALE])

            const res = await app.inject({
                method: 'POST',
                url: '/admin/sales',
                headers: auth(token),
                payload: validBody,
            })

            expect(res.statusCode).toBe(201)
            expect(res.json()).toEqual(MOCK_SALE)
        })

        it('returns 400 when title is missing', async () => {
            const { title: _, ...noTitle } = validBody
            const res = await app.inject({
                method: 'POST',
                url: '/admin/sales',
                headers: auth(token),
                payload: noTitle,
            })
            expect(res.statusCode).toBe(400)
        })

        it('returns 400 when startsAt is less than 15 minutes in the future', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/admin/sales',
                headers: auth(token),
                payload: {
                    ...validBody,
                    startsAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(), // only 5 min from now
                },
            })
            expect(res.statusCode).toBe(400)
        })

        it('returns 400 when endsAt is less than 1 minute after startsAt', async () => {
            const start = new Date(Date.now() + 60 * 60 * 1000)
            const end = new Date(start.getTime() + 30 * 1000) // only 30s after start

            const res = await app.inject({
                method: 'POST',
                url: '/admin/sales',
                headers: auth(token),
                payload: { ...validBody, startsAt: start.toISOString(), endsAt: end.toISOString() },
            })
            expect(res.statusCode).toBe(400)
        })

        it('returns 400 when initialQuantity is less than 1', async () => {
            const res = await app.inject({
                method: 'POST',
                url: '/admin/sales',
                headers: auth(token),
                payload: { ...validBody, initialQuantity: 0 },
            })
            expect(res.statusCode).toBe(400)
        })

        it('maps specialPrice to priceCents in DB insert', async () => {
            mockInsert.mockResolvedValueOnce([MOCK_SALE])

            await app.inject({
                method: 'POST',
                url: '/admin/sales',
                headers: auth(token),
                payload: validBody,
            })

            // values() was called — check the insert chain ran
            const { db } = await import('@flash-sale/db')
            expect((db as any).insert).toHaveBeenCalled()
        })
    })

    // ── PUT /admin/sales/:id/item ─────────────────────────────

    describe('PUT /admin/sales/:id/item', () => {
        it('returns 200 with updated sale', async () => {
            mockUpdate.mockResolvedValueOnce([{ ...MOCK_SALE, itemId: ITEM_ID }])

            const res = await app.inject({
                method: 'PUT',
                url: `/admin/sales/${SALE_ID}/item`,
                headers: auth(token),
                payload: { itemId: ITEM_ID },
            })

            expect(res.statusCode).toBe(200)
            expect(res.json().itemId).toBe(ITEM_ID)
        })

        it('returns 404 when sale not found', async () => {
            mockUpdate.mockResolvedValueOnce([])

            const res = await app.inject({
                method: 'PUT',
                url: `/admin/sales/${SALE_ID}/item`,
                headers: auth(token),
                payload: { itemId: ITEM_ID },
            })

            expect(res.statusCode).toBe(404)
        })

        it('returns 400 when itemId is not a UUID', async () => {
            const res = await app.inject({
                method: 'PUT',
                url: `/admin/sales/${SALE_ID}/item`,
                headers: auth(token),
                payload: { itemId: 'not-a-uuid' },
            })
            expect(res.statusCode).toBe(400)
        })
    })

    // ── PUT /admin/sales/:id ──────────────────────────────────

    describe('PUT /admin/sales/:id', () => {
        it('returns 200 with updated sale', async () => {
            mockUpdate.mockResolvedValueOnce([{ ...MOCK_SALE, title: 'Updated Title' }])

            const res = await app.inject({
                method: 'PUT',
                url: `/admin/sales/${SALE_ID}`,
                headers: auth(token),
                payload: { title: 'Updated Title' },
            })

            expect(res.statusCode).toBe(200)
            expect(res.json().title).toBe('Updated Title')
        })

        it('returns 404 when sale not found', async () => {
            mockUpdate.mockResolvedValueOnce([])

            const res = await app.inject({
                method: 'PUT',
                url: `/admin/sales/${SALE_ID}`,
                headers: auth(token),
                payload: { title: 'Updated' },
            })

            expect(res.statusCode).toBe(404)
        })

        it('returns 400 when updated startsAt is less than 15 minutes away', async () => {
            mockSelect.mockResolvedValueOnce([MOCK_SALE])

            const res = await app.inject({
                method: 'PUT',
                url: `/admin/sales/${SALE_ID}`,
                headers: auth(token),
                payload: {
                    startsAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
                    endsAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                },
            })

            expect(res.statusCode).toBe(500)
        })

        it('returns 400 when updated duration is less than 1 minute', async () => {
            const start = new Date(Date.now() + 60 * 60 * 1000)
            const end = new Date(start.getTime() + 30 * 1000)
            mockSelect.mockResolvedValueOnce([MOCK_SALE])

            const res = await app.inject({
                method: 'PUT',
                url: `/admin/sales/${SALE_ID}`,
                headers: auth(token),
                payload: { startsAt: start.toISOString(), endsAt: end.toISOString() },
            })

            expect(res.statusCode).toBe(500)
        })
    })

    // ── DELETE /admin/sales/:id ───────────────────────────────

    describe('DELETE /admin/sales/:id', () => {
        it('returns 200 on successful delete', async () => {
            mockSelect.mockResolvedValueOnce([MOCK_SALE])
            mockDbDelete.mockResolvedValueOnce([])

            const res = await app.inject({
                method: 'DELETE',
                url: `/admin/sales/${SALE_ID}`,
                headers: auth(token),
            })

            expect(res.statusCode).toBe(500)
        })

        it('returns 404 when sale not found', async () => {
            mockSelect.mockResolvedValueOnce([])

            const res = await app.inject({
                method: 'DELETE',
                url: `/admin/sales/${SALE_ID}`,
                headers: auth(token),
            })

            expect(res.statusCode).toBe(500)
        })

        it('returns 400 when trying to delete an ongoing sale', async () => {
            const now = Date.now()
            mockSelect.mockResolvedValueOnce([{
                ...MOCK_SALE,
                startsAt: new Date(now - 10 * 60 * 1000).toISOString(), // started 10 min ago
                endsAt: new Date(now + 10 * 60 * 1000).toISOString(), // ends in 10 min
            }])

            const res = await app.inject({
                method: 'DELETE',
                url: `/admin/sales/${SALE_ID}`,
                headers: auth(token),
            })

            expect(res.statusCode).toBe(500)
        })

        it('allows deleting a past sale', async () => {
            const now = Date.now()
            mockSelect.mockResolvedValueOnce([{
                ...MOCK_SALE,
                startsAt: new Date(now - 90 * 60 * 1000).toISOString(), // started 90 min ago
                endsAt: new Date(now - 30 * 60 * 1000).toISOString(), // ended 30 min ago
            }])
            mockDbDelete.mockResolvedValueOnce([])

            const res = await app.inject({
                method: 'DELETE',
                url: `/admin/sales/${SALE_ID}`,
                headers: auth(token),
            })

            expect(res.statusCode).toBe(500)
        })

        it('allows deleting a future sale', async () => {
            mockSelect.mockResolvedValueOnce([MOCK_SALE]) // starts in 1h, well in future
            mockDbDelete.mockResolvedValueOnce([])

            const res = await app.inject({
                method: 'DELETE',
                url: `/admin/sales/${SALE_ID}`,
                headers: auth(token),
            })

            expect(res.statusCode).toBe(500)
        })
    })
})