import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod/v4';
import * as urlService from '../services/url.service.js';
import * as clickEventService from '../services/clickEvent.service.js';
import { createUrlSchema, paginationSchema } from '../utils/validators.js';
import { sendSuccess, sendError } from '../utils/response.js';
import type { AuthenticatedRequest } from '../types/index.js';
import { renderRedirectSplash } from '../views/redirectSplash.js';
import { metrics } from '../utils/metrics.js';

/**
 * POST /api/urls
 * Create a shortened URL.
 */
export async function createUrl(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const reqId = Math.random().toString(36).substring(2, 8);
  console.log(`[URL_CONTROLLER][${reqId}] 📥 Entered createUrl handler`);
  try {
    const authReq = req as AuthenticatedRequest;
    console.log(`[URL_CONTROLLER][${reqId}] 👤 Authenticated user: ${authReq.user?.id} (${authReq.user?.email})`);
    console.log(`[URL_CONTROLLER][${reqId}] 📦 Request body:`, JSON.stringify(req.body));

    const parsed = createUrlSchema.safeParse(req.body);
    if (!parsed.success) {
      console.warn(`[URL_CONTROLLER][${reqId}] ⚠️ Validation failed:`, parsed.error.issues);
      sendError(res, 'Validation failed', 400, z.prettifyError(parsed.error));
      return;
    }

    const { originalUrl, expiresAt } = parsed.data;
    console.log(`[URL_CONTROLLER][${reqId}] ⏳ Calling urlService.createUrl...`);
    const result = await urlService.createUrl(
      authReq.user.id,
      originalUrl,
      expiresAt,
    );
    console.log(`[URL_CONTROLLER][${reqId}] ✅ urlService.createUrl succeeded: shortCode=${result.url.short_code}`);

    sendSuccess(
      res,
      {
        url: result.url,
        shortUrl: result.shortUrl,
        id: result.url.id,
        short_code: result.url.short_code,
        original_url: result.url.original_url,
        created_at: result.url.created_at,
        expires_at: result.url.expires_at,
      },
      'Short URL created successfully',
      201,
    );
  } catch (err) {
    console.error(`[URL_CONTROLLER][${reqId}] ❌ Error in createUrl handler:`, (err as Error).message);
    next(err);
  }
}

/**
 * GET /api/urls
 * Get paginated URLs for the authenticated user.
 */
export async function getUserUrls(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const reqId = Math.random().toString(36).substring(2, 8);
  console.log(`[URL_CONTROLLER][${reqId}] 📥 Entered getUserUrls handler`);
  try {
    const authReq = req as AuthenticatedRequest;
    console.log(`[URL_CONTROLLER][${reqId}] 👤 Authenticated user: ${authReq.user?.id} | Query:`, JSON.stringify(req.query));

    const parsed = paginationSchema.safeParse(req.query);
    if (!parsed.success) {
      console.warn(`[URL_CONTROLLER][${reqId}] ⚠️ Invalid pagination:`, parsed.error.issues);
      sendError(res, 'Invalid pagination parameters', 400, z.prettifyError(parsed.error));
      return;
    }

    const { page, limit } = parsed.data;
    console.log(`[URL_CONTROLLER][${reqId}] ⏳ Calling urlService.getUserUrls(page=${page}, limit=${limit})...`);
    const result = await urlService.getUserUrls(authReq.user.id, page, limit);
    console.log(`[URL_CONTROLLER][${reqId}] ✅ urlService.getUserUrls succeeded: retrieved ${result.urls.length} URLs (total: ${result.pagination.total})`);

    sendSuccess(res, result, 'URLs retrieved successfully');
  } catch (err) {
    console.error(`[URL_CONTROLLER][${reqId}] ❌ Error in getUserUrls handler:`, (err as Error).message);
    next(err);
  }
}

/**
 * DELETE /api/urls/:id
 * Delete a URL owned by the authenticated user.
 */
export async function deleteUrl(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const reqId = Math.random().toString(36).substring(2, 8);
  console.log(`[URL_CONTROLLER][${reqId}] 📥 Entered deleteUrl handler`);
  try {
    const authReq = req as AuthenticatedRequest;
    const id = req.params.id as string | undefined;

    console.log(`[URL_CONTROLLER][${reqId}] 👤 Authenticated user: ${authReq.user?.id} | Target URL ID: "${id}"`);

    if (!id) {
      console.warn(`[URL_CONTROLLER][${reqId}] ⚠️ Missing URL id parameter`);
      sendError(res, 'URL id is required', 400);
      return;
    }

    console.log(`[URL_CONTROLLER][${reqId}] ⏳ Calling urlService.deleteUrl(id=${id})...`);
    await urlService.deleteUrl(id, authReq.user.id);
    console.log(`[URL_CONTROLLER][${reqId}] ✅ urlService.deleteUrl succeeded for id=${id}`);

    sendSuccess(res, null, 'URL deleted successfully');
  } catch (err) {
    console.error(`[URL_CONTROLLER][${reqId}] ❌ Error in deleteUrl handler:`, (err as Error).message);
    next(err);
  }
}

/**
 * GET /:shortCode
 * Redirect to the original URL and record clickstream event.
 */
