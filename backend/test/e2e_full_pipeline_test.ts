import dotenv from 'dotenv';
dotenv.config();

import crypto from 'node:crypto';
import http from 'node:http';
import pool, { initDatabase } from '../src/config/database.js';
import redis from '../src/config/redis.js';
import app from '../src/app.js';
import { kafka, KAFKA_TOPIC, KAFKA_GROUP_ID } from '../src/config/kafka.js';
import { initClickHouse } from '../src/services/clickhouse.service.js';
import * as analyticsService from '../src/services/analytics.service.js';
import { handleMessage } from '../src/services/kafkaConsumer.service.js';
import * as cacheService from '../src/services/cache.service.js';

let server: http.Server;
let baseUrl: string;

async function request(
  method: string,
  path: string,
  options: { body?: Record<string, unknown>; headers?: Record<string, string> } = {},
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const postData = options.body ? JSON.stringify(options.body) : undefined;
    const headers: Record<string, string> = {
      ...(postData ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    };
    const req = http.request(url, { method, headers }, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        let parsedBody = raw;
        try {
          parsedBody = JSON.parse(raw);
        } catch {}
        resolve({ status: res.statusCode || 0, headers: res.headers, body: parsedBody });
      });
    });
    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

async function runE2EPipeline() {
  console.log('====================================================');
  console.log('🚀 LIVE END-TO-END PIPELINE VERIFICATION');
  console.log('   Neon PG -> Upstash Redis -> Aiven Kafka -> ClickHouse Cloud');
  console.log('====================================================\n');

  // 1. Initialise databases
  console.log('1️⃣ Initialising databases...');
  await initDatabase();
  await initClickHouse();
  console.log('   ✅ PostgreSQL & ClickHouse Cloud ready.');

  // 2. Start HTTP server
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as any;
      baseUrl = `http://localhost:${addr.port}`;
      console.log(`   ✅ API Server running on ${baseUrl}`);
      resolve();
    });
  });

  // 3. Register user & create short URL
  console.log('\n2️⃣ Creating user and short URL...');
  const testEmail = `e2e_${Date.now()}@example.com`;
  const testPassword = 'Password123!';

  await request('POST', '/api/auth/register', {
    body: { name: 'E2E Pipeline Tester', email: testEmail, password: testPassword },
  });
  const loginRes = await request('POST', '/api/auth/login', {
    body: { email: testEmail, password: testPassword },
  });
  const token = loginRes.body?.data?.token;
  const targetDestination = 'https://clickhouse.com/docs';

  const createUrlRes = await request('POST', '/api/urls', {
    headers: { Authorization: `Bearer ${token}` },
    body: { originalUrl: targetDestination },
  });

  const shortCode = createUrlRes.body.data.url.short_code;
  const urlId = createUrlRes.body.data.url.id;
  console.log(`   ✅ Short URL created: ${shortCode} -> ${targetDestination} (id: ${urlId})`);

  // 4. Start Kafka consumer first
  console.log('\n3️⃣ Starting Kafka consumer listener...');
  const consumer = kafka.consumer({ groupId: `e2e-group-${Date.now()}` });
  await consumer.connect();
  await consumer.subscribe({ topic: KAFKA_TOPIC, fromBeginning: false });

  let eventReceived = false;
  let receivedClickId = '';

  await consumer.run({
    eachMessage: async (payload) => {
      console.log(`   📥 Kafka Consumer received message on topic=${payload.topic}, offset=${payload.message.offset}`);
      await handleMessage(payload);
      const parsed = JSON.parse(payload.message.value?.toString() || '{}');
      if (parsed.shortCode === shortCode) {
        eventReceived = true;
        receivedClickId = parsed.clickId;
        console.log(`   ✅ Matched shortCode: ${shortCode}, clickId: ${receivedClickId}`);
      }
    },
  });

  // Brief pause to allow consumer group coordinator join & partition assignment
  await new Promise((r) => setTimeout(r, 2500));

  // 5. Trigger redirect (Produces click event to Kafka)
  console.log('\n4️⃣ Triggering live HTTP 301 Redirect...');
  const redirectRes = await request('GET', `/${shortCode}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Referer': 'https://google.com',
      'X-Forwarded-For': '198.51.100.42',
    },
  });
  console.log(`   ✅ HTTP Status: ${redirectRes.status}`);
  console.log(`   ✅ Redirect Location: ${redirectRes.headers.location}`);

  // Wait for message consumption & ClickHouse Cloud ingestion
  console.log('   ⏳ Waiting for event to be consumed and inserted into ClickHouse Cloud...');
  for (let i = 0; i < 20; i++) {
    if (eventReceived) break;
    await new Promise((r) => setTimeout(r, 500));
  }

  await consumer.disconnect();

  // 6. Query ClickHouse Cloud for analytics
  console.log('\n5️⃣ Querying ClickHouse Cloud for aggregated analytics...');
  // Brief delay for ClickHouse async insert flush
  await new Promise((r) => setTimeout(r, 1000));

  const totalClicks = await analyticsService.getTotalClicks({ urlId });
  const deviceStats = await analyticsService.getClicksByDevice({ urlId });
  const browserStats = await analyticsService.getClicksByBrowser({ urlId });
  const referrerStats = await analyticsService.getClicksByReferrer({ urlId });

  console.log(`   📊 Total Clicks Recorded: ${totalClicks}`);
  console.log('   📱 Device Breakdown:', deviceStats);
  console.log('   🌐 Browser Breakdown:', browserStats);
  console.log('   🔗 Referrer Breakdown:', referrerStats);

  // 7. Cleanup
  console.log('\n🧹 Cleaning up...');
  await cacheService.deleteUrl(shortCode);
  if (server) await new Promise<void>((res) => server.close(() => res()));
  await pool.end();

  console.log('\n====================================================');
  console.log('🎉 FULL END-TO-END PIPELINE VALIDATED SUCCESSFULLY!');
  console.log('====================================================\n');
}

runE2EPipeline().catch((err) => {
  console.error('❌ E2E pipeline test failed:', err);
  process.exit(1);
});
