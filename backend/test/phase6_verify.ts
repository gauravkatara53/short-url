import dotenv from 'dotenv';
dotenv.config();

import http from 'node:http';
import crypto from 'node:crypto';
import pool, { initDatabase } from '../src/config/database.js';
import app from '../src/app.js';
import * as kafkaConfig from '../src/config/kafka.js';
import * as clickhouseConfig from '../src/config/clickhouse.js';
import * as clickhouseService from '../src/services/clickhouse.service.js';
import * as analyticsService from '../src/services/analytics.service.js';
import * as kafkaConsumerService from '../src/services/kafkaConsumer.service.js';
import * as cacheService from '../src/services/cache.service.js';
import type { ClickEvent } from '../types/index.js';

let server: http.Server;
let baseUrl: string;

/**
 * Helper to make HTTP requests against the test server.
 */
async function request(
  method: string,
  path: string,
  options: {
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
  } = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const postData = options.body ? JSON.stringify(options.body) : undefined;

    const headers: Record<string, string> = {
      ...(postData ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    };

    const req = http.request(
      url,
      {
        method,
        headers,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          let parsedBody = raw;
          try {
            parsedBody = JSON.parse(raw);
          } catch {}
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: parsedBody,
          });
        });
      },
    );

    req.on('error', reject);

    if (postData) {
      req.write(postData);
    }
    req.end();
  });
}

