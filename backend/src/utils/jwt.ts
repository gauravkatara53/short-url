import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken';
import type { JwtPayload } from '../types/index.js';
import { AppError } from './AppError.js';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.trim() === '' || secret === 'fallback-secret-do-not-use') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FATAL: Insecure or missing JWT_SECRET in production.');
    }
    return 'dev-insecure-secret-change-in-production';
  }
  return secret;
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_ALGORITHM = 'HS256';

/**
 * Sign a JWT with strict algorithm ('HS256') and explicit expiration.
 */
export function signToken(payload: JwtPayload): string {
  const secret = getJwtSecret();
  const options: SignOptions = {
    algorithm: JWT_ALGORITHM,
    expiresIn: JWT_EXPIRES_IN as unknown as number, // String '7d' is valid in jsonwebtoken
  };

  return jwt.sign(payload, secret, options);
}

/**
 * Verify and decode a JWT with strict algorithm validation and safe error encapsulation.
 * Never prints or leaks the token in error traces.
 */
export function verifyToken(token: string): JwtPayload {
  const secret = getJwtSecret();
  const options: VerifyOptions = {
    algorithms: [JWT_ALGORITHM],
  };

  try {
    return jwt.verify(token, secret, options) as JwtPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new AppError('Token has expired. Please login again.', 401);
    }
    if (err instanceof jwt.JsonWebTokenError) {
      throw new AppError('Invalid authentication token.', 401);
    }
    if (err instanceof jwt.NotBeforeError) {
      throw new AppError('Token not active yet.', 401);
    }
    throw new AppError('Authentication failed.', 401);
  }
}
