import { Redis } from "@upstash/redis";

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (redis) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  redis = new Redis({ url, token });
  return redis;
}

const inMemoryBuckets = new Map<string, { count: number; resetAt: number }>();
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < 60_000) return;
  lastCleanup = now;
  for (const [key, entry] of inMemoryBuckets) {
    if (entry.resetAt <= now) inMemoryBuckets.delete(key);
  }
}

function checkRateLimitInMemory(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; resetAt: number } {
  cleanup();
  const now = Date.now();
  const entry = inMemoryBuckets.get(key);

  if (!entry || entry.resetAt <= now) {
    inMemoryBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowMs };
  }

  entry.count++;
  const remaining = Math.max(0, limit - entry.count);
  const allowed = entry.count <= limit;

  return { allowed, remaining, resetAt: entry.resetAt };
}

export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const client = getRedis();

  if (!client) {
    return checkRateLimitInMemory(key, limit, windowMs);
  }

  const now = Date.now();
  const resetAt = now + windowMs;
  const pipeline = client.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, Math.ceil(windowMs / 1000));
  const results = await pipeline.exec<[number, number]>();

  const count = (results as unknown as [number, number][])?.[0]?.[1] ?? 1;
  const remaining = Math.max(0, limit - count);
  const allowed = count <= limit;

  return { allowed, remaining, resetAt };
}
