import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod/v4';
import type { AuthenticatedRequest, UrlRow } from '../types/index.js';
import * as UrlModel from '../models/url.model.js';
import * as analyticsService from '../services/analytics.service.js';
import {
  shortCodeParamSchema,
  timelineQuerySchema,
  analyticsFilterQuerySchema,
} from '../utils/validators.js';
import { sendSuccess, sendError } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';

/**
 * Verify that the short URL exists and belongs to the authenticated user.
 * Throws 404 if not found, 403 if owned by another user.
 */
async function getOwnedUrl(shortCode: string, userId: string): Promise<UrlRow> {
  console.log(`[ANALYTICS_CONTROLLER] 🔍 Verifying ownership: shortCode="${shortCode}", userId="${userId}"`);
  const startTime = Date.now();
  const url = await UrlModel.findByShortCode(shortCode);

  if (!url) {
    console.warn(`[ANALYTICS_CONTROLLER] ❌ Short URL not found: "${shortCode}" (${Date.now() - startTime}ms)`);
    throw new AppError('Short URL not found', 404);
  }

  if (url.user_id !== userId) {
    console.warn(`[ANALYTICS_CONTROLLER] ⛔ Access denied: URL belongs to user "${url.user_id}", requesting user is "${userId}"`);
    throw new AppError('You are not authorised to view analytics for this URL', 403);
  }

  console.log(`[ANALYTICS_CONTROLLER] ✅ Ownership verified in ${Date.now() - startTime}ms for urlId="${url.id}"`);
  return url;
}

/**
 * GET /api/analytics/:shortCode/overview
 * Returns high-level metrics: totalClicks, clicksToday, clicksLast7Days, clicksLast30Days
 */
export async function getOverview(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const reqId = Math.random().toString(36).substring(2, 8);
  console.log(`[ANALYTICS_CONTROLLER][${reqId}] 📥 Entered getOverview handler for "${req.params.shortCode}"`);
  try {
    const authReq = req as AuthenticatedRequest;
    const parsedParams = shortCodeParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      console.warn(`[ANALYTICS_CONTROLLER][${reqId}] ⚠️ Invalid shortCode param:`, parsedParams.error.issues);
      sendError(res, 'Invalid short code parameter', 400, z.prettifyError(parsedParams.error));
      return;
    }

    const url = await getOwnedUrl(parsedParams.data.shortCode, authReq.user.id);
    const timezone = (req.query.timezone as string | undefined) || (req.headers['x-timezone'] as string | undefined);
    console.log(`[ANALYTICS_CONTROLLER][${reqId}] ⏳ Fetching overview metrics from analyticsService for urlId="${url.id}" (timezone: ${timezone || 'default'})...`);
    const overview = await analyticsService.getOverviewAnalytics({ urlId: url.id, timezone });
    console.log(`[ANALYTICS_CONTROLLER][${reqId}] ✅ Overview fetched:`, JSON.stringify(overview));

    sendSuccess(
      res,
      {
        url: {
          id: url.id,
          shortCode: url.short_code,
          originalUrl: url.original_url,
          createdAt: url.created_at,
          expiresAt: url.expires_at,
        },
        overview,
      },
      'Overview analytics retrieved successfully',
    );
  } catch (err) {
    console.error(`[ANALYTICS_CONTROLLER][${reqId}] ❌ Error in getOverview:`, (err as Error).message);
    next(err);
  }
}

/**
 * GET /api/analytics/:shortCode/timeline
 * Query params: startDate, endDate, interval ('hour' | 'day' | 'week')
 * Returns time-series data points suitable for charts.
 */
export async function getTimeline(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const reqId = Math.random().toString(36).substring(2, 8);
  console.log(`[ANALYTICS_CONTROLLER][${reqId}] 📥 Entered getTimeline handler for "${req.params.shortCode}" | Query:`, JSON.stringify(req.query));
  try {
    const authReq = req as AuthenticatedRequest;
    const parsedParams = shortCodeParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      console.warn(`[ANALYTICS_CONTROLLER][${reqId}] ⚠️ Invalid shortCode param:`, parsedParams.error.issues);
      sendError(res, 'Invalid short code parameter', 400, z.prettifyError(parsedParams.error));
      return;
    }

    const parsedQuery = timelineQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      console.warn(`[ANALYTICS_CONTROLLER][${reqId}] ⚠️ Invalid query params:`, parsedQuery.error.issues);
      sendError(res, 'Invalid query parameters', 400, z.prettifyError(parsedQuery.error));
      return;
    }

    const url = await getOwnedUrl(parsedParams.data.shortCode, authReq.user.id);
    const timezone = (req.query.timezone as string | undefined) || (req.headers['x-timezone'] as string | undefined);
    console.log(`[ANALYTICS_CONTROLLER][${reqId}] ⏳ Fetching timeline from analyticsService for urlId="${url.id}" (timezone: ${timezone || 'default'})...`);
    const timeline = await analyticsService.getClicksOverTime({
      urlId: url.id,
      startDate: parsedQuery.data.startDate,
      endDate: parsedQuery.data.endDate,
      interval: parsedQuery.data.interval,
      timezone,
    });
    console.log(`[ANALYTICS_CONTROLLER][${reqId}] ✅ Timeline fetched: ${timeline.length} points`);

    sendSuccess(res, timeline, 'Timeline analytics retrieved successfully');
  } catch (err) {
    console.error(`[ANALYTICS_CONTROLLER][${reqId}] ❌ Error in getTimeline:`, (err as Error).message);
    next(err);
  }
}

