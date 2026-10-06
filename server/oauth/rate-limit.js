import { sha256 } from "./crypto.js";
import { incrementWindow } from "./redis.js";
export class RateLimitError extends Error {
  constructor(retryAfter) {
    super("Too many authorization requests");
    this.retryAfter = retryAfter;
  }
}
const memoryBuckets = new Map();
const MAX_MEMORY_BUCKET_ENTRIES = 5000;
function checkInMemoryLimit(key, limit, windowSeconds) {
  const now = Date.now();
  const bucket = memoryBuckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    if (memoryBuckets.size >= MAX_MEMORY_BUCKET_ENTRIES) {
      for (const [k, v] of memoryBuckets.entries()) {
        if (now >= v.resetAt) memoryBuckets.delete(k);
      }
    }
    memoryBuckets.set(key, {
      count: 1,
      resetAt: now + windowSeconds * 1000,
    });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}
export async function enforceRateLimit(bucket, identity, limit, windowSeconds, config) {
  const burstLimit = config?.burstLimit ?? Math.max(5, Math.min(limit, 10));
  const burstWindowSeconds = config?.burstWindowSeconds ?? 5;
  const burstKey = `burst:${bucket}:${identity}`;
  if (!checkInMemoryLimit(burstKey, burstLimit, burstWindowSeconds)) {
    throw new RateLimitError(burstWindowSeconds);
  }
  if (config?.globalLimit) {
    const globalWindowSeconds = config.globalWindowSeconds ?? 60;
    const globalKey = `global:${bucket}`;
    if (!checkInMemoryLimit(globalKey, config.globalLimit, globalWindowSeconds)) {
      throw new RateLimitError(globalWindowSeconds);
    }
  }
  try {
    const key = `codevault:oauth:rate:${bucket}:${sha256(identity)}`;
    const count = await incrementWindow(key, windowSeconds);
    if (count > limit) throw new RateLimitError(windowSeconds);
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    console.warn(`[rate-limit] Redis unavailable, fallback to L1 limiter:`, error);
  }
}
export function resetInMemoryRateLimits() {
  memoryBuckets.clear();
}
