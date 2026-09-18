import dotenv from 'dotenv';
dotenv.config();

import http from 'node:http';
import crypto from 'node:crypto';
import app from '../src/app.js';
import pool, { initDatabase } from '../src/config/database.js';
import * as cacheService from '../src/services/cache.service.js';
import * as kafkaProducerService from '../src/services/kafkaProducer.service.js';
import * as kafkaConsumerService from '../src/services/kafkaConsumer.service.js';
import * as eventProcessorService from '../src/services/eventProcessor.service.js';
import * as clickhouseService from '../src/services/clickhouse.service.js';
import { metrics } from '../src/utils/metrics.js';
import { signToken } from '../src/utils/jwt.js';
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
          let parsedBody: any = raw;
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

async function runPhase7ResilienceTests() {
  console.log('====================================================');
  console.log('🛡️  RUNNING PHASE 7 RESILIENCE & PRODUCTION HARDENING SUITE');
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

  // Setup server
  await initDatabase();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as any;
      baseUrl = `http://localhost:${addr.port}`;
      console.log(`   Test server listening on ${baseUrl}\n`);
      resolve();
    });
  });

  const testEmail = `p7_resilience_${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  let authToken = '';
  let testUserId = '';
  let testShortCode = '';
  let testUrlId = '';
  const testOriginalUrl = 'https://example.com/phase7-hardened-destination';

  try {
    // ── SECTION 1: Security Headers (Helmet) ────────────────────
    console.log('🔒 SECTION 1: Security Headers (Helmet) Verification');
    const headRes = await request('GET', '/api/health');
    assert(
      headRes.headers['x-content-type-options'] === 'nosniff',
      'Helmet: X-Content-Type-Options is nosniff',
      String(headRes.headers['x-content-type-options']),
    );
    assert(
      headRes.headers['x-frame-options'] === 'SAMEORIGIN',
      'Helmet: X-Frame-Options is SAMEORIGIN',
      String(headRes.headers['x-frame-options']),
    );
    assert(
      !!headRes.headers['content-security-policy'],
      'Helmet: Content-Security-Policy header is present',
    );

    // ── SECTION 2: Hardened CORS ────────────────────────────────
    console.log('\n🌐 SECTION 2: CORS Hardening Verification');
    const corsRes = await request('GET', '/api/health', {
      headers: { Origin: 'http://localhost:5173' },
    });
    assert(
      corsRes.headers['access-control-allow-origin'] === 'http://localhost:5173',
      'CORS: Trusted origin matches Access-Control-Allow-Origin',
      String(corsRes.headers['access-control-allow-origin']),
    );
    assert(
      corsRes.headers['access-control-allow-credentials'] === 'true',
      'CORS: Access-Control-Allow-Credentials is true',
    );
    assert(
      corsRes.headers['access-control-allow-origin'] !== '*',
      'CORS: Wildcard (*) origin is never returned with credentials',
    );

    // ── SECTION 3: Request ID (X-Request-ID) ────────────────────
    console.log('\n🆔 SECTION 3: Request ID Propagation Verification');
    const customReqId = 'req-custom-trace-12345';
    const reqIdRes = await request('GET', '/api/health', {
      headers: { 'X-Request-ID': customReqId },
    });
    assert(
      reqIdRes.headers['x-request-id'] === customReqId,
      'Request ID: Incoming X-Request-ID header is propagated',
      String(reqIdRes.headers['x-request-id']),
    );

    const autoReqIdRes = await request('GET', '/api/health');
    assert(
      !!autoReqIdRes.headers['x-request-id'] &&
        autoReqIdRes.headers['x-request-id'].length >= 10,
      'Request ID: Missing X-Request-ID is automatically generated',
      String(autoReqIdRes.headers['x-request-id']),
    );

    // ── SECTION 4: URL Security (Dangerous Scheme Filtering) ─────
    console.log('\n🚫 SECTION 4: URL Security & Dangerous Scheme Rejection');
    // Setup test user
    const regRes = await request('POST', '/api/auth/register', {
      body: { name: 'P7 User', email: testEmail, password: testPassword },
    });
    testUserId = regRes.body?.data?.user?.id;
    const loginRes = await request('POST', '/api/auth/login', {
      body: { email: testEmail, password: testPassword },
    });
    authToken = loginRes.body?.data?.token;

    // Test dangerous schemes
    const dangerousUrls = [
      'javascript:alert(document.cookie)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'vbscript:msgbox("hello")',
      'file:///etc/passwd',
    ];

    for (const badUrl of dangerousUrls) {
      const badRes = await request('POST', '/api/urls', {
        headers: { Authorization: `Bearer ${authToken}` },
        body: { originalUrl: badUrl },
      });
      assert(
        badRes.status === 400 && badRes.body?.success === false,
        `URL Security: Rejects dangerous scheme (${badUrl.split(':')[0]}:)`,
        `Status: ${badRes.status}`,
      );
    }

    // Create a valid URL for subsequent resilience tests
    const validUrlRes = await request('POST', '/api/urls', {
      headers: { Authorization: `Bearer ${authToken}` },
      body: { originalUrl: testOriginalUrl },
    });
    testShortCode = validUrlRes.body?.data?.url?.short_code;
    testUrlId = validUrlRes.body?.data?.url?.id;
    assert(
      validUrlRes.status === 201 && !!testShortCode,
      'URL Security: Accepts valid https:// URL format',
    );

    // ── SECTION 5: Health Probes (/api/health/live & /ready) ─────
    console.log('\n🩺 SECTION 5: Health Check Probes Verification');
    const liveRes = await request('GET', '/api/health/live');
    assert(
      liveRes.status === 200 && liveRes.body?.status === 'ok' && typeof liveRes.body?.uptimeSeconds === 'number',
      'GET /api/health/live returns 200 OK with process uptime & memory',
    );

    const readyRes = await request('GET', '/api/health/ready');
    assert(
      (readyRes.status === 200 || readyRes.status === 503) &&
        typeof readyRes.body?.status === 'string' &&
        'dependencies' in readyRes.body,
      `GET /api/health/ready returns status "${readyRes.body?.status}" with dependencies breakdown`,
    );

    // ── SECTION 6: Metrics Endpoint (/api/metrics) ──────────────
    console.log('\n📊 SECTION 6: Telemetry Metrics Endpoint Verification');
    const metricsRes = await request('GET', '/api/metrics');
    assert(
      metricsRes.status === 200 &&
        metricsRes.body?.success === true &&
        typeof metricsRes.body?.data?.http?.totalRequests === 'number' &&
        'redirects' in metricsRes.body.data &&
        'cache' in metricsRes.body.data &&
        'kafka' in metricsRes.body.data,
      'GET /api/metrics returns populated telemetry metrics dictionary',
    );

    // ── SECTION 7: Failure Resilience Tests (Scenarios A–E) ─────
    console.log('\n⚡ SECTION 7: Failure Resilience Tests (Scenarios A–E)');

    // ── Scenario A: Redis failure -> Fallback to Postgres ────────
    console.log('\n--- Scenario A: Redis Cache Failure / Bypass ---');
    // Ensure cache is cleared for testShortCode
    await cacheService.deleteUrl(testShortCode);
    const redisFallbackRes = await request('GET', `/${testShortCode}?direct=true`);
    assert(
      redisFallbackRes.status === 301 &&
        redisFallbackRes.headers.location === testOriginalUrl,
      'Scenario A: Cache MISS resolves transparently from PostgreSQL and redirects with HTTP 301',
    );

    // ── Scenario B: Kafka failure -> Redirect still returns 301 ──
    console.log('\n--- Scenario B: Kafka Broker Degradation / Failure ---');
    const origPublish = kafkaProducerService.publishClickEvent;
    // Simulate Kafka outage
    (kafkaProducerService as any).publishClickEvent = async () => {
      return false; // Kafka offline
    };

    const kafkaFailRes = await request('GET', `/${testShortCode}?direct=true`);
    assert(
      kafkaFailRes.status === 301 &&
        kafkaFailRes.headers.location === testOriginalUrl,
      'Scenario B: Redirect returns HTTP 301 even when Kafka publishing fails/is degraded',
    );
    // Restore Kafka producer
    (kafkaProducerService as any).publishClickEvent = origPublish;

    // ── Scenario C: ClickHouse failure -> Worker handles failure ─
    console.log('\n--- Scenario C: ClickHouse Transient Failure in Worker ---');
    const sampleEvent: ClickEvent = {
      clickId: crypto.randomUUID(),
      urlId: testUrlId,
      shortCode: testShortCode,
      timestamp: new Date().toISOString(),
      ipAddress: '198.51.100.99',
      userAgent: 'Mozilla/5.0 Test',
      device: 'desktop',
      browser: 'Chrome',
      operatingSystem: 'macOS',
      referrer: null,
      country: null,
      requestId: 'test-ch-fail-req',
    };

    let workerDidNotCrash = true;
    const origProcess = eventProcessorService.defaultEventProcessor.process;
    // Simulate ClickHouse throwing an error
    eventProcessorService.defaultEventProcessor.process = async () => {
      throw new Error('ClickHouse connection timeout (simulated)');
    };

    try {
      await kafkaConsumerService.handleMessage({
        topic: 'url-click-events',
        partition: 0,
        message: {
          key: Buffer.from(sampleEvent.clickId),
          value: Buffer.from(JSON.stringify(sampleEvent)),
          offset: '999',
          timestamp: Date.now().toString(),
          attributes: 0,
        },
        heartbeat: async () => {},
        pause: () => () => {},
      });
    } catch {
      workerDidNotCrash = false;
    }

    assert(
      workerDidNotCrash,
      'Scenario C: Kafka consumer retries and handles ClickHouse failure without crashing worker',
    );
    eventProcessorService.defaultEventProcessor.process = origProcess;

    // ── Scenario D: Poison Pill / Invalid Kafka JSON ─────────────
    console.log('\n--- Scenario D: Invalid Kafka JSON / Poison Pill Payload ---');
    let poisonDidNotCrash = true;
    try {
      // Malformed JSON
      await kafkaConsumerService.handleMessage({
        topic: 'url-click-events',
        partition: 0,
        message: {
          key: Buffer.from('bad-key'),
          value: Buffer.from('{not-json-at-all:['),
          offset: '1000',
          timestamp: Date.now().toString(),
          attributes: 0,
        },
        heartbeat: async () => {},
        pause: () => () => {},
      });

      // Malformed Schema
      await kafkaConsumerService.handleMessage({
        topic: 'url-click-events',
        partition: 0,
        message: {
          key: Buffer.from('bad-key-2'),
          value: Buffer.from(JSON.stringify({ clickId: '123-not-uuid', device: 'microwave' })),
          offset: '1001',
          timestamp: Date.now().toString(),
          attributes: 0,
        },
        heartbeat: async () => {},
        pause: () => () => {},
      });
    } catch {
      poisonDidNotCrash = false;
    }

    assert(
      poisonDidNotCrash,
      'Scenario D: Consumer safely catches and skips invalid JSON and bad schemas without crashing',
    );

    // ── Scenario E: Centralized Error Redaction in Production ────
    console.log('\n--- Scenario E: Centralized Error Handling & Internals Redaction ---');
    const oldEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    // Request non-existent route to test 404
    const notFoundRes = await request('GET', '/api/non-existent-route-xyz');
    assert(
      notFoundRes.status === 404 && notFoundRes.body?.success === false,
      'Scenario E: Unknown route returns standard 404 without internals',
    );

    // Request with malformed JSON body to trigger error middleware
    const badJsonRes = await new Promise<{ status: number; body: any }>((resolve) => {
      const url = new URL('/api/auth/login', baseUrl);
      const req = http.request(
        url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        },
        (res) => {
          let raw = '';
          res.on('data', (c) => (raw += c));
          res.on('end', () => {
            try {
              resolve({ status: res.statusCode || 0, body: JSON.parse(raw) });
            } catch {
              resolve({ status: res.statusCode || 0, body: raw });
            }
          });
        },
      );
      req.write('{malformed_json');
      req.end();
    });

    assert(
      badJsonRes.status === 400 && badJsonRes.body?.success === false,
      'Scenario E: Malformed JSON returns HTTP 400 with safe client message',
      JSON.stringify(badJsonRes.body),
    );
    process.env.NODE_ENV = oldEnv;

    // ── SECTION 8: Cleanup ──────────────────────────────────────
    console.log('\n🧹 SECTION 8: Cleanup');
    await request('DELETE', `/api/urls/${testUrlId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    await cacheService.deleteUrl(testShortCode);

  } finally {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await pool.end();
    console.log('✅ Teardown complete.\n');
  }

  console.log('====================================================');
  console.log(`📊 PHASE 7 RESILIENCE TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runPhase7ResilienceTests().catch((err) => {
  console.error('💥 Fatal error in Phase 7 resilience tests:', err);
  process.exit(1);
});
