import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError.js';
import { sendError } from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { metrics } from '../utils/metrics.js';

/**
 * Centralised error-handling middleware.
 * Guarantees that internal database details, stack traces, and cloud secrets are never leaked to clients.
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const reqId = req.id || Math.random().toString(36).substring(2, 8);
  const isProduction = process.env.NODE_ENV === 'production';
  const statusCode = err instanceof AppError ? err.statusCode : err.status || 500;

  // Track error metric
  metrics.recordHttpRequest(req.method, req.baseUrl + (req.route?.path || req.path), statusCode);

  logger.error(err.message || 'Unhandled server error', {
    service: 'error-handler',
    requestId: reqId,
    method: req.method,
    route: req.originalUrl,
    status: statusCode,
    error: {
      name: err.name,
      message: err.message,
      code: err.code,
      stack: isProduction ? undefined : err.stack,
    },
  });

  // 1. Known operational AppError
  if (err instanceof AppError) {
    sendError(res, err.message, err.statusCode);
    return;
  }

  // 2. Body-parser JSON syntax error
  if (err instanceof SyntaxError && 'body' in err && (err as any).type === 'entity.parse.failed') {
    sendError(res, 'Malformed JSON payload in request body', 400);
    return;
  }

  // 3. PostgreSQL unique-constraint violation (code 23505)
  if (err.code === '23505') {
    sendError(res, 'A record with this identifier already exists.', 409);
    return;
  }

  // 4. PostgreSQL foreign key violation (code 23503)
  if (err.code === '23503') {
    sendError(res, 'Referenced resource does not exist.', 400);
    return;
  }

  // 5. Unexpected errors: Suppress stack traces, cloud details, and database schema in production
  const safeMessage = isProduction
    ? 'An unexpected error occurred. Please try again later.'
    : err.message || 'Internal server error';

  sendError(res, safeMessage, statusCode >= 400 && statusCode < 600 ? statusCode : 500);
}
