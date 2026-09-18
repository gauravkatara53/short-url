import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/jwt.js';
import { sendError } from '../utils/response.js';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import type { AuthenticatedRequest } from '../types/index.js';

/**
 * JWT authentication middleware.
 * Extracts Bearer token, verifies signature and algorithm, and sets req.user.
 * Never logs raw tokens or authorization headers.
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const reqId = req.id || Math.random().toString(36).substring(2, 8);
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logger.warn('Missing or malformed Authorization header', {
      service: 'auth-middleware',
      requestId: reqId,
      method: req.method,
      route: req.originalUrl,
    });
    sendError(res, 'Authentication required. Please provide a valid token.', 401);
    return;
  }

  const token = authHeader.substring(7).trim();

  if (!token) {
    logger.warn('Empty Bearer token extracted', {
      service: 'auth-middleware',
      requestId: reqId,
      method: req.method,
      route: req.originalUrl,
    });
    sendError(res, 'Authentication required. Please provide a valid token.', 401);
    return;
  }

  try {
    const payload = verifyToken(token);
    (req as AuthenticatedRequest).user = {
      id: payload.id,
      email: payload.email,
    };
    next();
  } catch (err) {
    if (err instanceof AppError) {
      sendError(res, err.message, err.statusCode);
      return;
    }
    logger.warn('Token verification error', {
      service: 'auth-middleware',
      requestId: reqId,
      error: (err as Error).message,
    });
    sendError(res, 'Invalid token.', 401);
  }
}
