import { Redis } from '@upstash/redis';

const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_REDIS_REST_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

/**
 * Check whether Upstash credentials look valid before constructing the client.
 * The SDK throws eagerly if the URL doesn't start with https.
 */
function isValidConfig(): boolean {
  return (
    typeof UPSTASH_REDIS_REST_URL === 'string' &&
    UPSTASH_REDIS_REST_URL.startsWith('https://') &&
    typeof UPSTASH_REDIS_REST_TOKEN === 'string' &&
    UPSTASH_REDIS_REST_TOKEN.length > 0
  );
}

let redis: Redis | null = null;

if (isValidConfig()) {
  try {
    redis = new Redis({
      url: UPSTASH_REDIS_REST_URL!,
      token: UPSTASH_REDIS_REST_TOKEN!,
    });
    console.log('✅ Upstash Redis client initialised');
  } catch (err) {
    console.warn('⚠️  Failed to initialise Upstash Redis client:', (err as Error).message);
    redis = null;
  }
} else {
  console.warn(
    '⚠️  Upstash Redis credentials not configured or invalid. Caching is disabled.',
  );
}

export default redis;
