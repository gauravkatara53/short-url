import { clickhouse } from '../config/clickhouse.js';

export interface AnalyticsFilter {
  urlId?: string;
  shortCode?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
}

export interface ClicksOverTimeOptions extends AnalyticsFilter {
  interval?: 'minute' | 'hour' | 'day' | 'week' | 'month';
}

export interface ClicksOverTimePoint {
  time: string;
  clicks: number;
}

export interface AnalyticsOverview {
  totalClicks: number;
  clicksToday: number;
  clicksLast7Days: number;
  clicksLast30Days: number;
}

export interface DeviceMetric {
  device: string;
  clicks: number;
  count: number;
  percentage: number;
}

export interface BrowserMetric {
  browser: string;
  clicks: number;
  count: number;
  percentage: number;
}

export interface OSMetric {
  os: string;
  operatingSystem: string;
  clicks: number;
  count: number;
  percentage: number;
}

export interface ReferrerMetric {
  referrer: string;
  clicks: number;
  count: number;
  percentage: number;
}

export interface CountryMetric {
  country: string;
  clicks: number;
  count: number;
  percentage: number;
}

/**
 * Format ISO datetime string for ClickHouse DateTime64 parameter parsing.
 */
function formatDateTimeForClickHouse(isoDate: string): string {
  try {
    const d = new Date(isoDate);
    if (isNaN(d.getTime())) return isoDate;
    return d.toISOString().replace('T', ' ').replace('Z', '');
  } catch {
    return isoDate;
  }
}

/**
 * Build dynamic WHERE clause for ClickHouse queries based on filters.
 */
export function buildWhereClause(
  filter: AnalyticsFilter,
  queryParams: Record<string, unknown>,
): string {
  const conditions: string[] = ['1=1'];

  if (filter.urlId) {
    conditions.push('url_id = {urlId: UUID}');
    queryParams.urlId = filter.urlId;
  }

  if (filter.shortCode) {
    conditions.push('short_code = {shortCode: String}');
    queryParams.shortCode = filter.shortCode;
  }

  if (filter.startDate) {
    conditions.push('timestamp >= parseDateTime64BestEffortOrNull({startDate: String}, 3)');
    queryParams.startDate = formatDateTimeForClickHouse(filter.startDate);
  }

  if (filter.endDate) {
    conditions.push('timestamp <= parseDateTime64BestEffortOrNull({endDate: String}, 3)');
    queryParams.endDate = formatDateTimeForClickHouse(filter.endDate);
  }

  return conditions.join(' AND ');
}

/**
 * 1. Get total clicks for a URL or short code.
 */
export async function getTotalClicks(filter: AnalyticsFilter = {}): Promise<number> {
  const queryParams: Record<string, unknown> = {};
  const where = buildWhereClause(filter, queryParams);

  const query = `
    SELECT count() as total
    FROM click_events
    WHERE ${where}
  `;

  const queryId = Math.random().toString(36).substring(2, 8);
  const startTime = Date.now();
  console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ⏳ getTotalClicks query starting: ${query.replace(/\s+/g, ' ').trim()} | Params:`, JSON.stringify(queryParams));

  try {
    const result = await clickhouse.query({
      query,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const rows = await result.json<{ total: string | number }>();
    const total = parseInt(String(rows[0]?.total || 0), 10);
    const duration = Date.now() - startTime;
    console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ✅ getTotalClicks completed in ${duration}ms | Result: total=${total}`);
    return total;
  } catch (err) {
    const duration = Date.now() - startTime;
    const error = err as Error;
    console.error(`[CLICKHOUSE_ANALYTICS][${queryId}] ❌ getTotalClicks query error after ${duration}ms: ${error.name} - ${error.message}`, error.stack);
    return 0;
  }
}

/**
 * Sanitize IANA timezone string for safe SQL parameter injection into ClickHouse.
 */
function sanitizeTimezone(tz?: string): string {
  if (tz && /^[A-Za-z0-9_\-\+/]+$/.test(tz)) {
    return tz;
  }
  return process.env.APP_TIMEZONE || 'Asia/Kolkata';
}

/**
 * 2. Get high-level overview metrics (totalClicks, clicksToday, clicksLast7Days, clicksLast30Days).
 */
