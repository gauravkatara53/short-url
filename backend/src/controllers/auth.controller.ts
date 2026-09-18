import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod/v4';
import * as authService from '../services/auth.service.js';
import { registerSchema, loginSchema } from '../utils/validators.js';
import { sendSuccess, sendError } from '../utils/response.js';

/**
 * POST /api/auth/register
 */
export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'Validation failed', 400, z.prettifyError(parsed.error));
      return;
    }

    const { name, email, password } = parsed.data;
    const user = await authService.register(name, email, password);

    sendSuccess(res, { user }, 'User registered successfully', 201);
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/auth/login
 */
export async function login(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      sendError(res, 'Validation failed', 400, z.prettifyError(parsed.error));
      return;
    }

    const { email, password } = parsed.data;
    const result = await authService.login(email, password);

    sendSuccess(res, result, 'Login successful');
  } catch (err) {
    next(err);
  }
}
