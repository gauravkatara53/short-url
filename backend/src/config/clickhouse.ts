import { createClient, ClickHouseClient } from '@clickhouse/client';
import dotenv from 'dotenv';

dotenv.config();

export const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL || 'http://localhost:8123';
export const CLICKHOUSE_USERNAME = process.env.CLICKHOUSE_USERNAME || 'default';
export const CLICKHOUSE_PASSWORD = process.env.CLICKHOUSE_PASSWORD || '';
export const CLICKHOUSE_DATABASE = process.env.CLICKHOUSE_DATABASE || 'default';

/**
 * Check if ClickHouse connection credentials are configured.
 */
export function isClickHouseConfigured(): boolean {
  return (
    typeof process.env.CLICKHOUSE_URL === 'string' &&
    process.env.CLICKHOUSE_URL.trim().length > 0
  );
}

/**
 * Factory function to create a ClickHouse client instance.
 * Supports ClickHouse Cloud (HTTPS) and local ClickHouse nodes.
 */
export function createClickHouseClient(): ClickHouseClient {
  return createClient({
    url: CLICKHOUSE_URL,
    username: CLICKHOUSE_USERNAME,
    password: CLICKHOUSE_PASSWORD,
    database: CLICKHOUSE_DATABASE,
    request_timeout: 30000,
    max_open_connections: 20,
    clickhouse_settings: {
      async_insert: 1,
      wait_for_async_insert: 0,
    },
  });
}

/** Singleton ClickHouse client instance */
export const clickhouse: ClickHouseClient = createClickHouseClient();

/**
 * Health check for ClickHouse connection.
 * Returns status without leaking credentials or throwing uncaught exceptions.
 */
export async function checkClickHouseHealth(): Promise<{
  status: 'connected' | 'degraded' | 'disabled';
  version?: string;
  error?: string;
}> {
  if (!isClickHouseConfigured()) {
    return { status: 'disabled', error: 'ClickHouse credentials not configured' };
  }

  try {
    const result = await clickhouse.query({
      query: 'SELECT version() as ver',
      format: 'JSONEachRow',
    });
    const rows = await result.json<{ ver: string }>();
    const version = rows[0]?.ver || 'unknown';
    return { status: 'connected', version };
  } catch (err) {
    const error = (err as Error).message;
    console.warn('[CLICKHOUSE] Health check warning:', error);
    return { status: 'degraded', error };
  }
}
