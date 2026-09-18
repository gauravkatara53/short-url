import dotenv from 'dotenv';
dotenv.config();

import crypto from 'node:crypto';
import { checkClickHouseHealth, clickhouse } from '../src/config/clickhouse.js';
import * as clickhouseService from '../src/services/clickhouse.service.js';
import * as analyticsService from '../src/services/analytics.service.js';
import type { ClickEvent } from '../types/index.js';

async function main() {
  console.log('====================================================');
  console.log('🔍 LIVE CLICKHOUSE CLOUD CONNECTION & QUERY TEST');
  console.log('====================================================\n');

  // 1. Health check
  console.log('1️⃣ Checking ClickHouse Health...');
  const health = await checkClickHouseHealth();
  console.log('   Status:', health.status);
  console.log('   Server Version:', health.version || 'N/A');
  if (health.error) {
    console.error('   Error:', health.error);
    process.exit(1);
  }

  // 2. Table Initialization
  console.log('\n2️⃣ Initializing ClickHouse table `click_events`...');
  await clickhouseService.initClickHouse();
  console.log('   ✅ Table `click_events` initialized with ReplacingMergeTree(created_at).');

  // 3. Insert Test Clickstream Events
  const testUrlId = crypto.randomUUID();
  const testShortCode = 'test' + Math.random().toString(36).substring(2, 6);

  console.log(`\n3️⃣ Inserting sample clickstream events for shortCode="${testShortCode}"...`);
  const sampleEvents: ClickEvent[] = [
    {
      clickId: crypto.randomUUID(),
      urlId: testUrlId,
      shortCode: testShortCode,
      timestamp: new Date().toISOString(),
      ipAddress: '103.21.244.2',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      device: 'desktop',
      browser: 'Chrome',
      operatingSystem: 'macOS',
      referrer: 'https://github.com',
      country: 'IN',
    },
    {
      clickId: crypto.randomUUID(),
      urlId: testUrlId,
      shortCode: testShortCode,
      timestamp: new Date().toISOString(),
      ipAddress: '157.240.241.35',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1',
      device: 'mobile',
      browser: 'Safari',
      operatingSystem: 'iOS',
      referrer: 'https://instagram.com',
      country: 'US',
    },
    {
      clickId: crypto.randomUUID(),
      urlId: testUrlId,
      shortCode: testShortCode,
      timestamp: new Date().toISOString(),
      ipAddress: '185.199.108.153',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/121.0',
      device: 'desktop',
      browser: 'Firefox',
      operatingSystem: 'Windows',
      referrer: 'direct',
      country: 'GB',
    },
  ];

  await clickhouseService.insertClickEventsBatch(sampleEvents);
  console.log(`   ✅ Inserted ${sampleEvents.length} events into ClickHouse Cloud.`);

  // 4. Test Analytics Queries
  console.log('\n4️⃣ Executing analytical queries on ClickHouse Cloud...');

  const totalClicks = await analyticsService.getTotalClicks({ urlId: testUrlId });
  console.log(`   📊 Total Clicks for URL: ${totalClicks}`);

  const deviceDistribution = await analyticsService.getClicksByDevice({ urlId: testUrlId });
  console.log('   📱 Device Breakdown:', JSON.stringify(deviceDistribution, null, 2));

  const browserDistribution = await analyticsService.getClicksByBrowser({ urlId: testUrlId });
  console.log('   🌐 Browser Breakdown:', JSON.stringify(browserDistribution, null, 2));

  const osDistribution = await analyticsService.getClicksByOperatingSystem({ urlId: testUrlId });
  console.log('   💻 Operating System Breakdown:', JSON.stringify(osDistribution, null, 2));

  const referrerDistribution = await analyticsService.getClicksByReferrer({ urlId: testUrlId });
  console.log('   🔗 Referrer Breakdown:', JSON.stringify(referrerDistribution, null, 2));

  const countryDistribution = await analyticsService.getClicksByCountry({ urlId: testUrlId });
  console.log('   🌍 Country Breakdown:', JSON.stringify(countryDistribution, null, 2));

  const timeSeries = await analyticsService.getClicksOverTime({ urlId: testUrlId, interval: 'hour' });
  console.log('   📈 Hourly Time Series:', JSON.stringify(timeSeries, null, 2));

  console.log('\n====================================================');
  console.log('🎉 LIVE CLICKHOUSE CLOUD TEST COMPLETED SUCCESSFULLY!');
  console.log('====================================================\n');
}

main().catch((err) => {
  console.error('❌ Live ClickHouse test failed:', err);
  process.exit(1);
});