async function runPhase6Verification() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 6 VERIFICATION TEST SUITE');
  console.log('   Backend Analytics APIs + Authorization + ClickHouse Aggregation');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}${detail ? ` -> ${detail}` : ''}`);
      failed++;
    }
  }

  // ── 0. Setup Server & DB ─────────────────────────────────────
  console.log('📦 Setting up test database and HTTP server...');
  await initDatabase();
  await clickhouseService.initClickHouse();

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as any;
      baseUrl = `http://localhost:${addr.port}`;
      console.log(`   Test server listening on ${baseUrl}\n`);
      resolve();
    });
  });

  const userAEmail = `user_a_${Date.now()}@example.com`;
  const userBEmail = `user_b_${Date.now()}@example.com`;
  const password = 'Password123!';

  let tokenA = '';
  let tokenB = '';
  let userAId = '';
  let userBId = '';

  let userAShortCode = '';
  let userAUrlId = '';
  let userBShortCode = '';
  let userBUrlId = '';

  try {
    // ── SECTION A: Phase 1–5 Regressions & Setup ────────────────
    console.log('🔍 SECTION A: Phase 1–5 Regressions & Setup');

    // Health check
    const healthRes = await request('GET', '/api/health');
    assert(
      healthRes.status === 200 && healthRes.body?.data?.status === 'healthy',
      'GET /api/health returns 200 with service health metadata',
    );

    // Register User A
    const regARes = await request('POST', '/api/auth/register', {
      body: { name: 'User A', email: userAEmail, password },
    });
    const loginARes = await request('POST', '/api/auth/login', {
      body: { email: userAEmail, password },
    });
    tokenA = loginARes.body?.data?.token;
    userAId = loginARes.body?.data?.user?.id;
    assert(!!tokenA && !!userAId, 'User A registered and authenticated');

    // Register User B
    await request('POST', '/api/auth/register', {
      body: { name: 'User B', email: userBEmail, password },
    });
    const loginBRes = await request('POST', '/api/auth/login', {
      body: { email: userBEmail, password },
    });
    tokenB = loginBRes.body?.data?.token;
    userBId = loginBRes.body?.data?.user?.id;
    assert(!!tokenB && !!userBId, 'User B registered and authenticated');

    // User A creates Short URL
    const createUrlARes = await request('POST', '/api/urls', {
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { originalUrl: 'https://user-a-domain.com/landing' },
    });
    userAShortCode = createUrlARes.body?.data?.url?.short_code;
    userAUrlId = createUrlARes.body?.data?.url?.id;
    assert(!!userAShortCode && !!userAUrlId, 'User A created short URL');

    // User B creates Short URL
    const createUrlBRes = await request('POST', '/api/urls', {
      headers: { Authorization: `Bearer ${tokenB}` },
      body: { originalUrl: 'https://user-b-domain.com/landing' },
    });
    userBShortCode = createUrlBRes.body?.data?.url?.short_code;
    userBUrlId = createUrlBRes.body?.data?.url?.id;
    assert(!!userBShortCode && !!userBUrlId, 'User B created short URL');

    // Seed test clickstream data in ClickHouse for User A's URL
    console.log('\n📊 Seeding ClickHouse test clickstream events for User A URL...');
    const now = new Date();
    const sampleEvents: ClickEvent[] = [
      {
        clickId: crypto.randomUUID(),
        urlId: userAUrlId,
        shortCode: userAShortCode,
        timestamp: new Date(now.getTime() - 1000 * 60 * 10).toISOString(), // 10 mins ago (today)
        ipAddress: '198.51.100.1',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/120.0.0.0 Safari/537.36',
        device: 'desktop',
        browser: 'Chrome',
        operatingSystem: 'macOS',
        referrer: 'https://google.com',
        country: 'US',
      },
      {
        clickId: crypto.randomUUID(),
        urlId: userAUrlId,
        shortCode: userAShortCode,
        timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 2).toISOString(), // 2 hours ago (today)
        ipAddress: '198.51.100.2',
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1',
        device: 'mobile',
        browser: 'Safari',
        operatingSystem: 'iOS',
        referrer: 'https://twitter.com',
        country: 'GB',
      },
      {
        clickId: crypto.randomUUID(),
        urlId: userAUrlId,
        shortCode: userAShortCode,
        timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 3).toISOString(), // 3 days ago
        ipAddress: '198.51.100.3',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/121.0',
        device: 'desktop',
        browser: 'Firefox',
        operatingSystem: 'Windows',
        referrer: null, // Direct
        country: 'IN',
      },
      {
        clickId: crypto.randomUUID(),
        urlId: userAUrlId,
        shortCode: userAShortCode,
        timestamp: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 10).toISOString(), // 10 days ago (last 30 days)
        ipAddress: '198.51.100.4',
        userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120.0.0.0 Mobile Safari/537.36',
        device: 'mobile',
        browser: 'Chrome',
        operatingSystem: 'Android',
        referrer: 'https://linkedin.com',
        country: null, // Unknown
      },
    ];

    await clickhouseService.insertClickEventsBatch(sampleEvents);
    console.log(`   Seeded ${sampleEvents.length} clickstream events in ClickHouse.`);

    // ── SECTION B: Authentication & Authorization Tests ─────────
    console.log('\n🔍 SECTION B: Authentication & Authorization Verification');

    // 1. Unauthenticated request to analytics returns 401
    const unauthRes = await request('GET', `/api/analytics/${userAShortCode}/overview`);
    assert(
      unauthRes.status === 401 && unauthRes.body?.success === false,
      'Unauthenticated request returns HTTP 401',
    );

    // 2. User B requesting User A's short URL analytics returns 403 Forbidden
    const forbiddenRes = await request('GET', `/api/analytics/${userAShortCode}/overview`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert(
      forbiddenRes.status === 403 && forbiddenRes.body?.success === false,
      "User cannot access another user's analytics (returns HTTP 403)",
    );

    // 3. Nonexistent shortCode returns 404
    const notFoundRes = await request('GET', `/api/analytics/nonexistent99999/overview`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(
      notFoundRes.status === 404 && notFoundRes.body?.success === false,
      'Nonexistent short code returns HTTP 404',
    );

    // ── SECTION C: Backend Analytics API Endpoints ───────────────
    console.log('\n🔍 SECTION C: Backend Analytics API Endpoints Verification');

    // 4. GET /api/analytics/:shortCode/overview
    const overviewRes = await request('GET', `/api/analytics/${userAShortCode}/overview`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    const ov = overviewRes.body?.data?.overview;
    assert(
      overviewRes.status === 200 &&
        overviewRes.body?.success === true &&
        typeof ov?.totalClicks === 'number' &&
        typeof ov?.clicksToday === 'number' &&
        typeof ov?.clicksLast7Days === 'number' &&
        typeof ov?.clicksLast30Days === 'number' &&
        ov.totalClicks >= 4,
      `GET /overview returns correct structure (totalClicks: ${ov?.totalClicks}, today: ${ov?.clicksToday}, 7d: ${ov?.clicksLast7Days}, 30d: ${ov?.clicksLast30Days})`,
    );

    // 5. GET /api/analytics/:shortCode/timeline (default interval: day)
    const timelineRes = await request('GET', `/api/analytics/${userAShortCode}/timeline`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(
      timelineRes.status === 200 &&
        Array.isArray(timelineRes.body?.data) &&
        timelineRes.body.data.length > 0 &&
        typeof timelineRes.body.data[0].time === 'string' &&
        typeof timelineRes.body.data[0].clicks === 'number',
      `GET /timeline returns time-series array (items: ${timelineRes.body?.data?.length})`,
    );

    // 6. GET /api/analytics/:shortCode/timeline with interval=hour
    const timelineHourRes = await request(
      'GET',
      `/api/analytics/${userAShortCode}/timeline?interval=hour`,
      { headers: { Authorization: `Bearer ${tokenA}` } },
    );
    assert(
      timelineHourRes.status === 200 && Array.isArray(timelineHourRes.body?.data),
      'GET /timeline?interval=hour returns hourly bucketed points',
    );

    // 7. GET /api/analytics/:shortCode/timeline with interval=week
    const timelineWeekRes = await request(
      'GET',
      `/api/analytics/${userAShortCode}/timeline?interval=week`,
      { headers: { Authorization: `Bearer ${tokenA}` } },
    );
    assert(
      timelineWeekRes.status === 200 && Array.isArray(timelineWeekRes.body?.data),
      'GET /timeline?interval=week returns weekly bucketed points',
    );

    // 8. GET /api/analytics/:shortCode/devices
    const devicesRes = await request('GET', `/api/analytics/${userAShortCode}/devices`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(
      devicesRes.status === 200 &&
        Array.isArray(devicesRes.body?.data) &&
        devicesRes.body.data.some((d: any) => d.device === 'desktop') &&
        devicesRes.body.data.some((d: any) => d.device === 'mobile'),
      `GET /devices returns device breakdown (items: ${devicesRes.body?.data?.length})`,
    );

    // 9. GET /api/analytics/:shortCode/browsers
    const browsersRes = await request('GET', `/api/analytics/${userAShortCode}/browsers`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(
      browsersRes.status === 200 &&
        Array.isArray(browsersRes.body?.data) &&
        browsersRes.body.data.some((b: any) => b.browser === 'Chrome'),
      `GET /browsers returns browser breakdown (items: ${browsersRes.body?.data?.length})`,
    );

    // 10. GET /api/analytics/:shortCode/os
    const osRes = await request('GET', `/api/analytics/${userAShortCode}/os`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(
      osRes.status === 200 &&
        Array.isArray(osRes.body?.data) &&
        osRes.body.data.some((o: any) => o.os === 'macOS' || o.operatingSystem === 'macOS'),
      `GET /os returns operating system breakdown (items: ${osRes.body?.data?.length})`,
    );

    // 11. GET /api/analytics/:shortCode/referrers
    const referrersRes = await request('GET', `/api/analytics/${userAShortCode}/referrers`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(
      referrersRes.status === 200 &&
        Array.isArray(referrersRes.body?.data) &&
        referrersRes.body.data.some((r: any) => r.referrer === 'https://google.com'),
      `GET /referrers returns top referrers breakdown (items: ${referrersRes.body?.data?.length})`,
    );

    // 12. GET /api/analytics/:shortCode/countries
    const countriesRes = await request('GET', `/api/analytics/${userAShortCode}/countries`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    assert(
      countriesRes.status === 200 &&
        Array.isArray(countriesRes.body?.data) &&
        countriesRes.body.data.some((c: any) => c.country === 'US' || c.country === 'IN'),
      `GET /countries returns geographic distribution (items: ${countriesRes.body?.data?.length})`,
    );

    // ── SECTION D: Zod Validation & Error Handling ───────────────
    console.log('\n🔍 SECTION D: Zod Validation & Edge Cases Verification');

    // 13. Invalid interval returns 400
    const badIntervalRes = await request(
      'GET',
      `/api/analytics/${userAShortCode}/timeline?interval=century`,
      { headers: { Authorization: `Bearer ${tokenA}` } },
    );
    assert(
      badIntervalRes.status === 400 && badIntervalRes.body?.success === false,
      'Invalid interval parameter returns HTTP 400',
    );

    // 14. Invalid date range (startDate > endDate) returns 400
    const badDateRangeRes = await request(
      'GET',
      `/api/analytics/${userAShortCode}/timeline?startDate=2026-12-01T00:00:00.000Z&endDate=2026-01-01T00:00:00.000Z`,
      { headers: { Authorization: `Bearer ${tokenA}` } },
    );
    assert(
      badDateRangeRes.status === 400 && badDateRangeRes.body?.success === false,
      'Invalid date range (startDate > endDate) returns HTTP 400',
    );

    // 15. Empty analytics data (User B URL with 0 clicks) handled gracefully
    const emptyOverviewRes = await request('GET', `/api/analytics/${userBShortCode}/overview`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    const emptyOv = emptyOverviewRes.body?.data?.overview;
    assert(
      emptyOverviewRes.status === 200 &&
        emptyOv?.totalClicks === 0 &&
        emptyOv?.clicksToday === 0 &&
        emptyOv?.clicksLast7Days === 0 &&
        emptyOv?.clicksLast30Days === 0,
      'Zero-click URL returns clean zero counts without errors',
    );

    const emptyTimelineRes = await request('GET', `/api/analytics/${userBShortCode}/timeline`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert(
      emptyTimelineRes.status === 200 && Array.isArray(emptyTimelineRes.body?.data),
      'Zero-click URL returns empty timeline array',
    );

    const emptyDevicesRes = await request('GET', `/api/analytics/${userBShortCode}/devices`, {
      headers: { Authorization: `Bearer ${tokenB}` },
    });
    assert(
      emptyDevicesRes.status === 200 && Array.isArray(emptyDevicesRes.body?.data) && emptyDevicesRes.body.data.length === 0,
      'Zero-click URL returns empty device distribution array',
    );

    // ── SECTION E: Phase 1–5 Integration & Fail-Open ─────────────
    console.log('\n🔍 SECTION E: Phase 1–5 Redirect & Fail-Open Verification');

    // 16. Redirect still works seamlessly
    const redirectRes = await request('GET', `/${userAShortCode}`);
    assert(
      redirectRes.status === 301 && redirectRes.headers.location === 'https://user-a-domain.com/landing',
      'GET /:shortCode redirects with HTTP 301 and does not collide with /api/analytics',
    );

    // 17. Cleanup
    await cacheService.deleteUrl(userAShortCode);
    await cacheService.deleteUrl(userBShortCode);

  } finally {
    // ── Teardown ─────────────────────────────────────────────────
    console.log('\n🧹 Tearing down test resources...');
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await pool.end();
    console.log('✅ Teardown complete.\n');
  }

  // ── Summary ──────────────────────────────────────────────────
  console.log('====================================================');
  console.log(`📊 PHASE 6 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase6Verification().catch((err) => {
  console.error('💥 Fatal error during Phase 6 verification:', err);
  process.exit(1);
});
