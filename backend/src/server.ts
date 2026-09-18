import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import pool, { initDatabase } from './config/database.js';
import { connectProducer, disconnectProducer } from './services/kafkaProducer.service.js';
import { ensureTopicExists } from './config/kafka.js';
import { startConsumer, stopConsumer } from './services/kafkaConsumer.service.js';
import { initClickHouse } from './services/clickhouse.service.js';
import { clickhouse } from './config/clickhouse.js';
import { validateEnvironment, env } from './config/env.js';
import { logger } from './utils/logger.js';

const PORT = env.PORT;
let server: ReturnType<typeof app.listen> | null = null;
let isShuttingDown = false;

async function start(): Promise<void> {
  try {
    // 0. Validate production environment configuration
    validateEnvironment();

    // 1. Initialise PostgreSQL tables
    await initDatabase();

    // 2. Initialise Kafka producer
    await connectProducer();

    // 3. Initialise ClickHouse tables and start Kafka background consumer
    try {
      await initClickHouse();
      await ensureTopicExists();
      await startConsumer();
      logger.info('Kafka click consumer active', { service: 'startup' });
    } catch (consumerErr) {
      logger.warn('Consumer auto-start notice: ' + (consumerErr as Error).message, { service: 'startup' });
    }

    // 4. Start HTTP server
    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📋 Health checks:`);
      console.log(`   • Standard : http://localhost:${PORT}/api/health`);
      console.log(`   • Liveness : http://localhost:${PORT}/api/health/live`);
      console.log(`   • Readiness: http://localhost:${PORT}/api/health/ready`);
      console.log(`📊 Metrics:     http://localhost:${PORT}/api/metrics`);
      console.log(`🔧 Environment: ${env.NODE_ENV}`);
    });
  } catch (err) {
    logger.error('Failed to start server: ' + (err as Error).message, {
      service: 'startup',
      error: err,
    });
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🛑 Received ${signal}. Gracefully shutting down API server...`);

  const shutdownTimeout = setTimeout(() => {
    console.error('⚠️ Server shutdown timed out (10s), forcing exit.');
    process.exit(1);
  }, 10000);

  try {
    // 1. Stop accepting new HTTP requests
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      console.log('🔌 HTTP server stopped.');
    }

    // 2. Stop Kafka consumer and close ClickHouse client
    try {
      await stopConsumer();
      await clickhouse.close();
      console.log('🔌 Kafka consumer stopped & ClickHouse client closed.');
    } catch (workerErr) {
      console.warn('⚠️ Notice closing consumer/ClickHouse:', (workerErr as Error).message);
    }

    // 3. Disconnect Kafka producer
    await disconnectProducer();

    // 4. Drain and close PostgreSQL pool
    await pool.end();
    console.log('🔌 PostgreSQL pool closed.');

    clearTimeout(shutdownTimeout);
    console.log('✅ Server shut down cleanly.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during server shutdown:', (err as Error).message);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

// ── Graceful shutdown handlers ───────────────────────────────
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception in server:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Rejection in server:', reason);
});

start();
