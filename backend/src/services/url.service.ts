import * as UrlModel from '../models/url.model.js';
import * as cacheService from './cache.service.js';
import { generateShortCode } from '../utils/shortCode.js';
import { AppError } from '../utils/AppError.js';
import type { UrlRow, PaginationMeta, ResolvedUrl } from '../types/index.js';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const SHORT_CODE_LENGTH = parseInt(process.env.SHORT_CODE_LENGTH || '7', 10);

/** Maximum retries to resolve a short-code collision */
const MAX_COLLISION_RETRIES = 5;

/**
 * Create a shortened URL for an authenticated user.
 */
export async function createUrl(
  userId: string,
  originalUrl: string,
  expiresAt?: string,
): Promise<{ url: UrlRow; shortUrl: string }> {
  console.log(`[URL_SERVICE] ➕ createUrl called for userId=${userId}, originalUrl=${originalUrl}, expiresAt=${expiresAt}`);
  const startTime = Date.now();

  // Generate a unique short code with collision handling
  let shortCode: string = '';
  let attempts = 0;

  while (attempts < MAX_COLLISION_RETRIES) {
    shortCode = generateShortCode(SHORT_CODE_LENGTH);
    console.log(`[URL_SERVICE] 🎲 Generated candidate shortCode="${shortCode}" (attempt ${attempts + 1}/${MAX_COLLISION_RETRIES})`);
    const exists = await UrlModel.shortCodeExists(shortCode);
    if (!exists) break;
    console.log(`[URL_SERVICE] ⚠️ Collision detected for shortCode="${shortCode}"`);
    attempts++;
  }

  if (attempts >= MAX_COLLISION_RETRIES) {
    console.error(`[URL_SERVICE] ❌ Collision limit reached (${MAX_COLLISION_RETRIES} attempts)`);
    throw new AppError('Failed to generate a unique short code. Please try again.', 500);
  }

  const url = await UrlModel.create(
    userId,
    originalUrl,
    shortCode,
    expiresAt ?? null,
  );

  const duration = Date.now() - startTime;
  console.log(`[URL_SERVICE] ✅ createUrl succeeded in ${duration}ms: id=${url.id}, shortCode=${url.short_code}`);

  return {
    url,
    shortUrl: `${BASE_URL}/${shortCode}`,
  };
}

/**
 * Resolve a short code to the original URL and its urlId.
 *
 * Cache-aside pattern:
 *   1. Check Redis  → HIT  → return resolved URL with urlId
 *   2. Cache MISS   → PostgreSQL → check expiration → populate cache → return resolved URL
 *   3. Redis failure → transparent fallback to PostgreSQL
 */
export async function resolveShortCode(shortCode: string): Promise<ResolvedUrl> {
  const startTime = Date.now();
  console.log(`[URL_SERVICE] 🔍 resolveShortCode started for "${shortCode}"`);

  // ── 1. Try cache first ──────────────────────────────────
  console.log(`[URL_SERVICE] ⏳ Checking Redis cache for "${shortCode}"...`);
  const cached = await cacheService.getUrl(shortCode);
  if (cached) {
    const duration = Date.now() - startTime;
    console.log(`[URL_SERVICE] ✅ Cache HIT for "${shortCode}" in ${duration}ms: urlId=${cached.urlId}, originalUrl=${cached.originalUrl} (source=cache)`);
    return {
      originalUrl: cached.originalUrl,
      urlId: cached.urlId,
      shortCode,
      source: 'cache',
    };
  }

  // ── 2. Cache MISS – fall back to PostgreSQL ─────────────
  console.log(`[URL_SERVICE] ⏳ Cache MISS for "${shortCode}". Querying PostgreSQL for short_code="${shortCode}"...`);
  const url = await UrlModel.findByShortCode(shortCode);

  if (!url) {
    const duration = Date.now() - startTime;
    console.warn(`[URL_SERVICE] ❌ Short code "${shortCode}" was NOT found in PostgreSQL after ${duration}ms`);
    throw new AppError('Short URL not found', 404);
  }

  console.log(`[URL_SERVICE] ✅ Short code "${shortCode}" successfully found in PostgreSQL: id=${url.id}, original_url=${url.original_url}, expires_at=${url.expires_at}`);

  if (url.expires_at && new Date(url.expires_at) < new Date()) {
    // Do NOT cache expired URLs
    console.warn(`[URL_SERVICE] ⚠️ Short URL has expired: "${shortCode}" (expired at ${url.expires_at})`);
    throw new AppError('This short URL has expired', 410);
  }

  // ── 3. Populate cache for next request ──────────────────
  console.log(`[URL_SERVICE] ⏳ Populating cache for "${shortCode}" (urlId=${url.id})...`);
  await cacheService.setUrl(shortCode, {
    originalUrl: url.original_url,
    urlId: url.id,
  });

  const duration = Date.now() - startTime;
  console.log(`[URL_SERVICE] ✅ resolveShortCode completed in ${duration}ms: urlId=${url.id}, originalUrl=${url.original_url} (source=postgres)`);

  return {
    originalUrl: url.original_url,
    urlId: url.id,
    shortCode,
    source: 'postgres',
  };
}

/**
 * Get paginated URLs for a specific user.
 */
export async function getUserUrls(
  userId: string,
  page: number,
  limit: number,
): Promise<{ urls: UrlRow[]; pagination: PaginationMeta }> {
  console.log(`[URL_SERVICE] 📋 getUserUrls called: userId=${userId}, page=${page}, limit=${limit}`);
  const startTime = Date.now();
  const { rows, total } = await UrlModel.findByUserId(userId, page, limit);
  const duration = Date.now() - startTime;
  console.log(`[URL_SERVICE] ✅ getUserUrls retrieved ${rows.length} URLs (total: ${total}) in ${duration}ms for userId=${userId}`);

  return {
    urls: rows,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Delete a URL, ensuring the requesting user is the owner.
 * Also invalidates the Redis cache for that short code.
 */
export async function deleteUrl(urlId: string, userId: string): Promise<void> {
  console.log(`[URL_SERVICE] 🗑️ deleteUrl called: urlId=${urlId}, userId=${userId}`);
  const startTime = Date.now();
  const url = await UrlModel.findById(urlId);

  if (!url) {
    console.warn(`[URL_SERVICE] ❌ URL id=${urlId} not found`);
    throw new AppError('URL not found', 404);
  }

  if (url.user_id !== userId) {
    console.warn(`[URL_SERVICE] ⛔ Unauthorized delete: url.user_id=${url.user_id} does not match requesting userId=${userId}`);
    throw new AppError('You are not authorised to delete this URL', 403);
  }

  // Delete from PostgreSQL
  console.log(`[URL_SERVICE] ⏳ Deleting URL id=${urlId} from PostgreSQL...`);
  await UrlModel.deleteById(urlId);

  // Invalidate Redis cache
  console.log(`[URL_SERVICE] ⏳ Invalidating Redis cache for shortCode="${url.short_code}"...`);
  await cacheService.deleteUrl(url.short_code);

  const duration = Date.now() - startTime;
  console.log(`[URL_SERVICE] ✅ deleteUrl completed in ${duration}ms for urlId=${urlId}`);
}

