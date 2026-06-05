import type { Redis } from "ioredis";

// Lua script: atomically check qty > 0 then decrement.
// Returns the new quantity, or -1 if already at 0 (sold out).
// Single-threaded execution on Redis = zero race condition.
const DECREMENT_SCRIPT = `
  local qty = tonumber(redis.call('GET', KEYS[1]))
  if qty == nil then return -1 end
  if qty <= 0 then return -1 end
  return redis.call('DECR', KEYS[1])
`;

export async function atomicDecrementInventory(
    redis: Redis,
    saleId: string
): Promise<{ success: boolean; remaining: number }> {
    const key = `sale:${saleId}:qty`;
    const result = await redis.eval(DECREMENT_SCRIPT, 1, key) as number;

    if (result === -1) {
        return { success: false, remaining: 0 };
    }

    return { success: true, remaining: result };
}

export async function incrementInventory(
    redis: Redis,
    saleId: string
): Promise<void> {
    await redis.incr(`sale:${saleId}:qty`);
}

export async function isSaleOpen(
    redis: Redis,
    saleId: string
): Promise<boolean> {
    const val = await redis.get(`sale:${saleId}:open`);
    return val === "1";
}