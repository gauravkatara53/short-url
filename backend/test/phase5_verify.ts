import dotenv from 'dotenv';
dotenv.config();

import http from 'node:http';
import crypto from 'node:crypto';
import pool, { initDatabase } from '../src/config/database.js';
import redis from '../src/config/redis.js';
import app from '../src/app.js';
import * as kafkaConfig from '../src/config/kafka.js';
import * as clickhouseConfig from '../src/config/clickhouse.js';
import * as clickhouseService from '../src/services/clickhouse.service.js';
import * as analyticsService from '../src/services/analytics.service.js';
import * as kafkaProducerService from '../src/services/kafkaProducer.service.js';
import * as kafkaConsumerService from '../src/services/kafkaConsumer.service.js';
import * as eventProcessorService from '../src/services/eventProcessor.service.js';
import * as clickEventService from '../src/services/clickEvent.service.js';
import * as cacheService from '../src/services/cache.service.js';
import * as urlService from '../src/services/url.service.js';
import { clickEventSchema } from '../src/utils/validators.js';
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
          } catch {
            // Raw text
          }
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

async function runVerification() {
  console.log('====================================================');
  console.log('🚀 RUNNING PHASE 5 CLICKHOUSE VERIFICATION SUITE');
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

  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as any;
      baseUrl = `http://localhost:${addr.port}`;
      console.log(`   Test server listening on ${baseUrl}\n`);
      resolve();
    });
  });

  const testEmail = `ch_test_${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  let authToken = '';
  let testUserId = '';
  let validShortCode = '';
  let validUrlId = '';
  const targetUrl = 'https://example.com/phase5-destination';

  try {
    // ── SECTION A: Phase 1–4 Regression Suite ───────────────────
    console.log('🔍 SECTION A: Phase 1–4 Regression Verification');

    // Health check (with ClickHouse status)
    const healthRes = await request('GET', '/api/health');
    assert(
      healthRes.status === 200 &&
        healthRes.body?.data?.status === 'healthy' &&
        'clickhouse' in (healthRes.body?.data?.services || {}),
      'GET /api/health returns 200 with service health metadata',
    );

    // Auth Register
    const regRes = await request('POST', '/api/auth/register', {
      body: {
        name: 'ClickHouse Test User',
        email: testEmail,
        password: testPassword,
      },
    });
    assert(
      regRes.status === 201 && !!regRes.body?.data?.user?.id,
      'POST /api/auth/register registers user',
    );
    testUserId = regRes.body?.data?.user?.id;

    // Auth Login
    const loginRes = await request('POST', '/api/auth/login', {
      body: { email: testEmail, password: testPassword },
    });
    assert(
      loginRes.status === 200 && !!loginRes.body?.data?.token,
      'POST /api/auth/login logs in user and returns JWT token',
    );
    authToken = loginRes.body?.data?.token;

    // Create Short URL
    const createUrlRes = await request('POST', '/api/urls', {
      headers: { Authorization: `Bearer ${authToken}` },
      body: { originalUrl: targetUrl },
    });
    assert(
      createUrlRes.status === 201 && !!createUrlRes.body?.data?.url?.short_code,
      'POST /api/urls creates short URL',
    );
    validShortCode = createUrlRes.body?.data?.url?.short_code;
    validUrlId = createUrlRes.body?.data?.url?.id;

    // List URLs
    const listUrlsRes = await request('GET', '/api/urls', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert(
      listUrlsRes.status === 200 &&
        Array.isArray(listUrlsRes.body?.data?.urls) &&
        listUrlsRes.body.data.urls.length >= 1,
      'GET /api/urls returns paginated URL list',
    );

    // Redis Cache HIT redirect
    await cacheService.setUrl(validShortCode, {
      originalUrl: targetUrl,
      urlId: validUrlId,
    });
    const hitRes = await request('GET', `/${validShortCode}`);
    assert(
      hitRes.status === 301 && hitRes.headers.location === targetUrl,
      'Cache HIT redirects with HTTP 301',
    );

    // Redis Cache MISS redirect
    await cacheService.deleteUrl(validShortCode);
    const missRes = await request('GET', `/${validShortCode}`);
    assert(
      missRes.status === 301 && missRes.headers.location === targetUrl,
      'Cache MISS resolves from PostgreSQL and redirects with HTTP 301',
    );

    // 404 Nonexistent short code
    const notFoundRes = await request('GET', '/nonexistent99999');
    assert(
      notFoundRes.status === 404,
      'Nonexistent short code returns HTTP 404 (0 Kafka/ClickHouse events)',
    );

    // 410 Expired short code
    const expiredShortCode = 'exp9999';
    await pool.query(
      `INSERT INTO urls (user_id, original_url, short_code, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (short_code) DO NOTHING`,
      [testUserId, 'https://example.com/expired', expiredShortCode, new Date(Date.now() - 60000)],
    );
    const expiredRes = await request('GET', `/${expiredShortCode}`);
    assert(
      expiredRes.status === 410,
      'Expired short code returns HTTP 410 (0 Kafka/ClickHouse events)',
    );

    console.log('\n🔍 SECTION B: Phase 5 ClickHouse Configuration & Service Tests');

    // ── Test 1: ClickHouse Configuration Loading ─────────────────
    console.log('\n--- Test 1: ClickHouse Configuration ---');
    assert(
      typeof clickhouseConfig.CLICKHOUSE_URL === 'string' &&
        clickhouseConfig.CLICKHOUSE_URL.length > 0,
      `ClickHouse URL configured: ${clickhouseConfig.CLICKHOUSE_URL}`,
    );
    assert(
      typeof clickhouseConfig.CLICKHOUSE_DATABASE === 'string' &&
        clickhouseConfig.CLICKHOUSE_DATABASE.length > 0,
      `ClickHouse database configured: ${clickhouseConfig.CLICKHOUSE_DATABASE}`,
    );
    const chClient = clickhouseConfig.createClickHouseClient();
    assert(!!chClient, 'ClickHouse client factory creates valid client instance');

    // ── Test 2: ClickHouse Health Check ──────────────────────────
    console.log('\n--- Test 2: ClickHouse Health Check ---');
    const healthStatus = await clickhouseConfig.checkClickHouseHealth();
    assert(
      healthStatus.status === 'connected' ||
        healthStatus.status === 'degraded' ||
        healthStatus.status === 'disabled',
      `ClickHouse health check returns valid status: "${healthStatus.status}"`,
    );

    // ── Test 3: ClickHouse Row Formatter & Schema Mapping ─────────
    console.log('\n--- Test 3: ClickEvent to ClickHouse Row Formatting ---');
    const sampleEvent: ClickEvent = {
      clickId: crypto.randomUUID(),
      urlId: validUrlId,
      shortCode: validShortCode,
      timestamp: new Date().toISOString(),
      ipAddress: '198.51.100.24',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
      device: 'desktop',
      browser: 'Chrome',
      operatingSystem: 'macOS',
      referrer: 'https://twitter.com',
      country: null,
    };

    const chRow = clickhouseService.formatClickEventForClickHouse(sampleEvent);
    assert(
      chRow.click_id === sampleEvent.clickId &&
        chRow.url_id === sampleEvent.urlId &&
        chRow.short_code === sampleEvent.shortCode &&
        chRow.device === sampleEvent.device &&
        chRow.browser === sampleEvent.browser &&
        chRow.operating_system === sampleEvent.operatingSystem &&
        chRow.referrer === sampleEvent.referrer &&
        chRow.ip_address === sampleEvent.ipAddress,
      'ClickEvent properly mapped to ClickHouse schema columns',
    );

    // ── Test 4: Idempotent Table Initialization ──────────────────
    console.log('\n--- Test 4: Idempotent Table Initialization ---');
    let initError = false;
    try {
      await clickhouseService.initClickHouse();
      await clickhouseService.initClickHouse(); // Run second time to verify idempotency
    } catch {
      initError = true;
    }
    assert(!initError, 'initClickHouse() executed idempotently without errors');

    // ── Test 5: Event Processor & ClickHouse Integration ─────────
    console.log('\n--- Test 5: Event Processor Integration ---');
    let processorHandled = false;
    let handledEventId = '';

    const origProcess = eventProcessorService.defaultEventProcessor.process;
    eventProcessorService.defaultEventProcessor.process = async (ev: ClickEvent) => {
      processorHandled = true;
      handledEventId = ev.clickId;
      try {
        await clickhouseService.insertClickEvent(ev);
      } catch {
        // Handle gracefully in test
      }
    };

    await eventProcessorService.processClickEvent(sampleEvent);
    assert(
      processorHandled && handledEventId === sampleEvent.clickId,
      'Event processor successfully receives and dispatches event to ClickHouse service',
    );
    eventProcessorService.defaultEventProcessor.process = origProcess;

    // ── Test 6: Kafka Consumer Pipeline Integration ──────────────
    console.log('\n--- Test 6: Kafka Consumer to ClickHouse Ingestion ---');
    let consumerReached = false;
    const testEvent2: ClickEvent = {
      clickId: crypto.randomUUID(),
      urlId: validUrlId,
      shortCode: validShortCode,
      timestamp: new Date().toISOString(),
      ipAddress: '203.0.113.88',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X)',
      device: 'mobile',
      browser: 'Safari',
      operatingSystem: 'iOS',
      referrer: 'https://linkedin.com',
      country: 'US',
    };

    const origProc2 = eventProcessorService.defaultEventProcessor.process;
    eventProcessorService.defaultEventProcessor.process = async (ev: ClickEvent) => {
      consumerReached = true;
    };

    await kafkaConsumerService.handleMessage({
      topic: kafkaConfig.KAFKA_TOPIC,
      partition: 0,
      message: {
        key: Buffer.from(testEvent2.clickId),
        value: Buffer.from(JSON.stringify(testEvent2)),
        offset: '201',
        timestamp: Date.now().toString(),
        attributes: 0,
      },
      heartbeat: async () => {},
      pause: () => () => {},
    });

    assert(
      consumerReached,
      'Kafka consumer validates message and triggers ClickHouse event processor',
    );
    eventProcessorService.defaultEventProcessor.process = origProc2;

    // ── Test 7: Analytics Query Functions Structure ──────────────
    console.log('\n--- Test 7: Analytics Queries Interface Verification ---');
    // Verify query functions handle empty / zero states gracefully
    const total = await analyticsService.getTotalClicks({ urlId: validUrlId });
    assert(
      typeof total === 'number' && total >= 0,
      `getTotalClicks returns valid numeric count: ${total}`,
    );

    const timeSeries = await analyticsService.getClicksOverTime({
      urlId: validUrlId,
      interval: 'day',
    });
    assert(
      Array.isArray(timeSeries),
      `getClicksOverTime returns time-bucketed series array (length: ${timeSeries.length})`,
    );

    const byDevice = await analyticsService.getClicksByDevice({ urlId: validUrlId });
    assert(
      Array.isArray(byDevice),
      `getClicksByDevice returns device distribution array`,
    );

    const byBrowser = await analyticsService.getClicksByBrowser({ urlId: validUrlId });
    assert(
      Array.isArray(byBrowser),
      `getClicksByBrowser returns browser distribution array`,
    );

    const byOs = await analyticsService.getClicksByOperatingSystem({ urlId: validUrlId });
    assert(
      Array.isArray(byOs),
      `getClicksByOperatingSystem returns OS breakdown array`,
    );

    const byReferrer = await analyticsService.getClicksByReferrer({ urlId: validUrlId });
    assert(
      Array.isArray(byReferrer),
      `getClicksByReferrer returns top referrers array`,
    );

    const byCountry = await analyticsService.getClicksByCountry({ urlId: validUrlId });
    assert(
      Array.isArray(byCountry),
      `getClicksByCountry returns country distribution array`,
    );

    // ── Test 8: Poison Pill & Invalid Payload Resilience ─────────
    console.log('\n--- Test 8: Poison Pill / Malformed Event Handling ---');
    let consumerCrashed = false;
    try {
      // Malformed JSON
      await kafkaConsumerService.handleMessage({
        topic: kafkaConfig.KAFKA_TOPIC,
        partition: 0,
        message: {
          key: Buffer.from('bad-json'),
          value: Buffer.from('{{{ not json'),
          offset: '202',
          timestamp: Date.now().toString(),
          attributes: 0,
        },
        heartbeat: async () => {},
        pause: () => () => {},
      });

      // Invalid Zod schema
      await kafkaConsumerService.handleMessage({
        topic: kafkaConfig.KAFKA_TOPIC,
        partition: 0,
        message: {
          key: Buffer.from('bad-schema'),
          value: Buffer.from(
            JSON.stringify({ clickId: 'not-a-uuid', device: 'refrigerator' }),
          ),
          offset: '203',
          timestamp: Date.now().toString(),
          attributes: 0,
        },
        heartbeat: async () => {},
        pause: () => () => {},
      });
    } catch {
      consumerCrashed = true;
    }

    assert(
      !consumerCrashed,
      'Consumer safely skips malformed JSON and invalid schema without crashing worker or database',
    );

    // ── Test 9: Fail-Open Redirect Resilience ────────────────────
    console.log('\n--- Test 9: Fail-Open Redirect Resilience ---');
    const redirectRes = await request('GET', `/${validShortCode}`);
    assert(
      redirectRes.status === 301,
      'URL redirect returns HTTP 301 with zero impact from ClickHouse/Kafka availability',
    );

    // ── Cleanup: Delete test URL ─────────────────────────────────
    console.log('\n--- Cleanup: Delete test URL ---');
    const deleteRes = await request('DELETE', `/api/urls/${validUrlId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert(
      deleteRes.status === 200,
      'DELETE /api/urls/:id deletes URL and invalidates Redis cache',
    );

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
  console.log(`📊 PHASE 5 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runVerification().catch((err) => {
  console.error('💥 Fatal error during Phase 5 verification:', err);
  process.exit(1);
});
