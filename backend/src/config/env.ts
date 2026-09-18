import dotenv from 'dotenv';
dotenv.config();

export interface AppEnvConfig {
  NODE_ENV: string;
  PORT: number;
  BASE_URL: string;
  DATABASE_URL?: string;
  JWT_SECRET: string;
  JWT_EXPIRES_IN: string;
  FRONTEND_URL: string;
  CORS_ORIGIN?: string;
  // Upstash Redis
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
  REDIS_URL_TTL: number;
  // Aiven Kafka
  KAFKA_BROKERS?: string;
  KAFKA_TOPIC: string;
  KAFKA_GROUP_ID: string;
  KAFKA_CLIENT_ID: string;
  // ClickHouse Cloud
  CLICKHOUSE_URL?: string;
  CLICKHOUSE_DATABASE: string;
  CLICKHOUSE_USERNAME: string;
  CLICKHOUSE_PASSWORD?: string;
  // Rate Limiting
  RATE_LIMIT_AUTH_MAX: number;
  RATE_LIMIT_AUTH_WINDOW_MS: number;
  RATE_LIMIT_API_MAX: number;
  RATE_LIMIT_API_WINDOW_MS: number;
  RATE_LIMIT_REDIRECT_MAX: number;
  RATE_LIMIT_REDIRECT_WINDOW_MS: number;
}

/**
 * Validate that all required cloud infrastructure environment variables are set in production.
 * Fails fast with a descriptive error message on startup if any are missing.
 */
export function validateEnvironment(): void {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    return;
  }

  const missing: string[] = [];

  if (!process.env.DATABASE_URL || process.env.DATABASE_URL.trim() === '') {
    missing.push('DATABASE_URL (Neon PostgreSQL)');
  }

  if (
    !process.env.JWT_SECRET ||
    process.env.JWT_SECRET.trim() === '' ||
    process.env.JWT_SECRET === 'fallback-secret-do-not-use' ||
    process.env.JWT_SECRET.length < 16
  ) {
    missing.push('JWT_SECRET (must be secure string of >=16 chars)');
  }

  if (!process.env.KAFKA_BROKERS || process.env.KAFKA_BROKERS.trim() === '') {
    missing.push('KAFKA_BROKERS (Aiven Kafka)');
  }

  if (!process.env.CLICKHOUSE_URL || process.env.CLICKHOUSE_URL.trim() === '') {
    missing.push('CLICKHOUSE_URL (ClickHouse Cloud)');
  }

  if (
    !process.env.UPSTASH_REDIS_REST_URL ||
    !process.env.UPSTASH_REDIS_REST_TOKEN
  ) {
    missing.push('UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (Upstash Redis)');
  }

  if (missing.length > 0) {
    const errorMsg = `❌ CRITICAL STARTUP FAILURE: Missing required production environment variables:\n  • ${missing.join('\n  • ')}`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}

export const env: AppEnvConfig = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  BASE_URL: (process.env.BASE_URL || 'https://novagk.dev').replace(/\/$/, ''),
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET || 'dev-insecure-secret-change-in-production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  FRONTEND_URL: (process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'https://console.novagk.dev').replace(/\/$/, ''),
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'https://console.novagk.dev',
  UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
  UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
  REDIS_URL_TTL: parseInt(process.env.REDIS_URL_TTL || '86400', 10),
  KAFKA_BROKERS: process.env.KAFKA_BROKERS,
  KAFKA_TOPIC: process.env.KAFKA_TOPIC || 'url-click-events',
  KAFKA_GROUP_ID: process.env.KAFKA_GROUP_ID || 'url-shortener-click-consumers',
  KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID || 'url-shortener-api',
  CLICKHOUSE_URL: process.env.CLICKHOUSE_URL,
  CLICKHOUSE_DATABASE: process.env.CLICKHOUSE_DATABASE || 'default',
  CLICKHOUSE_USERNAME: process.env.CLICKHOUSE_USERNAME || 'default',
  CLICKHOUSE_PASSWORD: process.env.CLICKHOUSE_PASSWORD,
  RATE_LIMIT_AUTH_MAX: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '20', 10),
  RATE_LIMIT_AUTH_WINDOW_MS: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW_MS || '900000', 10), // 15 mins
  RATE_LIMIT_API_MAX: parseInt(process.env.RATE_LIMIT_API_MAX || '200', 10),
  RATE_LIMIT_API_WINDOW_MS: parseInt(process.env.RATE_LIMIT_API_WINDOW_MS || '900000', 10), // 15 mins
  RATE_LIMIT_REDIRECT_MAX: parseInt(process.env.RATE_LIMIT_REDIRECT_MAX || '2000', 10),
  RATE_LIMIT_REDIRECT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_REDIRECT_WINDOW_MS || '900000', 10), // 15 mins
};
