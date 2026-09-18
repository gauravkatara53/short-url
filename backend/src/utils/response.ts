import type { Response } from 'express';
import type { ApiSuccessResponse, ApiErrorResponse } from '../types/index.js';

/**
 * Send a success JSON response.
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message: string = 'Success',
  statusCode: number = 200,
): void {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
    message,
  };
  res.status(statusCode).json(body);
}

/**
 * Send an error JSON response.
 */
export function sendError(
  res: Response,
  message: string,
  statusCode: number = 500,
  error?: unknown,
): void {
  const body: ApiErrorResponse = {
    success: false,
    message,
    ...(error !== undefined && { error }),
  };
  res.status(statusCode).json(body);
}
