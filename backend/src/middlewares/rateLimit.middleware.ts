import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import { env } from '../config/env.js';

/**
 * Standard JSON rate limit handler.
 */
function createRateLimitHandler(message: string) {
  return (req: Request, res: Response): void => {
    res.status(429).json({
      success: false,
      message,
      retryAfter: res.getHeader('Retry-After') || '900',
    });
  };
}

/**
 * Skip rate limiting during local automated test suites unless explicitly tested.
 */
const shouldSkipInTests = (req: Request): boolean => {
  return process.env.NODE_ENV === 'test' && req.headers['x-test-rate-limit'] !== 'true';
};

/**
 * Strict Rate Limiter for Authentication endpoints (/api/auth/*)
 * Protects against brute-force password guessing and registration abuse.
 */
export const authRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_AUTH_WINDOW_MS,
  limit: env.RATE_LIMIT_AUTH_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: { trustProxy: false },
  skip: shouldSkipInTests,
  handler: createRateLimitHandler(
    'Too many authentication attempts. Please wait a few minutes before trying again.',
  ),
});

/**
 * Moderate Rate Limiter for general REST API endpoints (/api/urls/*, /api/analytics/*)
 */
export const apiRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_API_WINDOW_MS,
  limit: env.RATE_LIMIT_API_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: { trustProxy: false },
  skip: shouldSkipInTests,
  handler: createRateLimitHandler(
    'Too many API requests. Please reduce request frequency.',
  ),
});

/**
 * High-Throughput Rate Limiter for public URL redirection (/:shortCode)
 */
export const redirectRateLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_REDIRECT_WINDOW_MS,
  limit: env.RATE_LIMIT_REDIRECT_MAX,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  validate: { trustProxy: false },
  skip: shouldSkipInTests,
  handler: createRateLimitHandler(
    'Redirect rate limit reached. Please try again shortly.',
  ),
});
