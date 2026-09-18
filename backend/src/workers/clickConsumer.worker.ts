import dotenv from 'dotenv';
dotenv.config();

import { ensureTopicExists, KAFKA_TOPIC, KAFKA_GROUP_ID } from '../config/kafka.js';
import { startConsumer, stopConsumer } from '../services/kafkaConsumer.service.js';
import { initClickHouse } from '../services/clickhouse.service.js';
import { clickhouse } from '../config/clickhouse.js';

import { validateEnvironment } from '../config/env.js';

let isShuttingDown = false;

async function startWorker(): Promise<void> {
  validateEnvironment();
  console.log('👷 Initialising Click Event Kafka Background Worker...');
  console.log(`📦 Topic: ${KAFKA_TOPIC}`);
  console.log(`👥 Consumer Group: ${KAFKA_GROUP_ID}`);

  try {
    // 1. Initialise ClickHouse analytics tables (idempotent)
    await initClickHouse();

    // 2. Verify or create topic before consuming
    await ensureTopicExists();

    // 3. Start consuming events
    await startConsumer();

    console.log('🚀 Click Event Background Worker is active and streaming events to ClickHouse.');
  } catch (err) {
    console.error('❌ Failed to start background worker:', (err as Error).message);
    process.exit(1);
  }
}

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`\n🛑 Received ${signal}. Gracefully shutting down worker...`);

  const shutdownTimeout = setTimeout(() => {
    console.error('⚠️ Shutdown timed out, forcing exit.');
    process.exit(1);
  }, 10000);

  try {
    // Stop consumer and disconnect Kafka
    await stopConsumer();

    // Close ClickHouse client connections
    await clickhouse.close();
    console.log('🔌 ClickHouse client closed.');

    clearTimeout(shutdownTimeout);
    console.log('✅ Worker shut down cleanly.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during worker shutdown:', (err as Error).message);
    clearTimeout(shutdownTimeout);
    process.exit(1);
  }
}

// ── Signal handlers ──────────────────────────────────────────
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGQUIT', () => shutdown('SIGQUIT'));

process.on('uncaughtException', (err) => {
  console.error('💥 Uncaught Exception in worker:', err);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  console.error('💥 Unhandled Rejection in worker:', reason);
});

// Start worker
startWorker();
