import { dbQuery } from '../config/database.js';
import type { ClickEvent, ClickEventRow } from '../types/index.js';

/**
 * Persist a click event in the development PostgreSQL database.
 */
export async function create(event: ClickEvent): Promise<ClickEventRow> {
  console.log(`[CLICK_EVENT_MODEL] ➕ create called for clickId=${event.clickId}, shortCode=${event.shortCode}, urlId=${event.urlId}`);
  try {
    const result = await dbQuery<ClickEventRow>(
      `INSERT INTO click_events (
        id,
        url_id,
        short_code,
        timestamp,
        ip_address,
        user_agent,
        device,
        browser,
        operating_system,
        referrer,
        country
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        event.clickId,
        event.urlId,
        event.shortCode,
        event.timestamp,
        event.ipAddress,
        event.userAgent,
        event.device,
        event.browser,
        event.operatingSystem,
        event.referrer,
        event.country,
      ],
    );

    const inserted = result.rows[0]!;
    console.log(`[CLICK_EVENT_MODEL] ✅ Click event persisted to PostgreSQL: id=${inserted.id}, shortCode=${inserted.short_code}`);
    return inserted;
  } catch (err) {
    console.error(`[CLICK_EVENT_MODEL] ❌ Error persisting click event for shortCode=${event.shortCode}:`, (err as Error).message);
    throw err;
  }
}

/**
 * Count total click events recorded for a given short code.
 */
export async function countByShortCode(shortCode: string): Promise<number> {
  console.log(`[CLICK_EVENT_MODEL] 🔍 countByShortCode called for shortCode="${shortCode}"`);
  try {
    const result = await dbQuery<{ count: string }>(
      'SELECT COUNT(*) as count FROM click_events WHERE short_code = $1',
      [shortCode],
    );
    const count = parseInt(result.rows[0]!.count, 10);
    console.log(`[CLICK_EVENT_MODEL] 📄 countByShortCode result for "${shortCode}": ${count}`);
    return count;
  } catch (err) {
    console.error(`[CLICK_EVENT_MODEL] ❌ Error in countByShortCode for "${shortCode}":`, (err as Error).message);
    throw err;
  }
}

/**
 * Find recent click events for a specific short code.
 */
export async function findByShortCode(
  shortCode: string,
  limit = 50,
): Promise<ClickEventRow[]> {
  console.log(`[CLICK_EVENT_MODEL] 🔍 findByShortCode called for shortCode="${shortCode}", limit=${limit}`);
  try {
    const result = await dbQuery<ClickEventRow>(
      `SELECT * FROM click_events
       WHERE short_code = $1
       ORDER BY timestamp DESC
       LIMIT $2`,
      [shortCode, limit],
    );
    console.log(`[CLICK_EVENT_MODEL] 📄 findByShortCode returned ${result.rows.length} rows for shortCode="${shortCode}"`);
    return result.rows;
  } catch (err) {
    console.error(`[CLICK_EVENT_MODEL] ❌ Error in findByShortCode for "${shortCode}":`, (err as Error).message);
    throw err;
  }
}

/**
 * Count total click events across all URLs.
 */
export async function countTotal(): Promise<number> {
  console.log('[CLICK_EVENT_MODEL] 🔍 countTotal called');
  try {
    const result = await dbQuery<{ count: string }>(
      'SELECT COUNT(*) as count FROM click_events',
    );
    const count = parseInt(result.rows[0]!.count, 10);
    console.log(`[CLICK_EVENT_MODEL] 📄 countTotal result: ${count}`);
    return count;
  } catch (err) {
    console.error('[CLICK_EVENT_MODEL] ❌ Error in countTotal:', (err as Error).message);
    throw err;
  }
}
