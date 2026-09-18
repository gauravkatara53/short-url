import crypto from 'crypto';

/**
 * Base62 character set – URL-safe, no special characters.
 */
const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a cryptographically random short code of the given length
 * using Base62 characters.
 */
export function generateShortCode(length: number = 7): string {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += BASE62[bytes[i]! % BASE62.length];
  }
  return code;
}
