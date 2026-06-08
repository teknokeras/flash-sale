import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Hoist mocks ───────────────────────────────────────────────

const { mockAuthRoutes, mockSalesRoutes, mockItemsRoutes } = vi.hoisted(() => ({
    mockAuthRoutes: vi.fn().mockResolvedValue(undefined),
    mockSalesRoutes: vi.fn().mockResolvedValue(undefined),
    mockItemsRoutes: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../routes/auth.js', () => ({ authRoutes: mockAuthRoutes }))
vi.mock('../routes/sales.js', () => ({ adminSalesRoutes: mockSalesRoutes }))
vi.mock('../routes/items.js', () => ({ adminItemsRoutes: mockItemsRoutes }))

vi.mock('@fastify/redis', () => ({
    default: vi.fn().mockImplementation(async (app: any) => {
        app.decorate('redis', { get: vi.fn(), set: vi.fn(), eval: vi.fn() })
    }),
}))

// ── Helpers ───────────────────────────────────────────────────

const ORIGINAL_ENV = process.env

function setEnv(overrides: Record<string, string>) {
    process.env = { ...ORIGINAL_ENV, ...overrides }
}

function resetEnv() {
    process.env = ORIGINAL_ENV
}

async function importBuildApp() {
    vi.resetModules()
    const { buildApp } = await import('../app.js')
    return buildApp
}

// ── Tests ─────────────────────────────────────────────────────

describe('buildApp (admin-service)', () => {
    beforeEach(() => {
        setEnv({ JWT_SECRET: 'test-secret', REDIS_URL: 'redis://localhost:6379' })
    })

    afterEach(() => {
        resetEnv()
        vi.resetModules()
    })

    // ── Env var guards ────────────────────────────────────────

    describe('env var guards', () => {
        it('throws when JWT_SECRET is missing', async () => {
            const buildApp = await importBuildApp()
            delete process.env['JWT_SECRET']

            expect(() => buildApp()).toThrow('JWT_SECRET is required')
        })

        it('throws when REDIS_URL is missing', async () => {
            const buildApp = await importBuildApp()
            delete process.env['REDIS_URL']

            expect(() => buildApp()).toThrow('REDIS_URL is required')
        })

        it('does not throw when both env vars are present', async () => {
            const buildApp = await importBuildApp()
            expect(() => buildApp()).not.toThrow()
        })
    })

    // ── Health check ──────────────────────────────────────────

    describe('GET /health', () => {
        it('returns 200 with correct body', async () => {
            const buildApp = await importBuildApp()
            const app = buildApp()
            await app.ready()

            const res = await app.inject({ method: 'GET', url: '/health' })

            expect(res.statusCode).toBe(200)
            expect(res.json()).toEqual({ status: 'ok', service: 'admin-service' })

            await app.close()
        })

        it('does not require authentication', async () => {
            const buildApp = await importBuildApp()
            const app = buildApp()
            await app.ready()

            const res = await app.inject({ method: 'GET', url: '/health' })
            expect(res.statusCode).toBe(200)

            await app.close()
        })
    })

    // ── Route registration ────────────────────────────────────

    describe('route registration', () => {
        it('registers authRoutes at prefix /auth', async () => {
            const buildApp = await importBuildApp()
            const app = buildApp()
            await app.ready()

            expect(mockAuthRoutes).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ prefix: '/auth' }),
                expect.any(Function)
            )

            await app.close()
        })

        it('registers adminSalesRoutes at prefix /admin/sales', async () => {
            const buildApp = await importBuildApp()
            const app = buildApp()
            await app.ready()

            expect(mockSalesRoutes).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ prefix: '/admin/sales' }),
                expect.any(Function)
            )

            await app.close()
        })

        it('registers adminItemsRoutes at prefix /admin/items', async () => {
            const buildApp = await importBuildApp()
            const app = buildApp()
            await app.ready()

            expect(mockItemsRoutes).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ prefix: '/admin/items' }),
                expect.any(Function)
            )

            await app.close()
        })
    })

    // ── authenticateAdmin decorator ───────────────────────────

    describe('authenticateAdmin decorator', () => {
        it('is registered on the app', async () => {
            const buildApp = await importBuildApp()
            const app = buildApp()
            await app.ready()

            expect((app as any).authenticateAdmin).toBeDefined()
            expect(typeof (app as any).authenticateAdmin).toBe('function')

            await app.close()
        })

        it('allows request with valid admin JWT', async () => {
            const buildApp = await importBuildApp()
            const app = buildApp()
            app.get('/protected', { onRequest: [(app as any).authenticateAdmin] }, async () => ({ ok: true }))
            await app.ready()

            const token = (app as any).jwt.sign({ id: 'admin-1', role: 'admin' })
            const res = await app.inject({
                method: 'GET',
                url: '/protected',
                headers: { Authorization: `Bearer ${token}` },
            })

            expect(res.statusCode).toBe(200)
            await app.close()
        })

        it('returns 403 for valid JWT with non-admin role', async () => {
            const buildApp = await importBuildApp()
            const app = buildApp()
            app.get('/protected', { onRequest: [(app as any).authenticateAdmin] }, async () => ({ ok: true }))
            await app.ready()

            const token = (app as any).jwt.sign({ id: 'buyer-1', role: 'buyer' })
            const res = await app.inject({
                method: 'GET',
                url: '/protected',
                headers: { Authorization: `Bearer ${token}` },
            })

            expect(res.statusCode).toBe(403)
            await app.close()
        })

        it('returns 401 for invalid JWT', async () => {
            const buildApp = await importBuildApp()
            const app = buildApp()
            app.get('/protected', { onRequest: [(app as any).authenticateAdmin] }, async () => ({ ok: true }))
            await app.ready()

            const res = await app.inject({
                method: 'GET',
                url: '/protected',
                headers: { Authorization: 'Bearer bad.token' },
            })

            expect(res.statusCode).toBe(401)
            await app.close()
        })

        it('returns 401 when token is missing', async () => {
            const buildApp = await importBuildApp()
            const app = buildApp()
            app.get('/protected', { onRequest: [(app as any).authenticateAdmin] }, async () => ({ ok: true }))
            await app.ready()

            const res = await app.inject({ method: 'GET', url: '/protected' })
            expect(res.statusCode).toBe(401)
            await app.close()
        })
    })

    // ── Unknown routes ────────────────────────────────────────

    describe('unknown routes', () => {
        it('returns 404 for unregistered routes', async () => {
            const buildApp = await importBuildApp()
            const app = buildApp()
            await app.ready()

            const res = await app.inject({ method: 'GET', url: '/does-not-exist' })
            expect(res.statusCode).toBe(404)

            await app.close()
        })
    })
})