/**
 * GET /api/analytics/:shortCode/devices
 * Returns device breakdown (device, clicks, count, percentage).
 */
export async function getDevices(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const reqId = Math.random().toString(36).substring(2, 8);
  console.log(`[ANALYTICS_CONTROLLER][${reqId}] 📥 Entered getDevices handler for "${req.params.shortCode}"`);
  try {
    const authReq = req as AuthenticatedRequest;
    const parsedParams = shortCodeParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      console.warn(`[ANALYTICS_CONTROLLER][${reqId}] ⚠️ Invalid shortCode param:`, parsedParams.error.issues);
      sendError(res, 'Invalid short code parameter', 400, z.prettifyError(parsedParams.error));
      return;
    }

    const parsedQuery = analyticsFilterQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      console.warn(`[ANALYTICS_CONTROLLER][${reqId}] ⚠️ Invalid query params:`, parsedQuery.error.issues);
      sendError(res, 'Invalid query parameters', 400, z.prettifyError(parsedQuery.error));
      return;
    }

    const url = await getOwnedUrl(parsedParams.data.shortCode, authReq.user.id);
    console.log(`[ANALYTICS_CONTROLLER][${reqId}] ⏳ Fetching device stats for urlId="${url.id}"...`);
    const devices = await analyticsService.getClicksByDevice({
      urlId: url.id,
      startDate: parsedQuery.data.startDate,
      endDate: parsedQuery.data.endDate,
    });
    console.log(`[ANALYTICS_CONTROLLER][${reqId}] ✅ Devices fetched: ${devices.length} entries`);

    sendSuccess(res, devices, 'Device analytics retrieved successfully');
  } catch (err) {
    console.error(`[ANALYTICS_CONTROLLER][${reqId}] ❌ Error in getDevices:`, (err as Error).message);
    next(err);
  }
}

/**
 * GET /api/analytics/:shortCode/browsers
 * Returns browser breakdown (browser, clicks, count, percentage).
 */
export async function getBrowsers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const reqId = Math.random().toString(36).substring(2, 8);
  console.log(`[ANALYTICS_CONTROLLER][${reqId}] 📥 Entered getBrowsers handler for "${req.params.shortCode}"`);
  try {
    const authReq = req as AuthenticatedRequest;
    const parsedParams = shortCodeParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      console.warn(`[ANALYTICS_CONTROLLER][${reqId}] ⚠️ Invalid shortCode param:`, parsedParams.error.issues);
      sendError(res, 'Invalid short code parameter', 400, z.prettifyError(parsedParams.error));
      return;
    }

    const parsedQuery = analyticsFilterQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      console.warn(`[ANALYTICS_CONTROLLER][${reqId}] ⚠️ Invalid query params:`, parsedQuery.error.issues);
      sendError(res, 'Invalid query parameters', 400, z.prettifyError(parsedQuery.error));
      return;
    }

    const url = await getOwnedUrl(parsedParams.data.shortCode, authReq.user.id);
    console.log(`[ANALYTICS_CONTROLLER][${reqId}] ⏳ Fetching browser stats for urlId="${url.id}"...`);
    const browsers = await analyticsService.getClicksByBrowser({
      urlId: url.id,
      startDate: parsedQuery.data.startDate,
      endDate: parsedQuery.data.endDate,
    });
    console.log(`[ANALYTICS_CONTROLLER][${reqId}] ✅ Browsers fetched: ${browsers.length} entries`);

    sendSuccess(res, browsers, 'Browser analytics retrieved successfully');
  } catch (err) {
    console.error(`[ANALYTICS_CONTROLLER][${reqId}] ❌ Error in getBrowsers:`, (err as Error).message);
    next(err);
  }
}

/**
 * GET /api/analytics/:shortCode/os
 * Returns operating system breakdown (os, operatingSystem, clicks, count, percentage).
 */
