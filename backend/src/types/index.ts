import { Request, Response, NextFunction } from 'express';

/**
 * Safe user data (excludes password_hash)
 */
export interface SafeUser {
  id: string;
  name: string;
  email: string;
  created_at: Date;
  updated_at: Date;
}

/**
 * Full user row from database (includes password_hash)
 */
export interface UserRow extends SafeUser {
  password_hash: string;
}

/**
 * URL row from database
 */
export interface UrlRow {
  id: string;
  user_id: string;
  original_url: string;
  short_code: string;
  created_at: Date;
  updated_at: Date;
  expires_at: Date | null;
}

/**
 * Authenticated request – carries the verified user payload
 */
export interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    email: string;
  };
}

/**
 * Standard API success response
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
  message: string;
}

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
  success: false;
  message: string;
  error?: unknown;
}

export type ApiResponse<T = unknown> = ApiSuccessResponse<T> | ApiErrorResponse;

/**
 * JWT payload shape
 */
export interface JwtPayload {
  id: string;
  email: string;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

/**
 * Typed async route handler to avoid repetitive try-catch
 */
export type AsyncHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

/**
 * Supported device categories for clickstream analytics
 */
export type DeviceType = 'desktop' | 'mobile' | 'tablet' | 'unknown';

/**
 * Standardized Click Event data model for clickstream tracking
 */
export interface ClickEvent {
  clickId: string;
  urlId: string;
  shortCode: string;
  timestamp: string; // ISO 8601 string
  ipAddress: string | null;
  userAgent: string | null;
  device: DeviceType;
  browser: string;
  operatingSystem: string;
  referrer: string | null;
  country: string | null;
  requestId?: string;
}

/**
 * Click Event row stored in PostgreSQL click_events table
 */
export interface ClickEventRow {
  id: string;
  url_id: string;
  short_code: string;
  timestamp: Date;
  ip_address: string | null;
  user_agent: string | null;
  device: string;
  browser: string;
  operating_system: string;
  referrer: string | null;
  country: string | null;
  created_at: Date;
}

/**
 * Cached URL representation stored in Redis
 */
export interface CachedUrl {
  originalUrl: string;
  urlId: string;
}

/**
 * Resolved URL result from URL service
 */
export interface ResolvedUrl {
  originalUrl: string;
  urlId: string;
  shortCode: string;
  source?: 'cache' | 'postgres';
}
