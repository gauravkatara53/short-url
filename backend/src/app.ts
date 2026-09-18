import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import authRoutes from './routes/auth.routes.js';
import urlRoutes from './routes/url.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import { redirectUrl } from './controllers/url.controller.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { requestIdMiddleware } from './middlewares/requestId.middleware.js';
import {
  authRateLimiter,
  apiRateLimiter,
  redirectRateLimiter,
} from './middlewares/rateLimit.middleware.js';
import { sendSuccess, sendError } from './utils/response.js';
import { checkClickHouseHealth } from './config/clickhouse.js';
import pool from './config/database.js';
import redis from './config/redis.js';
import { isProducerConnected } from './services/kafkaProducer.service.js';
import { metrics, getMetricsHandler } from './utils/metrics.js';
import { logger } from './utils/logger.js';
import { env } from './config/env.js';

const app = express();

// Trust proxy for accurate client IP identification behind load balancers
app.set('trust proxy', true);

// ── 1. Request ID Propagation ────────────────────────────────
app.use(requestIdMiddleware);

// ── 2. Security Headers (Helmet) ─────────────────────────────
// Configured to protect REST APIs while allowing the inline redirect splash screen scripts/styles
const allowedOrigins = [
  env.FRONTEND_URL,
  env.CORS_ORIGIN,
  'https://console.novagk.dev',
  'https://novagk.dev',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
]
  .filter(Boolean)
  .flatMap((o) => (o as string).split(',').map((s) => s.trim()))
  .filter(Boolean);

app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", ...allowedOrigins],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  }),
);

// ── 3. Hardened CORS Configuration ───────────────────────────
// Disallows wildcard origin (*) and restricts to trusted origins / local dev
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. direct curl, tests, mobile/server clients)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Allow local development ports dynamically
      if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} not allowed by CORS policy`), false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-Timezone'],
    exposedHeaders: ['X-Request-ID'],
  }),
);

// ── 4. Body Parsers ──────────────────────────────────────────
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

// ── 5. Structured HTTP Request Logger & Metrics Tracker ──────
app.use((req, res, next) => {
  const startTime = Date.now();
  const reqId = req.id || 'unknown';

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    // Record telemetry metrics
    metrics.recordHttpRequest(req.method, req.baseUrl + (req.route?.path || req.path), res.statusCode);

    logger.info(`HTTP ${req.method} ${req.originalUrl} -> ${res.statusCode} (${duration}ms)`, {
      service: 'http-server',
      requestId: reqId,
      method: req.method,
      route: req.originalUrl,
      status: res.statusCode,
      durationMs: duration,
    });
  });

  next();
});

// ── 6. Telemetry Metrics Endpoint ────────────────────────────
app.get('/api/metrics', getMetricsHandler);

// ── 7. Health Check Probes ───────────────────────────────────

/**
 * GET /api/health
 * Backward-compatible health check for Phase 1–6 consumers.
 */
app.get('/api/health', async (_req, res) => {
  const clickhouseHealth = await checkClickHouseHealth();

  sendSuccess(
    res,
    {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        clickhouse: clickhouseHealth.status,
      },
    },
    'API is running',
  );
});

/**
 * GET /api/health/live
 * Liveness probe: Returns 200 OK as long as the process is alive.
 */
app.get('/api/health/live', (_req, res) => {
  const memory = process.memoryUsage();
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    memory: {
      rssMb: Math.round(memory.rss / (1024 * 1024) * 100) / 100,
      heapUsedMb: Math.round(memory.heapUsed / (1024 * 1024) * 100) / 100,
    },
  });
});

/**
 * GET /api/health/ready
 * Readiness probe: Tests connectivity to Neon PostgreSQL, Upstash Redis, Aiven Kafka, and ClickHouse Cloud.
 * Core redirects remain available even if external downstream components are degraded.
 */
app.get('/api/health/ready', async (_req, res) => {
  const startTime = Date.now();

  // 1. Check Neon PostgreSQL (Critical)
  let pgStatus: 'connected' | 'disconnected' = 'disconnected';
  let pgLatencyMs = 0;
  try {
    const t0 = Date.now();
    await pool.query('SELECT 1');
    pgLatencyMs = Date.now() - t0;
    pgStatus = 'connected';
  } catch (err) {
    pgStatus = 'disconnected';
    logger.warn('PostgreSQL health check failed', { error: (err as Error).message });
  }

  // 2. Check Upstash Redis (Degraded Fallback: Postgres)
  let redisStatus: 'connected' | 'degraded' | 'disabled' = 'disabled';
  let redisLatencyMs = 0;
  if (redis) {
    try {
      const t0 = Date.now();
      await redis.ping();
      redisLatencyMs = Date.now() - t0;
      redisStatus = 'connected';
    } catch {
      redisStatus = 'degraded';
    }
  }

  // 3. Check Aiven Apache Kafka (Degraded Fallback: Fail-open redirects)
  const kafkaStatus = isProducerConnected() ? 'connected' : 'degraded';

  // 4. Check ClickHouse Cloud (Degraded Fallback: Buffered in Kafka)
  const chHealth = await checkClickHouseHealth();

  const isCriticalHealthy = pgStatus === 'connected';
  const isAllHealthy =
    isCriticalHealthy &&
    redisStatus === 'connected' &&
    kafkaStatus === 'connected' &&
    chHealth.status === 'connected';

  const overallStatus = isAllHealthy
    ? 'ready'
    : isCriticalHealthy
      ? 'degraded'
      : 'unhealthy';

  const responsePayload = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    checkDurationMs: Date.now() - startTime,
    dependencies: {
      postgres: { status: pgStatus, latencyMs: pgLatencyMs, role: 'primary-database' },
      redis: { status: redisStatus, latencyMs: redisLatencyMs, role: 'cache' },
      kafka: { status: kafkaStatus, role: 'event-streaming' },
      clickhouse: { status: chHealth.status, version: chHealth.version, role: 'olap-analytics' },
    },
  };

  res.status(isCriticalHealthy ? 200 : 503).json(responsePayload);
});

// ── 8. API Routes with Tiered Rate Limiting ──────────────────
app.use('/api/auth', authRateLimiter, authRoutes);
app.use('/api/urls', apiRateLimiter, urlRoutes);
app.use('/api/analytics', apiRateLimiter, analyticsRoutes);

// ── 9. Public Short URL Redirection ──────────────────────────
// High-throughput rate limited, must follow /api routes
app.get('/:shortCode', redirectRateLimiter, redirectUrl);

// ── 10. 404 Handler ──────────────────────────────────────────
app.use((_req, res) => {
  sendError(res, 'Resource not found', 404);
});

// ── 11. Centralised Error Handler ────────────────────────────
app.use(errorHandler);

export default app;