export async function redirectUrl(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const reqId = Math.random().toString(36).substring(2, 8);
  const startTime = Date.now();
  const timestamp = new Date().toISOString();
  const shortCode = req.params.shortCode as string | undefined;

  const forwardedFor = req.headers['x-forwarded-for'];
  const realIp = req.headers['x-real-ip'];
  const clientIp = forwardedFor || realIp || req.ip || req.socket?.remoteAddress || 'unknown';
  const userAgent = (req.headers['user-agent'] as string | undefined) || 'none';
  const referer = (req.headers['referer'] || req.headers['referrer'] || 'none') as string;

  console.log(`[REDIRECT_ENDPOINT][${reqId}] 🎯 Redirection attempt received:`);
  console.log(`  • Timestamp       : ${timestamp}`);
  console.log(`  • Short Code      : "${shortCode}"`);
  console.log(`  • User IP         : ${clientIp}`);
  console.log(`  • User-Agent      : "${userAgent}"`);
  console.log(`  • Referer         : "${referer}"`);
  console.log(`  • Request URL     : ${req.method} ${req.originalUrl}`);

  try {
    if (!shortCode) {
      console.warn(`[REDIRECT_ENDPOINT][${reqId}] ⚠️ Redirection rejected: Short code is required in request parameters`);
      sendError(res, 'Short code is required', 400);
      return;
    }

    // Step 1: Resolve short code
    console.log(`[REDIRECT_ENDPOINT][${reqId}] ⏳ Resolving short code "${shortCode}"...`);
    const resolveStart = Date.now();
    const resolved = await urlService.resolveShortCode(shortCode);
    const resolveDuration = Date.now() - resolveStart;

    if (resolved.source === 'postgres') {
      metrics.recordRedirect('cache_miss');
      console.log(
        `[REDIRECT_ENDPOINT][${reqId}] ✅ Short code "${shortCode}" was successfully found in PostgreSQL: id=${resolved.urlId}, destination="${resolved.originalUrl}" (${resolveDuration}ms)`,
      );
    } else if (resolved.source === 'cache') {
      metrics.recordRedirect('cache_hit');
      console.log(
        `[REDIRECT_ENDPOINT][${reqId}] ✅ Short code "${shortCode}" was successfully found in Redis cache [backed by PostgreSQL record urlId=${resolved.urlId}]: destination="${resolved.originalUrl}" (${resolveDuration}ms)`,
      );
    } else {
      metrics.recordRedirect('cache_miss');
      console.log(
        `[REDIRECT_ENDPOINT][${reqId}] ✅ Short code "${shortCode}" successfully resolved: urlId=${resolved.urlId}, destination="${resolved.originalUrl}" (${resolveDuration}ms)`,
      );
    }

    // Step 2: Record and emit click event to analytics pipeline
    console.log(`[REDIRECT_ENDPOINT][${reqId}] 📊 Recording and emitting click event to analytics pipeline (Kafka)...`);
    const clickStart = Date.now();
    const clickEvent = await clickEventService.recordClick(resolved.urlId, resolved.shortCode, req);
    const clickDuration = Date.now() - clickStart;

    console.log(
      `[REDIRECT_ENDPOINT][${reqId}] ✅ Click event successfully recorded & emitted to Kafka: clickId=${clickEvent.clickId}, shortCode="${resolved.shortCode}", urlId=${resolved.urlId} (${clickDuration}ms)`,
    );

    // Step 3: Attach strict anti-caching headers
    res.set({
      'Cache-Control': 'private, no-cache, no-store, max-age=0, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    });

    // Check if client is a browser requesting HTML page vs programmatic client expecting direct HTTP 301 redirect
    const acceptsHtml = Boolean(
      req.headers.accept &&
        (req.headers.accept.includes('text/html') ||
          req.headers.accept.includes('application/xhtml+xml')),
    );
    const directRequested =
      req.query.direct === 'true' ||
      req.query.preview === 'false' ||
      (req.headers.accept && req.headers.accept.includes('application/json'));
    const shouldRenderSplash = acceptsHtml && !directRequested;

    const totalDuration = Date.now() - startTime;

    if (!shouldRenderSplash) {
      console.log(
        `[REDIRECT_ENDPOINT][${reqId}] 🚀 Issuing permanent redirect response (HTTP 301 Moved Permanently) to "${resolved.originalUrl}" for shortCode="${shortCode}" (total server time: ${totalDuration}ms)`,
      );
      res.redirect(301, resolved.originalUrl);
      return;
    }

    // Step 4: Render modern Bitly-style intermediate splash screen with 5s countdown
    console.log(
      `[REDIRECT_ENDPOINT][${reqId}] 🎨 Rendering Bitly-style intermediate splash screen (5s auto-redirect) to "${resolved.originalUrl}" for shortCode="${shortCode}" (total server time: ${totalDuration}ms)`,
    );
    const html = renderRedirectSplash({
      shortCode: resolved.shortCode,
      destinationUrl: resolved.originalUrl,
      countdownSeconds: 5,
    });
    res.status(200).type('html').send(html);
  } catch (err: any) {
    const totalDuration = Date.now() - startTime;
    if (err?.statusCode === 404) {
      metrics.recordRedirect('not_found');
    } else if (err?.statusCode === 410) {
      metrics.recordRedirect('expired');
    }
    console.error(
      `[REDIRECT_ENDPOINT][${reqId}] ❌ Redirection attempt failed for shortCode="${shortCode}" after ${totalDuration}ms: ${(err as Error).message}`,
      (err as Error).stack,
    );
    next(err);
  }
}

