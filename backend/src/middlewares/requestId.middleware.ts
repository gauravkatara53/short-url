import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

// Augment express Request interface to include id
declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

/**
 * Middleware that extracts or generates a unique correlation ID (X-Request-ID).
 * Propagates the ID to response headers and attaches it to `req.id`.
 */
export function requestIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const incoming = (
    req.headers['x-request-id'] ||
    req.headers['x-correlation-id']
  ) as string | undefined;

  // Validate incoming ID format (alphanumeric, dashes, underscores, length <= 64)
  const isValidIncoming =
    incoming &&
    typeof incoming === 'string' &&
    incoming.trim().length > 0 &&
    incoming.length <= 64 &&
    /^[A-Za-z0-9-_]+$/.test(incoming);

  const requestId = isValidIncoming ? incoming.trim() : crypto.randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-ID', requestId);

  next();
}