export async function getOperatingSystems(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const reqId = Math.random().toString(36).substring(2, 8);
  console.log(`[ANALYTICS_CONTROLLER][${reqId}] 📥 Entered getOperatingSystems handler for "${req.params.shortCode}"`);
  try {
    const authReq = req as AuthenticatedRequest;
    const parsedParams = shortCodeParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      console.warn(`[ANALYTICS_CONTROLLER][${reqId}] ⚠️ Invalid shortCode param:`, parsedParams.error.issues);
      sendError(res, 'Invalid short code parameter', 400, z.prettifyError(parsedParams.error));
      return;
    }

    const parsedQuery = analyticsFilterQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      console.warn(`[ANALYTICS_CONTROLLER][${reqId}] ⚠️ Invalid query params:`, parsedQuery.error.issues);
      sendError(res, 'Invalid query parameters', 400, z.prettifyError(parsedQuery.error));
      return;
    }

    const url = await getOwnedUrl(parsedParams.data.shortCode, authReq.user.id);
    console.log(`[ANALYTICS_CONTROLLER][${reqId}] ⏳ Fetching OS stats for urlId="${url.id}"...`);
    const os = await analyticsService.getClicksByOperatingSystem({
      urlId: url.id,
      startDate: parsedQuery.data.startDate,
      endDate: parsedQuery.data.endDate,
    });
    console.log(`[ANALYTICS_CONTROLLER][${reqId}] ✅ Operating systems fetched: ${os.length} entries`);

    sendSuccess(res, os, 'Operating system analytics retrieved successfully');
  } catch (err) {
    console.error(`[ANALYTICS_CONTROLLER][${reqId}] ❌ Error in getOperatingSystems:`, (err as Error).message);
    next(err);
  }
}

/**
 * GET /api/analytics/:shortCode/referrers
 * Returns top referrer distribution (referrer, clicks, count, percentage).
 */
export async function getReferrers(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const reqId = Math.random().toString(36).substring(2, 8);
  console.log(`[ANALYTICS_CONTROLLER][${reqId}] 📥 Entered getReferrers handler for "${req.params.shortCode}"`);
  try {
    const authReq = req as AuthenticatedRequest;
    const parsedParams = shortCodeParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      console.warn(`[ANALYTICS_CONTROLLER][${reqId}] ⚠️ Invalid shortCode param:`, parsedParams.error.issues);
      sendError(res, 'Invalid short code parameter', 400, z.prettifyError(parsedParams.error));
      return;
    }

    const parsedQuery = analyticsFilterQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      console.warn(`[ANALYTICS_CONTROLLER][${reqId}] ⚠️ Invalid query params:`, parsedQuery.error.issues);
      sendError(res, 'Invalid query parameters', 400, z.prettifyError(parsedQuery.error));
      return;
    }

    const url = await getOwnedUrl(parsedParams.data.shortCode, authReq.user.id);
    console.log(`[ANALYTICS_CONTROLLER][${reqId}] ⏳ Fetching referrer stats for urlId="${url.id}"...`);
    const referrers = await analyticsService.getClicksByReferrer(
      {
        urlId: url.id,
        startDate: parsedQuery.data.startDate,
        endDate: parsedQuery.data.endDate,
      },
      parsedQuery.data.limit || 20,
    );
    console.log(`[ANALYTICS_CONTROLLER][${reqId}] ✅ Referrers fetched: ${referrers.length} entries`);

    sendSuccess(res, referrers, 'Referrer analytics retrieved successfully');
  } catch (err) {
    console.error(`[ANALYTICS_CONTROLLER][${reqId}] ❌ Error in getReferrers:`, (err as Error).message);
    next(err);
  }
}

/**
 * GET /api/analytics/:shortCode/countries
 * Returns geographic country breakdown (country, clicks, count, percentage).
 */
export async function getCountries(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const reqId = Math.random().toString(36).substring(2, 8);
  console.log(`[ANALYTICS_CONTROLLER][${reqId}] 📥 Entered getCountries handler for "${req.params.shortCode}"`);
  try {
    const authReq = req as AuthenticatedRequest;
    const parsedParams = shortCodeParamSchema.safeParse(req.params);
    if (!parsedParams.success) {
      console.warn(`[ANALYTICS_CONTROLLER][${reqId}] ⚠️ Invalid shortCode param:`, parsedParams.error.issues);
      sendError(res, 'Invalid short code parameter', 400, z.prettifyError(parsedParams.error));
      return;
    }

    const parsedQuery = analyticsFilterQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      console.warn(`[ANALYTICS_CONTROLLER][${reqId}] ⚠️ Invalid query params:`, parsedQuery.error.issues);
      sendError(res, 'Invalid query parameters', 400, z.prettifyError(parsedQuery.error));
      return;
    }

    const url = await getOwnedUrl(parsedParams.data.shortCode, authReq.user.id);
    console.log(`[ANALYTICS_CONTROLLER][${reqId}] ⏳ Fetching country stats for urlId="${url.id}"...`);
    const countries = await analyticsService.getClicksByCountry(
      {
        urlId: url.id,
        startDate: parsedQuery.data.startDate,
        endDate: parsedQuery.data.endDate,
      },
      parsedQuery.data.limit || 50,
    );
    console.log(`[ANALYTICS_CONTROLLER][${reqId}] ✅ Countries fetched: ${countries.length} entries`);

    sendSuccess(res, countries, 'Country analytics retrieved successfully');
  } catch (err) {
    console.error(`[ANALYTICS_CONTROLLER][${reqId}] ❌ Error in getCountries:`, (err as Error).message);
    next(err);
  }
}