export async function getOverviewAnalytics(
  filter: AnalyticsFilter = {},
): Promise<AnalyticsOverview> {
  const queryParams: Record<string, unknown> = {};
  const where = buildWhereClause(filter, queryParams);
  const tz = sanitizeTimezone(filter.timezone);

  const query = `
    SELECT
      count() as totalClicks,
      countIf(timestamp >= toStartOfDay(now(), '${tz}')) as clicksToday,
      countIf(timestamp >= now() - INTERVAL 7 DAY) as clicksLast7Days,
      countIf(timestamp >= now() - INTERVAL 30 DAY) as clicksLast30Days
    FROM click_events
    WHERE ${where}
  `;

  const queryId = Math.random().toString(36).substring(2, 8);
  const startTime = Date.now();
  console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ⏳ getOverviewAnalytics query starting: ${query.replace(/\s+/g, ' ').trim()} | Timezone: ${tz} | Params:`, JSON.stringify(queryParams));

  try {
    const result = await clickhouse.query({
      query,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const rows = await result.json<{
      totalClicks: string | number;
      clicksToday: string | number;
      clicksLast7Days: string | number;
      clicksLast30Days: string | number;
    }>();

    const row = rows[0];
    const overview: AnalyticsOverview = {
      totalClicks: parseInt(String(row?.totalClicks || 0), 10),
      clicksToday: parseInt(String(row?.clicksToday || 0), 10),
      clicksLast7Days: parseInt(String(row?.clicksLast7Days || 0), 10),
      clicksLast30Days: parseInt(String(row?.clicksLast30Days || 0), 10),
    };
    const duration = Date.now() - startTime;
    console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ✅ getOverviewAnalytics completed in ${duration}ms | Overview:`, JSON.stringify(overview));
    return overview;
  } catch (err) {
    const duration = Date.now() - startTime;
    const error = err as Error;
    console.error(`[CLICKHOUSE_ANALYTICS][${queryId}] ❌ getOverviewAnalytics query error after ${duration}ms: ${error.name} - ${error.message}`, error.stack);
    return {
      totalClicks: 0,
      clicksToday: 0,
      clicksLast7Days: 0,
      clicksLast30Days: 0,
    };
  }
}

/**
 * 3. Get click time-series aggregation bucketed by interval.
 */
export async function getClicksOverTime(
  options: ClicksOverTimeOptions = {},
): Promise<ClicksOverTimePoint[]> {
  const queryParams: Record<string, unknown> = {};
  const where = buildWhereClause(options, queryParams);
  const interval = options.interval || 'day';
  const tz = sanitizeTimezone(options.timezone);

  let bucketExpr: string;
  switch (interval) {
    case 'minute':
      bucketExpr = 'toStartOfMinute(timestamp)';
      break;
    case 'hour':
      bucketExpr = 'toStartOfHour(timestamp)';
      break;
    case 'week':
      bucketExpr = `toStartOfWeek(timestamp, 1, '${tz}')`;
      break;
    case 'month':
      bucketExpr = `toStartOfMonth(timestamp, '${tz}')`;
      break;
    case 'day':
    default:
      bucketExpr = `toStartOfDay(timestamp, '${tz}')`;
      break;
  }

  const query = `
    SELECT
      formatDateTime(${bucketExpr}, '%Y-%m-%dT%H:%i:%s.000Z') as time,
      count() as clicks
    FROM click_events
    WHERE ${where}
    GROUP BY ${bucketExpr}
    ORDER BY ${bucketExpr} ASC
  `;

  const queryId = Math.random().toString(36).substring(2, 8);
  const startTime = Date.now();
  console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ⏳ getClicksOverTime query starting: interval=${interval} | Params:`, JSON.stringify(queryParams));

  try {
    const result = await clickhouse.query({
      query,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const rows = await result.json<{ time: string; clicks: string | number }>();
    const duration = Date.now() - startTime;
    const points = rows.map((r) => ({
      time: r.time,
      clicks: parseInt(String(r.clicks), 10),
    }));
    console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ✅ getClicksOverTime completed in ${duration}ms | Data points: ${points.length}`);
    return points;
  } catch (err) {
    const duration = Date.now() - startTime;
    const error = err as Error;
    console.error(`[CLICKHOUSE_ANALYTICS][${queryId}] ❌ getClicksOverTime query error after ${duration}ms: ${error.name} - ${error.message}`, error.stack);
    return [];
  }
}

/**
 * 4. Get click distribution by Device category.
 */
