import dotenv from 'dotenv';
dotenv.config();

const ch = createClient({
  url: process.env.CLICKHOUSE_URL || 'https://orijpe9vm8.asia-southeast1.gcp.clickhouse.cloud:8443',
  username: process.env.CLICKHOUSE_USERNAME || 'default',
  password: process.env.CLICKHOUSE_PASSWORD || '',
  database: process.env.CLICKHOUSE_DATABASE || 'default',
});

async function main() {
  // 1. Check total rows
  const r1 = await ch.query({ query: 'SELECT count() as cnt FROM click_events', format: 'JSONEachRow' });
  const rows1 = await r1.json();
  console.log('Total rows in click_events:', JSON.stringify(rows1));

  // 2. Show all events
  const r2 = await ch.query({
    query: 'SELECT click_id, url_id, short_code, timestamp, device, browser, operating_system, referrer FROM click_events ORDER BY timestamp DESC LIMIT 20',
    format: 'JSONEachRow',
  });
  const rows2 = await r2.json();
  console.log('Recent events:', JSON.stringify(rows2, null, 2));

  // 3. Check now() timezone
  const r3 = await ch.query({ query: "SELECT now() as server_now, now64(3, 'UTC') as utc_now, timezone() as tz", format: 'JSONEachRow' });
  const rows3 = await r3.json();
  console.log('ClickHouse now():', JSON.stringify(rows3));

  // 4. Test the overview query pattern used by the analytics service (with a known url_id)
  if (rows2.length > 0) {
    const urlId = rows2[0].url_id;
    console.log('\nTesting overview query for urlId:', urlId);
    
    const r4 = await ch.query({
      query: `SELECT
        count() as totalClicks,
        countIf(timestamp >= toStartOfDay(now())) as clicksToday,
        countIf(timestamp >= now() - INTERVAL 7 DAY) as clicksLast7Days,
        countIf(timestamp >= now() - INTERVAL 30 DAY) as clicksLast30Days
      FROM click_events
      WHERE url_id = {urlId: UUID}`,
      query_params: { urlId },
      format: 'JSONEachRow',
    });
    const rows4 = await r4.json();
    console.log('Overview result for urlId', urlId, ':', JSON.stringify(rows4));
  }

  // 5. Test with FINAL keyword (ReplacingMergeTree dedup)
  const r5 = await ch.query({ query: 'SELECT count() as cnt FROM click_events FINAL', format: 'JSONEachRow' });
  const rows5 = await r5.json();
  console.log('\nTotal rows with FINAL:', JSON.stringify(rows5));
  console.log('Total rows WITHOUT FINAL:', JSON.stringify(rows1));

  // 6. Test the date filter used by the frontend  
  const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().replace('T', ' ').replace('Z', '');
  console.log('\nFrontend sends startDate like:', startDate);
  
  const r6 = await ch.query({
    query: `SELECT count() as cnt FROM click_events WHERE timestamp >= parseDateTime64BestEffortOrNull({startDate: String}, 3)`,
    query_params: { startDate },
    format: 'JSONEachRow',
  });
  const rows6 = await r6.json();
  console.log('Count with date filter:', JSON.stringify(rows6));

  // 7. Check unique url_ids
  const r7 = await ch.query({
    query: 'SELECT DISTINCT url_id, short_code FROM click_events',
    format: 'JSONEachRow',
  });
  const rows7 = await r7.json();
  console.log('\nDistinct url_id/short_code pairs:', JSON.stringify(rows7, null, 2));

  await ch.close();
}
main().catch(console.error);
