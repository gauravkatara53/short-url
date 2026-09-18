import { dbQuery } from '../config/database.js';
import type { UserRow, SafeUser } from '../types/index.js';

/**
 * Strip password_hash from a user row.
 */
export function toSafeUser(row: UserRow): SafeUser {
  const { password_hash: _, ...safe } = row;
  return safe;
}

/**
 * Find a user by email.
 */
export async function findByEmail(email: string): Promise<UserRow | null> {
  const result = await dbQuery<UserRow>(
    'SELECT * FROM users WHERE email = $1',
    [email],
  );
  return result.rows[0] ?? null;
}

/**
 * Find a user by id.
 */
export async function findById(id: string): Promise<UserRow | null> {
  const result = await dbQuery<UserRow>(
    'SELECT * FROM users WHERE id = $1',
    [id],
  );
  return result.rows[0] ?? null;
}

/**
 * Create a new user and return the inserted row.
 */
export async function create(
  name: string,
  email: string,
  passwordHash: string,
): Promise<UserRow> {
  const result = await dbQuery<UserRow>(
    `INSERT INTO users (name, email, password_hash)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [name, email, passwordHash],
  );
  return result.rows[0]!;
}