export async function getClicksByDevice(
  filter: AnalyticsFilter = {},
): Promise<DeviceMetric[]> {
  const queryParams: Record<string, unknown> = {};
  const where = buildWhereClause(filter, queryParams);

  const queryId = Math.random().toString(36).substring(2, 8);
  const startTime = Date.now();
  console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ⏳ getClicksByDevice query starting | Params:`, JSON.stringify(queryParams));

  try {
    const total = await getTotalClicks(filter);
    if (total === 0) {
      console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ℹ️ Total clicks is 0, skipping device aggregation`);
      return [];
    }

    const query = `
      SELECT
        device,
        count() as count
      FROM click_events
      WHERE ${where}
      GROUP BY device
      ORDER BY count DESC
    `;

    const result = await clickhouse.query({
      query,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const rows = await result.json<{ device: string; count: string | number }>();
    const duration = Date.now() - startTime;
    const mapped = rows.map((r) => {
      const count = parseInt(String(r.count), 10);
      return {
        device: r.device || 'unknown',
        clicks: count,
        count,
        percentage: Number(((count / total) * 100).toFixed(2)),
      };
    });
    console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ✅ getClicksByDevice completed in ${duration}ms | Breakdown:`, JSON.stringify(mapped));
    return mapped;
  } catch (err) {
    const duration = Date.now() - startTime;
    const error = err as Error;
    console.error(`[CLICKHOUSE_ANALYTICS][${queryId}] ❌ getClicksByDevice query error after ${duration}ms: ${error.name} - ${error.message}`, error.stack);
    return [];
  }
}

/**
 * 5. Get click distribution by Browser.
 */
export async function getClicksByBrowser(
  filter: AnalyticsFilter = {},
): Promise<BrowserMetric[]> {
  const queryParams: Record<string, unknown> = {};
  const where = buildWhereClause(filter, queryParams);

  const queryId = Math.random().toString(36).substring(2, 8);
  const startTime = Date.now();
  console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ⏳ getClicksByBrowser query starting | Params:`, JSON.stringify(queryParams));

  try {
    const total = await getTotalClicks(filter);
    if (total === 0) {
      console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ℹ️ Total clicks is 0, skipping browser aggregation`);
      return [];
    }

    const query = `
      SELECT
        browser,
        count() as count
      FROM click_events
      WHERE ${where}
      GROUP BY browser
      ORDER BY count DESC
    `;

    const result = await clickhouse.query({
      query,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const rows = await result.json<{ browser: string; count: string | number }>();
    const duration = Date.now() - startTime;
    const mapped = rows.map((r) => {
      const count = parseInt(String(r.count), 10);
      return {
        browser: r.browser || 'Other',
        clicks: count,
        count,
        percentage: Number(((count / total) * 100).toFixed(2)),
      };
    });
    console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ✅ getClicksByBrowser completed in ${duration}ms | Breakdown:`, JSON.stringify(mapped));
    return mapped;
  } catch (err) {
    const duration = Date.now() - startTime;
    const error = err as Error;
    console.error(`[CLICKHOUSE_ANALYTICS][${queryId}] ❌ getClicksByBrowser query error after ${duration}ms: ${error.name} - ${error.message}`, error.stack);
    return [];
  }
}

/**
 * 6. Get click distribution by Operating System.
 */
