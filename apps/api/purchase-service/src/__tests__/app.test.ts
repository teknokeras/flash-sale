import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Mock all plugins and routes ───────────────────────────────

const { mockPurchaseRoutes, mockPurchaseQueryRoutes } = vi.hoisted(() => ({
    mockPurchaseRoutes: vi.fn().mockResolvedValue(undefined),
    mockPurchaseQueryRoutes: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('../routes/purchase.js', () => ({ purchaseRoutes: mockPurchaseRoutes }))
vi.mock('../routes/purchase-query.js', () => ({ purchaseQueryRoutes: mockPurchaseQueryRoutes }))

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
    // Force fresh module import after env changes
    vi.resetModules()
    const { buildApp } = await import('../app.js')
    return buildApp
}

// ── Tests ─────────────────────────────────────────────────────

describe('buildApp', () => {
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
            process.env = { ...ORIGINAL_ENV, REDIS_URL: 'redis://localhost:6379' }
            delete process.env['JWT_SECRET']

            await expect(importBuildApp()).rejects.toThrow('JWT_SECRET is required')
        })

        it('throws when REDIS_URL is missing', async () => {
            process.env = { ...ORIGINAL_ENV, JWT_SECRET: 'secret' }
            delete process.env['REDIS_URL']

            await expect(importBuildApp()).rejects.toThrow('REDIS_URL is required')
        })

        it('throws when both are missing', async () => {
            process.env = { ...ORIGINAL_ENV }
            delete process.env['JWT_SECRET']
            delete process.env['REDIS_URL']

            await expect(importBuildApp()).rejects.toThrow()
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
            expect(res.json()).toEqual({ status: 'ok', service: 'purchase-service' })

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
        it('registers purchaseRoutes at prefix /', async () => {
            const buildApp = await importBuildApp()
            const app = buildApp()
            await app.ready()

            expect(mockPurchaseRoutes).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ prefix: '/' }),
                expect.any(Function)
            )

            await app.close()
        })

        it('registers purchaseQueryRoutes at prefix /mine', async () => {
            const buildApp = await importBuildApp()
            const app = buildApp()
            await app.ready()

            expect(mockPurchaseQueryRoutes).toHaveBeenCalledWith(
                expect.anything(),
                expect.objectContaining({ prefix: '/mine' }),
                expect.any(Function)
            )

            await app.close()
        })
    })

    // ── authenticate decorator ────────────────────────────────

    describe('authenticate decorator', () => {
        it('is registered on the app', async () => {
            const buildApp = await importBuildApp()
            const app = buildApp()
            await app.ready()

            expect((app as any).authenticate).toBeDefined()
            expect(typeof (app as any).authenticate).toBe('function')

            await app.close()
        })

        it('verifies a valid JWT', async () => {
            const buildApp = await importBuildApp()
            const app = buildApp()

            // Must register route BEFORE ready() — Fastify locks routes after ready
            app.get('/protected', { onRequest: [(app as any).authenticate] }, async () => ({ ok: true }))
            await app.ready()

            const token = (app as any).jwt.sign({ sub: 'user-1', role: 'buyer' })
            const res = await app.inject({
                method: 'GET',
                url: '/protected',
                headers: { Authorization: `Bearer ${token}` },
            })

            expect(res.statusCode).toBe(200)
            await app.close()
        })

        it('rejects an invalid JWT with 401', async () => {
            const buildApp = await importBuildApp()
            const app = buildApp()

            app.get('/protected', { onRequest: [(app as any).authenticate] }, async () => ({ ok: true }))
            await app.ready()

            const res = await app.inject({
                method: 'GET',
                url: '/protected',
                headers: { Authorization: 'Bearer bad.token' },
            })

            expect(res.statusCode).toBe(401)
            await app.close()
        })

        it('rejects a missing token with 401', async () => {
            const buildApp = await importBuildApp()
            const app = buildApp()

            app.get('/protected', { onRequest: [(app as any).authenticate] }, async () => ({ ok: true }))
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