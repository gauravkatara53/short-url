import crypto from 'node:crypto';
import type { Request } from 'express';
import { UAParser } from 'ua-parser-js';
import * as clickEventModel from '../models/clickEvent.model.js';
import { publishClickEvent } from './kafkaProducer.service.js';
import { clickEventSchema } from '../utils/validators.js';
import type { ClickEvent, DeviceType } from '../types/index.js';

/**
 * Extract client IP address safely from Express request.
 * Inspects standard proxy headers (x-forwarded-for, x-real-ip) and socket address.
 */
export function extractIpAddress(req: Request): string | null {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = Array.isArray(forwardedFor)
      ? forwardedFor[0]
      : forwardedFor.split(',')[0];
    if (ips) {
      const cleanIp = ips.trim();
      return cleanIp.replace(/^::ffff:/, '') || null;
    }
  }

  const realIp = req.headers['x-real-ip'];
  if (realIp && typeof realIp === 'string') {
    return realIp.trim().replace(/^::ffff:/, '') || null;
  }

  const remoteAddress = req.socket?.remoteAddress || req.ip;
  if (remoteAddress) {
    return remoteAddress.replace(/^::ffff:/, '') || null;
  }

  return null;
}

/**
 * Classify device category into standard types: 'desktop' | 'mobile' | 'tablet' | 'unknown'.
 */
function classifyDevice(deviceType?: string, userAgent?: string | null): DeviceType {
  if (!userAgent || userAgent.trim() === '') {
    return 'unknown';
  }

  if (deviceType === 'mobile') return 'mobile';
  if (deviceType === 'tablet') return 'tablet';
  if (
    deviceType === 'smarttv' ||
    deviceType === 'console' ||
    deviceType === 'wearable' ||
    deviceType === 'embedded'
  ) {
    return 'unknown';
  }

  // ua-parser-js returns undefined device.type for standard desktop browsers
  return 'desktop';
}

/**
 * Parse raw User-Agent string into normalized device, browser, and operating system metadata.
 */
export function parseUserAgent(userAgent: string | null): {
  device: DeviceType;
  browser: string;
  operatingSystem: string;
} {
  if (!userAgent) {
    return {
      device: 'unknown',
      browser: 'Other',
      operatingSystem: 'Other',
    };
  }

  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  const device = classifyDevice(result.device.type, userAgent);
  const browser = result.browser.name || 'Other';
  const operatingSystem = result.os.name || 'Other';

  return { device, browser, operatingSystem };
}

/**
 * Extract HTTP referrer from request headers.
 */
export function extractReferrer(req: Request): string | null {
  const referrer =
    (req.headers['referer'] as string | undefined) ||
    (req.headers['referrer'] as string | undefined);

  return referrer?.trim() || null;
}

/**
 * Build a standardized, validated ClickEvent object from request metadata.
 */
export function buildClickEvent(
  urlId: string,
  shortCode: string,
  req: Request,
): ClickEvent {
  const ipAddress = extractIpAddress(req);
  const rawUserAgent = (req.headers['user-agent'] as string | undefined)?.trim() || null;
  const { device, browser, operatingSystem } = parseUserAgent(rawUserAgent);
  const referrer = extractReferrer(req);

  console.log(`[CLICK_EVENT] 🛠️ Building click event for shortCode="${shortCode}", urlId="${urlId}"`);
  console.log(`[CLICK_EVENT] 🔍 Request details -> IP: "${ipAddress}", UA: "${rawUserAgent}", Referrer: "${referrer}"`);
  console.log(`[CLICK_EVENT] 🔍 Parsed UA -> Device: "${device}", Browser: "${browser}", OS: "${operatingSystem}"`);

  const event: ClickEvent = {
    clickId: crypto.randomUUID(),
    urlId,
    shortCode,
    timestamp: new Date().toISOString(),
    ipAddress,
    userAgent: rawUserAgent,
    device,
    browser,
    operatingSystem,
    referrer,
    country: null, // Geolocation placeholder
    requestId: req.id || (req.headers['x-request-id'] as string | undefined),
  };

  // Validate event against Zod schema
  const validation = clickEventSchema.safeParse(event);
  if (!validation.success) {
    console.warn(
      `[CLICK_EVENT] ⚠️ Event validation warning for ${shortCode}:`,
      validation.error.issues,
    );
  } else {
    console.log(`[CLICK_EVENT] ✅ Event validated against schema: clickId=${event.clickId}`);
  }

  return event;
}

/**
 * Record a click event for a resolved short URL by streaming to Kafka.
 *
 * Resilience & Architectural Guarantee:
 * - ClickHouse and heavy analytics operations are KEPT OUT of the synchronous redirect path.
 * - Event is emitted to Kafka; ClickHouse ingestion is handled strictly by the background consumer worker.
 * - If publishing fails or Kafka is offline, errors are logged and caught so the redirect NEVER crashes with 500.
 */
export async function recordClick(
  urlId: string,
  shortCode: string,
  req: Request,
): Promise<ClickEvent> {
  const reqIdTag = req.id ? `[${req.id}]` : '';
  console.log(`[CLICK_EVENT]${reqIdTag} 🚀 recordClick initiated for shortCode="${shortCode}", urlId="${urlId}"`);
  const event = buildClickEvent(urlId, shortCode, req);

  // 1. Stream event to Kafka asynchronously
  try {
    console.log(`[CLICK_EVENT]${reqIdTag} ⏳ Streaming event to Kafka for clickId=${event.clickId}...`);
    const published = await publishClickEvent(event);
    if (!published) {
      console.warn(
        `[CLICK_EVENT]${reqIdTag} ⚠️ Kafka event streaming skipped/degraded for clickId=${event.clickId}, shortCode=${shortCode}`,
      );
    } else {
      console.log(`[CLICK_EVENT]${reqIdTag} ✅ Kafka streaming success for clickId=${event.clickId}`);
    }
  } catch (err) {
    console.error(
      `[CLICK_EVENT]${reqIdTag} ❌ Unexpected error streaming click event for ${shortCode}:`,
      (err as Error).message,
    );
  }

  // 2. Dual-sink: Optional persistence to PostgreSQL click_events table (for manual SQL inspections)
  try {
    console.log(`[CLICK_EVENT]${reqIdTag} ⏳ Persisting click event to PostgreSQL for clickId=${event.clickId}...`);
    const pgRow = await clickEventModel.create(event);
    console.log(`[CLICK_EVENT]${reqIdTag} ✅ Click event successfully persisted to PostgreSQL: id=${pgRow.id}, shortCode="${shortCode}"`);
  } catch (err) {
    console.error(
      `[CLICK_EVENT]${reqIdTag} ⚠️ PostgreSQL click event persistence warning for clickId=${event.clickId}, shortCode=${shortCode}:`,
      (err as Error).message,
    );
  }

  return event;
}

export { clickEventModel };
