import redis from '../config/redis.js';
import type { CachedUrl } from '../types/index.js';
import { metrics } from '../utils/metrics.js';

/** Default TTL: 24 hours (in seconds) */
const REDIS_URL_TTL = parseInt(process.env.REDIS_URL_TTL || '86400', 10);

/** Cache-key prefix for URL short codes */
const URL_PREFIX = 'url:';

/**
 * Build a consistent cache key for a short code.
 */
function cacheKey(shortCode: string): string {
  return `${URL_PREFIX}${shortCode}`;
}

/**
 * Get a cached URL data object by short code.
 * Returns null on miss, legacy string format, or Redis failure.
 */
export async function getUrl(shortCode: string): Promise<CachedUrl | null> {
  const key = cacheKey(shortCode);
  if (!redis) {
    metrics.recordCache('miss');
    console.log(`[REDIS] ⚠️ Redis client unavailable, skipping cache GET for "${key}"`);
    return null;
  }

  const startTime = Date.now();
  console.log(`[REDIS] ⏳ GET "${key}" starting...`);
  try {
    const value = await redis.get<CachedUrl | string>(key);
    const duration = Date.now() - startTime;
    if (value) {
      if (typeof value === 'object' && value !== null && 'originalUrl' in value && 'urlId' in value) {
        metrics.recordCache('hit');
        console.log(`[REDIS] ✅ Cache HIT in ${duration}ms: "${key}" -> urlId=${value.urlId}, originalUrl=${value.originalUrl}`);
        return value as CachedUrl;
      }
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          if (parsed && typeof parsed === 'object' && parsed.originalUrl && parsed.urlId) {
            metrics.recordCache('hit');
            console.log(`[REDIS] ✅ Cache HIT (parsed JSON) in ${duration}ms: "${key}" -> urlId=${parsed.urlId}, originalUrl=${parsed.originalUrl}`);
            return parsed as CachedUrl;
          }
        } catch {
          console.log(`[REDIS] ⚠️ Legacy non-JSON string value for "${key}": "${value}". Treating as MISS to refresh.`);
        }
      }
    }
    metrics.recordCache('miss');
    console.log(`[REDIS] ℹ️ Cache MISS in ${duration}ms: "${key}"`);
    return null;
  } catch (err) {
    const duration = Date.now() - startTime;
    metrics.recordCache('miss');
    console.error(`[REDIS] ❌ GET error after ${duration}ms for "${key}":`, (err as Error).message);
    return null;
  }
}

/**
 * Cache URL data (original URL + urlId) keyed by short code with TTL.
 * Fails silently on Redis error.
 */
export async function setUrl(shortCode: string, data: CachedUrl): Promise<void> {
  const key = cacheKey(shortCode);
  if (!redis) {
    console.log(`[REDIS] ⚠️ Redis client unavailable, skipping cache SET for "${key}"`);
    return;
  }

  const startTime = Date.now();
  console.log(`[REDIS] ⏳ SET "${key}" starting (TTL: ${REDIS_URL_TTL}s)... Payload:`, JSON.stringify(data));
  try {
    await redis.set(key, data, { ex: REDIS_URL_TTL });
    metrics.recordCache('set');
    const duration = Date.now() - startTime;
    console.log(`[REDIS] ✅ SET completed in ${duration}ms: "${key}"`);
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[REDIS] ❌ SET error after ${duration}ms for "${key}":`, (err as Error).message);
  }
}

/**
 * Remove a cached URL by short code.
 * Fails silently on Redis error.
 */
export async function deleteUrl(shortCode: string): Promise<void> {
  const key = cacheKey(shortCode);
  if (!redis) {
    console.log(`[REDIS] ⚠️ Redis client unavailable, skipping cache DEL for "${key}"`);
    return;
  }

  const startTime = Date.now();
  console.log(`[REDIS] ⏳ DEL "${key}" starting...`);
  try {
    await redis.del(key);
    metrics.recordCache('del');
    const duration = Date.now() - startTime;
    console.log(`[REDIS] ✅ DEL completed in ${duration}ms: "${key}"`);
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(`[REDIS] ❌ DEL error after ${duration}ms for "${key}":`, (err as Error).message);
  }
}
