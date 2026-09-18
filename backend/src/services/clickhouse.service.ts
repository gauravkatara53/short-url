import { clickhouse, isClickHouseConfigured } from '../config/clickhouse.js';
import type { ClickEvent } from '../types/index.js';

export interface ClickHouseClickEventRow {
  click_id: string;
  url_id: string;
  short_code: string;
  timestamp: string;
  ip_address: string | null;
  user_agent: string | null;
  device: string;
  browser: string;
  operating_system: string;
  referrer: string | null;
  country: string | null;
}

let isInitialized = false;

/**
 * Format standard application ClickEvent into ClickHouse row format.
 */
export function formatClickEventForClickHouse(
  event: ClickEvent,
): ClickHouseClickEventRow {
  return {
    click_id: event.clickId,
    url_id: event.urlId,
    short_code: event.shortCode,
    timestamp: event.timestamp,
    ip_address: event.ipAddress || null,
    user_agent: event.userAgent || null,
    device: event.device,
    browser: event.browser,
    operating_system: event.operatingSystem,
    referrer: event.referrer || null,
    country: event.country || null,
  };
}

/**
 * Initialize ClickHouse analytics tables.
 * Safe and idempotent to call on every startup.
 * Uses ReplacingMergeTree for storage-level duplicate event reconciliation.
 */
export async function initClickHouse(): Promise<void> {
  if (isInitialized) return;

  console.log('[CLICKHOUSE] ⏳ Initializing ClickHouse table "click_events"...');
  const startTime = Date.now();
  try {
    const createTableQuery = `
      CREATE TABLE IF NOT EXISTS click_events (
        click_id UUID,
        url_id UUID,
        short_code LowCardinality(String),
        timestamp DateTime64(3, 'UTC'),
        ip_address Nullable(String),
        user_agent Nullable(String),
        device LowCardinality(String),
        browser LowCardinality(String),
        operating_system LowCardinality(String),
        referrer Nullable(String),
        country Nullable(String),
        created_at DateTime64(3, 'UTC') DEFAULT now64(3)
      )
      ENGINE = ReplacingMergeTree(created_at)
      ORDER BY (url_id, short_code, timestamp, click_id);
    `;

    await clickhouse.command({
      query: createTableQuery,
    });

    isInitialized = true;
    const duration = Date.now() - startTime;
    console.log(`✅ [CLICKHOUSE] Analytics tables initialised in ${duration}ms`);
  } catch (err) {
    const duration = Date.now() - startTime;
    console.warn(
      `[CLICKHOUSE] ❌ Table initialisation warning after ${duration}ms:`,
      (err as Error).message,
    );
  }
}

/**
 * Insert a single validated click event into ClickHouse.
 */
export async function insertClickEvent(event: ClickEvent): Promise<void> {
  const row = formatClickEventForClickHouse(event);
  const startTime = Date.now();

  console.log(
    `[CLICKHOUSE] ⏳ Inserting single click event: clickId=${event.clickId}, shortCode=${event.shortCode}, urlId=${event.urlId}, device=${event.device}, browser=${event.browser}, os=${event.operatingSystem}, ip=${event.ipAddress}, referrer=${event.referrer}`,
  );

  try {
    await clickhouse.insert({
      table: 'click_events',
      values: [row],
      format: 'JSONEachRow',
    });

    const duration = Date.now() - startTime;
    console.log(
      `[CLICKHOUSE] ✅ Ingested click event in ${duration}ms: clickId=${event.clickId}, shortCode=${event.shortCode}`,
    );
  } catch (err) {
    const duration = Date.now() - startTime;
    const error = err as Error;
    console.error(
      `[CLICKHOUSE] ❌ Insert failed after ${duration}ms for clickId=${event.clickId}, shortCode=${event.shortCode}: ${error.name} - ${error.message}`,
      error.stack,
    );
    throw error;
  }
}

/**
 * Batch insert multiple validated click events into ClickHouse.
 */
export async function insertClickEventsBatch(events: ClickEvent[]): Promise<void> {
  if (events.length === 0) return;

  const rows = events.map(formatClickEventForClickHouse);
  const startTime = Date.now();
  console.log(`[CLICKHOUSE] ⏳ Batch inserting ${rows.length} click events...`);

  try {
    await clickhouse.insert({
      table: 'click_events',
      values: rows,
      format: 'JSONEachRow',
    });

    const duration = Date.now() - startTime;
    console.log(
      `[CLICKHOUSE] ✅ Batch ingested ${rows.length} click events successfully in ${duration}ms`,
    );
  } catch (err) {
    const duration = Date.now() - startTime;
    const error = err as Error;
    console.error(
      `[CLICKHOUSE] ❌ Batch insert failed after ${duration}ms for ${rows.length} events: ${error.name} - ${error.message}`,
      error.stack,
    );
    throw error;
  }
}
