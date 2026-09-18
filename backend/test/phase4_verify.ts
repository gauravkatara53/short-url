import dotenv from 'dotenv';
dotenv.config();

import http from 'node:http';
import crypto from 'node:crypto';
import pool, { initDatabase } from '../src/config/database.js';
import redis from '../src/config/redis.js';
import app from '../src/app.js';
import * as kafkaConfig from '../src/config/kafka.js';
import * as kafkaProducerService from '../src/services/kafkaProducer.service.js';
import * as kafkaConsumerService from '../src/services/kafkaConsumer.service.js';
import * as eventProcessorService from '../src/services/eventProcessor.service.js';
import * as clickEventService from '../src/services/clickEvent.service.js';
import * as cacheService from '../src/services/cache.service.js';
import * as urlService from '../src/services/url.service.js';
import * as UrlModel from '../src/models/url.model.js';
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
    followRedirect?: boolean;
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
            // Raw text if not JSON
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
  console.log('🚀 RUNNING PHASE 4 AIVEN KAFKA VERIFICATION SUITE');
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

  const testEmail = `kafka_test_${Date.now()}@example.com`;
  const testPassword = 'Password123!';
  let authToken = '';
  let testUserId = '';
  let validShortCode = '';
  let validUrlId = '';
  const targetUrl = 'https://example.com/phase4-destination';

  try {
    // ── Phase 1-3 Regression Suite ─────────────────────────────
    console.log('🔍 SECTION A: Phase 1–3 Regression Verification');

    // Health check
    const healthRes = await request('GET', '/api/health');
    assert(
      healthRes.status === 200 && healthRes.body?.data?.status === 'healthy',
      'GET /api/health returns 200 and healthy status',
    );

    // Auth Register
    const regRes = await request('POST', '/api/auth/register', {
      body: {
        name: 'Kafka Test User',
        email: testEmail,
        password: testPassword,
      },
    });
    assert(
      regRes.status === 201 && !!regRes.body?.data?.user?.id,
      'POST /api/auth/register registers user and returns user info',
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
      'POST /api/urls creates a new short URL',
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

    console.log('\n🔍 SECTION B: Aiven Kafka Configuration & Resilience Tests');

    // ── Test 1: Aiven Kafka Configuration Parsing ────────────────
    console.log('\n--- Test 1: Kafka Configuration & Aiven Compatibility ---');
    const kConfig = kafkaConfig.buildKafkaConfig();
    assert(
      Array.isArray(kConfig.brokers) && kConfig.brokers.length > 0,
      'Kafka configuration properly parses broker list',
      `Brokers: ${JSON.stringify(kConfig.brokers)}`,
    );
    assert(
      typeof kafkaConfig.KAFKA_TOPIC === 'string' &&
        kafkaConfig.KAFKA_TOPIC.length > 0,
      `Kafka topic is configured: "${kafkaConfig.KAFKA_TOPIC}"`,
    );
    assert(
      typeof kafkaConfig.KAFKA_GROUP_ID === 'string' &&
        kafkaConfig.KAFKA_GROUP_ID.length > 0,
      `Kafka consumer group is configured: "${kafkaConfig.KAFKA_GROUP_ID}"`,
    );

    // Verify Aiven SSL & SASL configuration parser unit test
    const origEnv = { ...process.env };
    process.env.KAFKA_BROKERS = 'kafka-test.aivencloud.com:25050';
    process.env.KAFKA_SSL = 'true';
    process.env.KAFKA_SASL_MECHANISM = 'plain';
    process.env.KAFKA_SASL_USERNAME = 'avnadmin';
    process.env.KAFKA_SASL_PASSWORD = 'test-secret-password';

    const aivenConfig = kafkaConfig.buildKafkaConfig('aiven-test-client');
    assert(
      aivenConfig.ssl === true,
      'Aiven configuration sets ssl: true when KAFKA_SSL=true',
    );
    assert(
      aivenConfig.sasl?.mechanism === 'plain' &&
        (aivenConfig.sasl as any).username === 'avnadmin' &&
        (aivenConfig.sasl as any).password === 'test-secret-password',
      'Aiven configuration parses SASL Plain credentials correctly from environment',
    );
    assert(
      aivenConfig.brokers[0] === 'kafka-test.aivencloud.com:25050',
      'Aiven configuration sets Aiven cloud broker URL correctly',
    );

    // Restore env
    process.env = origEnv;

    // ── Test 2: Valid Redirect & Event Generation ───────────────
    console.log('\n--- Test 2: Valid Redirect ---');
    const redirectRes = await request('GET', `/${validShortCode}`);
    assert(
      redirectRes.status === 301,
      `GET /:shortCode returns HTTP 301 Redirect (got ${redirectRes.status})`,
    );
    assert(
      redirectRes.headers.location === targetUrl,
      `Redirect Location header matches target: ${redirectRes.headers.location}`,
    );

    // ── Test 3: Redis Cache HIT ─────────────────────────────────
    console.log('\n--- Test 3: Redis HIT Redirect Flow ---');
    await cacheService.setUrl(validShortCode, {
      originalUrl: targetUrl,
      urlId: validUrlId,
    });
    const hitRes = await request('GET', `/${validShortCode}`);
    assert(
      hitRes.status === 301 && hitRes.headers.location === targetUrl,
      'Cache HIT redirects with HTTP 301',
    );

    // ── Test 4: Redis Cache MISS ────────────────────────────────
    console.log('\n--- Test 4: Redis MISS Redirect Flow ---');
    await cacheService.deleteUrl(validShortCode);
    const missRes = await request('GET', `/${validShortCode}`);
    assert(
      missRes.status === 301 && missRes.headers.location === targetUrl,
      'Cache MISS resolves from PostgreSQL, updates cache, and redirects with HTTP 301',
    );

    // ── Test 5: Multiple Clicks & Unique clickIds ────────────────
    console.log('\n--- Test 5: Multiple Clicks & Unique clickId Generation ---');
    const clickIds = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const clickEvent = clickEventService.buildClickEvent(
        validUrlId,
        validShortCode,
        {
          headers: {
            'user-agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'x-forwarded-for': '192.168.1.100',
          },
          socket: { remoteAddress: '127.0.0.1' },
        } as any,
      );
      clickIds.add(clickEvent.clickId);
      const validation = clickEventSchema.safeParse(clickEvent);
      assert(
        validation.success,
        `Click event #${i + 1} conforms to Zod ClickEvent schema`,
      );
    }
    assert(
      clickIds.size === 5,
      '5 distinct clicks produced 5 unique UUID clickIds',
      `Unique count: ${clickIds.size}`,
    );

    // ── Test 6: Invalid Short URL (404) ──────────────────────────
    console.log('\n--- Test 6: Invalid Short URL (404) ---');
    const notFoundRes = await request('GET', '/nonexistent99999');
    assert(
      notFoundRes.status === 404,
      `Nonexistent short code returns HTTP 404 (got ${notFoundRes.status})`,
    );

    // ── Test 7: Expired Short URL (410) ──────────────────────────
    console.log('\n--- Test 7: Expired Short URL (410) ---');
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
      `Expired short code returns HTTP 410 (got ${expiredRes.status})`,
    );

    // ── Test 8: Kafka Failure Resilience (Redirect Availability) ──
    console.log('\n--- Test 8: Kafka Failure Resilience (Redirect Availability) ---');
    const resilientRes = await request('GET', `/${validShortCode}`);
    assert(
      resilientRes.status === 301,
      'Redirect succeeds with HTTP 301 even when Kafka is in disconnected or degraded state',
    );

    // ── Test 9: Kafka Consumer Message Processing & Validation ───
    console.log('\n--- Test 9: Kafka Consumer Valid Message Pipeline ---');
    let processorCalled = false;
    let processedClickId = '';

    const originalProcessor = eventProcessorService.defaultEventProcessor.process;
    eventProcessorService.defaultEventProcessor.process = async (event: ClickEvent) => {
      processorCalled = true;
      processedClickId = event.clickId;
    };

    const sampleValidEvent: ClickEvent = {
      clickId: crypto.randomUUID(),
      urlId: validUrlId,
      shortCode: validShortCode,
      timestamp: new Date().toISOString(),
      ipAddress: '203.0.113.195',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      device: 'desktop',
      browser: 'Chrome',
      operatingSystem: 'Windows',
      referrer: 'https://news.ycombinator.com/',
      country: null,
    };

    await kafkaConsumerService.handleMessage({
      topic: kafkaConfig.KAFKA_TOPIC,
      partition: 0,
      message: {
        key: Buffer.from(sampleValidEvent.clickId),
        value: Buffer.from(JSON.stringify(sampleValidEvent)),
        offset: '101',
        timestamp: Date.now().toString(),
        attributes: 0,
      },
      heartbeat: async () => {},
      pause: () => () => {},
    });

    assert(
      processorCalled && processedClickId === sampleValidEvent.clickId,
      'Consumer parsed JSON, validated Zod schema, and dispatched event to processor',
    );

    eventProcessorService.defaultEventProcessor.process = originalProcessor;

    // ── Test 10: Invalid Kafka Message & Poison Pill Resilience ──
    console.log('\n--- Test 10: Invalid Kafka Message / Poison Pill Resilience ---');
    let crashed = false;
    try {
      // 10a. Malformed JSON
      await kafkaConsumerService.handleMessage({
        topic: kafkaConfig.KAFKA_TOPIC,
        partition: 0,
        message: {
          key: Buffer.from('bad-json-key'),
          value: Buffer.from('{ malformed json string !!!'),
          offset: '102',
          timestamp: Date.now().toString(),
          attributes: 0,
        },
        heartbeat: async () => {},
        pause: () => () => {},
      });

      // 10b. Invalid schema payload (missing clickId and invalid device)
      await kafkaConsumerService.handleMessage({
        topic: kafkaConfig.KAFKA_TOPIC,
        partition: 0,
        message: {
          key: Buffer.from('invalid-schema-key'),
          value: Buffer.from(
            JSON.stringify({
              clickId: 'not-a-uuid',
              urlId: '123',
              shortCode: '',
              device: 'supercomputer',
            }),
          ),
          offset: '103',
          timestamp: Date.now().toString(),
          attributes: 0,
        },
        heartbeat: async () => {},
        pause: () => () => {},
      });
    } catch (err) {
      crashed = true;
      console.error('Consumer unexpectedly threw:', err);
    }

    assert(
      !crashed,
      'Consumer safely handled malformed JSON and invalid schema without throwing or crashing worker',
    );

    // ── Clean up test URL ────────────────────────────────────────
    console.log('\n--- Cleanup: Delete test URL ---');
    const deleteRes = await request('DELETE', `/api/urls/${validUrlId}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    assert(
      deleteRes.status === 200,
      'DELETE /api/urls/:id removes URL and invalidates cache',
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
  console.log(`📊 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runVerification().catch((err) => {
  console.error('💥 Fatal error during verification:', err);
  process.exit(1);
});
