import { dbQuery } from '../config/database.js';
import type { UrlRow } from '../types/index.js';

/**
 * Find a URL by its short code.
 */
export async function findByShortCode(shortCode: string): Promise<UrlRow | null> {
  console.log(`[URL_MODEL] 🔍 findByShortCode called for shortCode="${shortCode}"`);
  try {
    const result = await dbQuery<UrlRow>(
      'SELECT * FROM urls WHERE short_code = $1',
      [shortCode],
    );
    const row = result.rows[0] ?? null;
    console.log(`[URL_MODEL] 📄 findByShortCode result for "${shortCode}": ${row ? `found (id=${row.id}, original_url=${row.original_url})` : 'NOT FOUND'}`);
    return row;
  } catch (err) {
    console.error(`[URL_MODEL] ❌ Error in findByShortCode for "${shortCode}":`, (err as Error).message);
    throw err;
  }
}

/**
 * Find a URL by id.
 */
export async function findById(id: string): Promise<UrlRow | null> {
  console.log(`[URL_MODEL] 🔍 findById called for id="${id}"`);
  try {
    const result = await dbQuery<UrlRow>(
      'SELECT * FROM urls WHERE id = $1',
      [id],
    );
    const row = result.rows[0] ?? null;
    console.log(`[URL_MODEL] 📄 findById result for "${id}": ${row ? `found (shortCode=${row.short_code})` : 'NOT FOUND'}`);
    return row;
  } catch (err) {
    console.error(`[URL_MODEL] ❌ Error in findById for "${id}":`, (err as Error).message);
    throw err;
  }
}

/**
 * Check whether a short code already exists.
 */
export async function shortCodeExists(shortCode: string): Promise<boolean> {
  console.log(`[URL_MODEL] 🔍 shortCodeExists checking "${shortCode}"`);
  try {
    const result = await dbQuery(
      'SELECT 1 FROM urls WHERE short_code = $1',
      [shortCode],
    );
    const exists = result.rowCount !== null && result.rowCount > 0;
    console.log(`[URL_MODEL] 📄 shortCodeExists "${shortCode}": ${exists}`);
    return exists;
  } catch (err) {
    console.error(`[URL_MODEL] ❌ Error in shortCodeExists for "${shortCode}":`, (err as Error).message);
    throw err;
  }
}

/**
 * Create a URL record and return the inserted row.
 */
export async function create(
  userId: string,
  originalUrl: string,
  shortCode: string,
  expiresAt: string | null,
): Promise<UrlRow> {
  console.log(`[URL_MODEL] ➕ create called: userId=${userId}, shortCode=${shortCode}, originalUrl=${originalUrl}, expiresAt=${expiresAt}`);
  try {
    const result = await dbQuery<UrlRow>(
      `INSERT INTO urls (user_id, original_url, short_code, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, originalUrl, shortCode, expiresAt],
    );
    const inserted = result.rows[0]!;
    console.log(`[URL_MODEL] ✅ URL created successfully: id=${inserted.id}, shortCode=${inserted.short_code}`);
    return inserted;
  } catch (err) {
    console.error(`[URL_MODEL] ❌ Error creating URL for shortCode="${shortCode}":`, (err as Error).message);
    throw err;
  }
}

/**
 * Get paginated URLs for a specific user.
 */
export async function findByUserId(
  userId: string,
  page: number,
  limit: number,
): Promise<{ rows: UrlRow[]; total: number }> {
  const offset = (page - 1) * limit;
  console.log(`[URL_MODEL] 🔍 findByUserId called: userId=${userId}, page=${page}, limit=${limit}, offset=${offset}`);

  try {
    const dataResult = await dbQuery<UrlRow>(
      `SELECT * FROM urls
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );

    const countResult = await dbQuery<{ count: string }>(
      'SELECT COUNT(*) as count FROM urls WHERE user_id = $1',
      [userId],
    );

    const total = parseInt(countResult.rows[0]!.count, 10);
    console.log(`[URL_MODEL] 📄 findByUserId returned ${dataResult.rows.length} rows (total: ${total}) for userId=${userId}`);
    return {
      rows: dataResult.rows,
      total,
    };
  } catch (err) {
    console.error(`[URL_MODEL] ❌ Error in findByUserId for userId=${userId}:`, (err as Error).message);
    throw err;
  }
}

/**
 * Delete a URL by id. Returns true if a row was deleted.
 */
export async function deleteById(id: string): Promise<boolean> {
  console.log(`[URL_MODEL] 🗑️ deleteById called for id="${id}"`);
  try {
    const result = await dbQuery('DELETE FROM urls WHERE id = $1', [id]);
    const deleted = result.rowCount !== null && result.rowCount > 0;
    console.log(`[URL_MODEL] 📄 deleteById result for id="${id}": ${deleted ? 'DELETED' : 'NO ROW DELETED'}`);
    return deleted;
  } catch (err) {
    console.error(`[URL_MODEL] ❌ Error in deleteById for id="${id}":`, (err as Error).message);
    throw err;
  }
}
