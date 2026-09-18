import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

/**
 * Format connection string and configure SSL for cloud PostgreSQL (Aiven / Neon).
 * Strips sslmode URL query parameter to ensure pg respects { rejectUnauthorized: false }
 * for self-signed managed database certificates.
 */
function createPool(): Pool {
  let connectionString = process.env.DATABASE_URL || '';

  const isSslDisabled = connectionString.includes('sslmode=disable');
  // Strip sslmode query param so it doesn't override pool.ssl options
  connectionString = connectionString
    .replace(/([?&])sslmode=[^&]+(&|$)/, '$1')
    .replace(/[?&]$/, '');

  return new Pool({
    connectionString,
    ssl: isSslDisabled ? false : { rejectUnauthorized: false },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 20000,
    allowExitOnIdle: false,
  });
}

const pool = createPool();

// Handle idle client connection drops without crashing process
pool.on('error', (err: Error) => {
  console.warn('⚠️ Notice: Idle PostgreSQL client disconnected:', err.message);
});

function sanitizeDbParams(params?: any[]): any[] {
  if (!params || !Array.isArray(params)) return [];
  return params.map((p) => {
    if (typeof p === 'string') {
      if (/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(p)) {
        return '[REDACTED_PASSWORD_HASH]';
      }
      if (/^[A-Za-z0-9-_]{20,}\.[A-Za-z0-9-_]{20,}/.test(p)) {
        return '[REDACTED_TOKEN]';
      }
    }
    return p;
  });
}

/**
 * Execute a query with automatic retry on transient socket drops / ECONNRESET.
 */
export async function dbQuery<T extends import('pg').QueryResultRow = any>(
  text: string,
  params?: any[],
): Promise<import('pg').QueryResult<T>> {
  const queryId = Math.random().toString(36).substring(2, 8);
  const startTime = Date.now();
  const safeParams = sanitizeDbParams(params);
  console.log(`[PG_DB][${queryId}] ⏳ Executing query: ${text.replace(/\s+/g, ' ').trim()} | Params: ${JSON.stringify(safeParams)}`);
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - startTime;
    console.log(`[PG_DB][${queryId}] ✅ Query completed in ${duration}ms | Returned rows: ${result.rowCount}`);
    return result;
  } catch (err: any) {
    const duration = Date.now() - startTime;
    console.error(`[PG_DB][${queryId}] ❌ Query failed after ${duration}ms: ${err.message} | Query: ${text} | Params: ${JSON.stringify(safeParams)}`);
    if (
      err.code === 'ECONNRESET' ||
      err.message?.includes('socket disconnected') ||
      err.message?.includes('Connection terminated')
    ) {
      console.warn(`[PG_DB][${queryId}] ⚠️ Retrying query on fresh client after socket reset...`);
      const retryResult = await pool.query<T>(text, params);
      console.log(`[PG_DB][${queryId}] ✅ Retry succeeded | Returned rows: ${retryResult.rowCount}`);
      return retryResult;
    }
    throw err;
  }
}

/**
 * Initialise database tables.
 * Runs CREATE TABLE IF NOT EXISTS – safe to call on every startup.
 */
export async function initDatabase(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Enable uuid-ossp for UUID generation
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // ── users table ──────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name        VARCHAR(255)  NOT NULL,
        email       VARCHAR(255)  NOT NULL UNIQUE,
        password_hash TEXT        NOT NULL,
        created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      );
    `);

    // ── urls table ───────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS urls (
        id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id       UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        original_url  TEXT          NOT NULL,
        short_code    VARCHAR(20)   NOT NULL UNIQUE,
        created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        expires_at    TIMESTAMPTZ
      );
    `);

    // ── click_events table (development persistence) ───────
    await client.query(`
      CREATE TABLE IF NOT EXISTS click_events (
        id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        url_id            UUID          NOT NULL REFERENCES urls(id) ON DELETE CASCADE,
        short_code        VARCHAR(20)   NOT NULL,
        timestamp         TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        ip_address        VARCHAR(45),
        user_agent        TEXT,
        device            VARCHAR(50)   NOT NULL DEFAULT 'unknown',
        browser           VARCHAR(50)   NOT NULL DEFAULT 'Other',
        operating_system  VARCHAR(50)   NOT NULL DEFAULT 'Other',
        referrer          TEXT,
        country           VARCHAR(10),
        created_at        TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      );
    `);

    // ── indexes ──────────────────────────────────────────────
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_urls_short_code ON urls (short_code);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_urls_user_id ON urls (user_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_click_events_url_id ON click_events (url_id);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_click_events_timestamp ON click_events (timestamp);
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_click_events_short_code ON click_events (short_code);
    `);

    await client.query('COMMIT');
    console.log('✅ Database tables initialised on PostgreSQL');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Database initialisation failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

export default pool;