export async function getClicksByOperatingSystem(
  filter: AnalyticsFilter = {},
): Promise<OSMetric[]> {
  const queryParams: Record<string, unknown> = {};
  const where = buildWhereClause(filter, queryParams);

  const queryId = Math.random().toString(36).substring(2, 8);
  const startTime = Date.now();
  console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ⏳ getClicksByOperatingSystem query starting | Params:`, JSON.stringify(queryParams));

  try {
    const total = await getTotalClicks(filter);
    if (total === 0) {
      console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ℹ️ Total clicks is 0, skipping OS aggregation`);
      return [];
    }

    const query = `
      SELECT
        operating_system as operatingSystem,
        count() as count
      FROM click_events
      WHERE ${where}
      GROUP BY operating_system
      ORDER BY count DESC
    `;

    const result = await clickhouse.query({
      query,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const rows = await result.json<{ operatingSystem: string; count: string | number }>();
    const duration = Date.now() - startTime;
    const mapped = rows.map((r) => {
      const count = parseInt(String(r.count), 10);
      return {
        os: r.operatingSystem || 'Other',
        operatingSystem: r.operatingSystem || 'Other',
        clicks: count,
        count,
        percentage: Number(((count / total) * 100).toFixed(2)),
      };
    });
    console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ✅ getClicksByOperatingSystem completed in ${duration}ms | Breakdown:`, JSON.stringify(mapped));
    return mapped;
  } catch (err) {
    const duration = Date.now() - startTime;
    const error = err as Error;
    console.error(`[CLICKHOUSE_ANALYTICS][${queryId}] ❌ getClicksByOperatingSystem query error after ${duration}ms: ${error.name} - ${error.message}`, error.stack);
    return [];
  }
}

/**
 * 7. Get top referrers.
 */
export async function getClicksByReferrer(
  filter: AnalyticsFilter = {},
  limit = 20,
): Promise<ReferrerMetric[]> {
  const queryParams: Record<string, unknown> = { limit };
  const where = buildWhereClause(filter, queryParams);

  const queryId = Math.random().toString(36).substring(2, 8);
  const startTime = Date.now();
  console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ⏳ getClicksByReferrer query starting: limit=${limit} | Params:`, JSON.stringify(queryParams));

  try {
    const total = await getTotalClicks(filter);
    if (total === 0) {
      console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ℹ️ Total clicks is 0, skipping referrer aggregation`);
      return [];
    }

    const query = `
      SELECT
        ifNull(referrer, 'Direct / None') as referrer,
        count() as count
      FROM click_events
      WHERE ${where}
      GROUP BY referrer
      ORDER BY count DESC
      LIMIT {limit: UInt32}
    `;

    const result = await clickhouse.query({
      query,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const rows = await result.json<{ referrer: string; count: string | number }>();
    const duration = Date.now() - startTime;
    const mapped = rows.map((r) => {
      const count = parseInt(String(r.count), 10);
      return {
        referrer: r.referrer,
        clicks: count,
        count,
        percentage: Number(((count / total) * 100).toFixed(2)),
      };
    });
    console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ✅ getClicksByReferrer completed in ${duration}ms | Returned ${mapped.length} referrers`);
    return mapped;
  } catch (err) {
    const duration = Date.now() - startTime;
    const error = err as Error;
    console.error(`[CLICKHOUSE_ANALYTICS][${queryId}] ❌ getClicksByReferrer query error after ${duration}ms: ${error.name} - ${error.message}`, error.stack);
    return [];
  }
}

/**
 * 8. Get click distribution by Country.
 */
export async function getClicksByCountry(
  filter: AnalyticsFilter = {},
  limit = 50,
): Promise<CountryMetric[]> {
  const queryParams: Record<string, unknown> = { limit };
  const where = buildWhereClause(filter, queryParams);

  const queryId = Math.random().toString(36).substring(2, 8);
  const startTime = Date.now();
  console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ⏳ getClicksByCountry query starting: limit=${limit} | Params:`, JSON.stringify(queryParams));

  try {
    const total = await getTotalClicks(filter);
    if (total === 0) {
      console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ℹ️ Total clicks is 0, skipping country aggregation`);
      return [];
    }

    const query = `
      SELECT
        ifNull(country, 'Unknown') as country,
        count() as count
      FROM click_events
      WHERE ${where}
      GROUP BY country
      ORDER BY count DESC
      LIMIT {limit: UInt32}
    `;

    const result = await clickhouse.query({
      query,
      query_params: queryParams,
      format: 'JSONEachRow',
    });

    const rows = await result.json<{ country: string; count: string | number }>();
    const duration = Date.now() - startTime;
    const mapped = rows.map((r) => {
      const count = parseInt(String(r.count), 10);
      return {
        country: r.country,
        clicks: count,
        count,
        percentage: Number(((count / total) * 100).toFixed(2)),
      };
    });
    console.log(`[CLICKHOUSE_ANALYTICS][${queryId}] ✅ getClicksByCountry completed in ${duration}ms | Returned ${mapped.length} countries`);
    return mapped;
  } catch (err) {
    const duration = Date.now() - startTime;
    const error = err as Error;
    console.error(`[CLICKHOUSE_ANALYTICS][${queryId}] ❌ getClicksByCountry query error after ${duration}ms: ${error.name} - ${error.message}`, error.stack);
    return [];
  }
}
