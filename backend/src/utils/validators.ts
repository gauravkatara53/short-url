import { z } from 'zod/v4';

// ── Auth schemas ────────────────────────────────────────────

export const registerSchema = z.object({
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters')
    .trim(),
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must be at most 255 characters')
    .transform((v) => v.toLowerCase().trim()),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
});

export const loginSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, 'Password is required'),
});

// ── URL schemas ─────────────────────────────────────────────

const DANGEROUS_PROTOCOLS = new Set([
  'javascript:',
  'data:',
  'vbscript:',
  'file:',
  'blob:',
]);

export const createUrlSchema = z.object({
  originalUrl: z
    .string()
    .url('Invalid URL format')
    .refine(
      (val) => {
        try {
          const parsed = new URL(val);
          const protocol = parsed.protocol.toLowerCase();
          if (DANGEROUS_PROTOCOLS.has(protocol)) {
            return false;
          }
          return protocol === 'http:' || protocol === 'https:';
        } catch {
          return false;
        }
      },
      {
        message:
          'Dangerous or unsupported URL protocol. Only http:// and https:// URLs are allowed.',
      },
    ),
  expiresAt: z
    .string()
    .datetime({ message: 'Invalid datetime format' })
    .optional()
    .refine(
      (val) => {
        if (!val) return true;
        return new Date(val) > new Date();
      },
      { message: 'Expiration date must be in the future' },
    ),
});

export const paginationSchema = z.object({
  page: z
    .string()
    .default('1')
    .transform(Number)
    .pipe(z.number().int().min(1, 'Page must be at least 1')),
  limit: z
    .string()
    .default('10')
    .transform(Number)
    .pipe(
      z
        .number()
        .int()
        .min(1, 'Limit must be at least 1')
        .max(100, 'Limit must be at most 100'),
    ),
});

// ── Click Event schema ──────────────────────────────────────

export const clickEventSchema = z.object({
  clickId: z.string().uuid('Invalid clickId UUID format'),
  urlId: z.string().uuid('Invalid urlId UUID format'),
  shortCode: z.string().min(1, 'Short code is required'),
  timestamp: z.string().datetime({ message: 'Invalid ISO timestamp format' }),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  device: z.enum(['desktop', 'mobile', 'tablet', 'unknown']),
  browser: z.string().min(1, 'Browser is required'),
  operatingSystem: z.string().min(1, 'Operating system is required'),
  referrer: z.string().nullable(),
  country: z.string().nullable(),
  requestId: z.string().optional(),
});

// ── Analytics schemas ───────────────────────────────────────

export const shortCodeParamSchema = z.object({
  shortCode: z
    .string()
    .min(1, 'Short code is required')
    .max(50, 'Short code is too long')
    .regex(/^[a-zA-Z0-9_-]+$/, 'Invalid short code format'),
});

export const timelineQuerySchema = z
  .object({
    startDate: z.string().datetime({ message: 'Invalid startDate ISO format' }).optional(),
    endDate: z.string().datetime({ message: 'Invalid endDate ISO format' }).optional(),
    interval: z.enum(['hour', 'day', 'week']).default('day'),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate).getTime() <= new Date(data.endDate).getTime();
      }
      return true;
    },
    {
      message: 'startDate must be less than or equal to endDate',
      path: ['startDate'],
    },
  );

export const analyticsFilterQuerySchema = z
  .object({
    startDate: z.string().datetime({ message: 'Invalid startDate ISO format' }).optional(),
    endDate: z.string().datetime({ message: 'Invalid endDate ISO format' }).optional(),
    limit: z
      .string()
      .optional()
      .transform((v) => (v ? Number(v) : undefined))
      .pipe(z.number().int().min(1).max(100).optional()),
  })
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate).getTime() <= new Date(data.endDate).getTime();
      }
      return true;
    },
    {
      message: 'startDate must be less than or equal to endDate',
      path: ['startDate'],
    },
  );

// Inferred types
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUrlInput = z.infer<typeof createUrlSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type ClickEventInput = z.infer<typeof clickEventSchema>;
export type ShortCodeParamInput = z.infer<typeof shortCodeParamSchema>;
export type TimelineQueryInput = z.infer<typeof timelineQuerySchema>;
export type AnalyticsFilterQueryInput = z.infer<typeof analyticsFilterQuerySchema>;
