import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  atomicDecrementInventory,
  incrementInventory,
  isSaleOpen,
} from '../redis-lua.js'

// ── Mock Redis client ─────────────────────────────────────────

function makeMockRedis(evalResult: number, getResult: string | null = null) {
  return {
    eval: vi.fn().mockResolvedValue(evalResult),
    incr: vi.fn().mockResolvedValue(1),
    get: vi.fn().mockResolvedValue(getResult),
  }
}

const SALE_ID = 'test-sale-123'
const QTY_KEY = `sale:${SALE_ID}:qty`
const OPEN_KEY = `sale:${SALE_ID}:open`

// ── atomicDecrementInventory ──────────────────────────────────

describe('atomicDecrementInventory', () => {
  it('returns success=true and remaining count when inventory > 0', async () => {
    const redis = makeMockRedis(4) // Lua returns new qty after decrement
    const result = await atomicDecrementInventory(redis as any, SALE_ID)

    expect(result).toEqual({ success: true, remaining: 4 })
    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, QTY_KEY)
  })

  it('returns success=true with remaining=0 when last item is taken', async () => {
    const redis = makeMockRedis(0) // Lua decremented from 1 → 0
    const result = await atomicDecrementInventory(redis as any, SALE_ID)

    expect(result).toEqual({ success: true, remaining: 0 })
  })

  it('returns success=false when inventory is already 0 (Lua returns -1)', async () => {
    const redis = makeMockRedis(-1)
    const result = await atomicDecrementInventory(redis as any, SALE_ID)

    expect(result).toEqual({ success: false, remaining: 0 })
  })

  it('returns success=false when key does not exist (Lua returns -1)', async () => {
    // Lua returns -1 when GET returns nil (key missing)
    const redis = makeMockRedis(-1)
    const result = await atomicDecrementInventory(redis as any, SALE_ID)

    expect(result).toEqual({ success: false, remaining: 0 })
  })

  it('calls eval with exactly 1 key', async () => {
    const redis = makeMockRedis(3)
    await atomicDecrementInventory(redis as any, SALE_ID)

    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, QTY_KEY)
    expect(redis.eval).toHaveBeenCalledTimes(1)
  })

  it('uses the correct Redis key format', async () => {
    const redis = makeMockRedis(1)
    await atomicDecrementInventory(redis as any, 'my-sale-id')

    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      'sale:my-sale-id:qty'
    )
  })
})

// ── incrementInventory ────────────────────────────────────────

describe('incrementInventory', () => {
  it('calls redis.incr with the correct key', async () => {
    const redis = makeMockRedis(0)
    await incrementInventory(redis as any, SALE_ID)

    expect(redis.incr).toHaveBeenCalledWith(QTY_KEY)
    expect(redis.incr).toHaveBeenCalledTimes(1)
  })

  it('uses the correct Redis key format', async () => {
    const redis = makeMockRedis(0)
    await incrementInventory(redis as any, 'another-sale')

    expect(redis.incr).toHaveBeenCalledWith('sale:another-sale:qty')
  })

  it('resolves without error', async () => {
    const redis = makeMockRedis(0)
    await expect(incrementInventory(redis as any, SALE_ID)).resolves.toBeUndefined()
  })
})

// ── isSaleOpen ────────────────────────────────────────────────

describe('isSaleOpen', () => {
  it('returns true when Redis key is "1"', async () => {
    const redis = makeMockRedis(0, '1')
    const result = await isSaleOpen(redis as any, SALE_ID)

    expect(result).toBe(true)
    expect(redis.get).toHaveBeenCalledWith(OPEN_KEY)
  })

  it('returns false when Redis key is "0"', async () => {
    const redis = makeMockRedis(0, '0')
    const result = await isSaleOpen(redis as any, SALE_ID)

    expect(result).toBe(false)
  })

  it('returns false when key does not exist (null)', async () => {
    const redis = makeMockRedis(0, null)
    const result = await isSaleOpen(redis as any, SALE_ID)

    expect(result).toBe(false)
  })

  it('returns false for any value that is not exactly "1"', async () => {
    const redis = makeMockRedis(0, 'true')
    const result = await isSaleOpen(redis as any, SALE_ID)

    expect(result).toBe(false)
  })

  it('uses the correct Redis key format', async () => {
    const redis = makeMockRedis(0, '1')
    await isSaleOpen(redis as any, 'sale-xyz')

    expect(redis.get).toHaveBeenCalledWith('sale:sale-xyz:open')
  })
})

// ── Rollback scenario ─────────────────────────────────────────

describe('rollback scenario: decrement then increment', () => {
  it('restores inventory after a failed purchase', async () => {
    const redis = {
      eval: vi.fn().mockResolvedValue(4), // decrement succeeds, 4 remaining
      incr: vi.fn().mockResolvedValue(5), // rollback increments back to 5
      get: vi.fn(),
    }

    const decrementResult = await atomicDecrementInventory(redis as any, SALE_ID)
    expect(decrementResult).toEqual({ success: true, remaining: 4 })

    await incrementInventory(redis as any, SALE_ID)
    expect(redis.incr).toHaveBeenCalledWith(QTY_KEY)
  })

  it('calls both eval and incr with the same sale key', async () => {
    const redis = {
      eval: vi.fn().mockResolvedValue(2),
      incr: vi.fn().mockResolvedValue(3),
      get: vi.fn(),
    }

    await atomicDecrementInventory(redis as any, SALE_ID)
    await incrementInventory(redis as any, SALE_ID)

    expect(redis.eval).toHaveBeenCalledWith(expect.any(String), 1, QTY_KEY)
    expect(redis.incr).toHaveBeenCalledWith(QTY_KEY)
  })
})