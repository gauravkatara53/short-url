export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogContext {
  service?: string;
  requestId?: string;
  method?: string;
  route?: string;
  status?: number;
  durationMs?: number;
  [key: string]: unknown;
}

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'passwordhash',
  'token',
  'authorization',
  'secret',
  'cookie',
  'jwt',
  'apikey',
  'api_key',
  'credential',
  'credentials',
  'access_token',
  'refresh_token',
]);

/**
 * Deeply clone an object while masking sensitive keys (passwords, tokens, secrets).
 */
export function sanitizeLogData(obj: unknown, depth = 0): unknown {
  if (depth > 5 || obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // If string looks like a JWT or Bearer token, redact
    if (/^Bearer\s+[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+/i.test(obj)) {
      return 'Bearer [REDACTED]';
    }
    if (/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(obj)) {
      return '[REDACTED_JWT]';
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeLogData(item, depth + 1));
  }

  if (typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        cleaned[key] = '[REDACTED]';
      } else {
        cleaned[key] = sanitizeLogData(value, depth + 1);
      }
    }
    return cleaned;
  }

  return obj;
}

class StructuredLogger {
  private serviceName: string;

  constructor(serviceName = 'url-shortener-api') {
    this.serviceName = serviceName;
  }

  private log(level: LogLevel, message: string, context: LogContext = {}): void {
    const isProduction = process.env.NODE_ENV === 'production';
    const timestamp = new Date().toISOString();
    const sanitizedContext = sanitizeLogData(context) as LogContext;

    const entry = {
      timestamp,
      level,
      service: sanitizedContext.service || this.serviceName,
      requestId: sanitizedContext.requestId || undefined,
      method: sanitizedContext.method || undefined,
      route: sanitizedContext.route || undefined,
      status: sanitizedContext.status || undefined,
      durationMs: sanitizedContext.durationMs !== undefined ? Math.round(sanitizedContext.durationMs) : undefined,
      message,
      ...(Object.keys(sanitizedContext).length > 0 ? { data: sanitizedContext } : {}),
    };

    // In production, emit pure single-line structured JSON
    if (isProduction) {
      const line = JSON.stringify(entry);
      if (level === 'error') {
        console.error(line);
      } else if (level === 'warn') {
        console.warn(line);
      } else {
        console.log(line);
      }
      return;
    }

    // In development, emit clear human-readable log with key metadata
    const reqTag = entry.requestId ? `[${entry.requestId}]` : '';
    const durTag = entry.durationMs !== undefined ? ` (${entry.durationMs}ms)` : '';
    const statusTag = entry.status ? ` -> ${entry.status}` : '';
    const prefix = `[${level.toUpperCase()}][${entry.service}]${reqTag}`;

    if (level === 'error') {
      console.error(`${prefix} ❌ ${message}${statusTag}${durTag}`, context.error || '');
    } else if (level === 'warn') {
      console.warn(`${prefix} ⚠️ ${message}${statusTag}${durTag}`);
    } else {
      console.log(`${prefix} ℹ️ ${message}${statusTag}${durTag}`);
    }
  }

  info(message: string, context?: LogContext): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: LogContext): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: LogContext): void {
    this.log('error', message, context);
  }

  debug(message: string, context?: LogContext): void {
    if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
      this.log('debug', message, context);
    }
  }
}

export const logger = new StructuredLogger();
