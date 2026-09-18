import { Consumer, EachMessagePayload } from 'kafkajs';
import { kafka, KAFKA_TOPIC, KAFKA_GROUP_ID } from '../config/kafka.js';
import { clickEventSchema } from '../utils/validators.js';
import { processClickEvent } from './eventProcessor.service.js';
import type { ClickEvent } from '../types/index.js';
import { metrics } from '../utils/metrics.js';

let consumer: Consumer | null = null;
let isRunning = false;

const MAX_PROCESSING_RETRIES = 3;
const RETRY_BACKOFF_MS = 500;

/**
 * Helper to wait for a specified duration in milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Handle and process an individual Kafka message safely.
 */
export async function handleMessage({
  topic,
  partition,
  message,
}: EachMessagePayload): Promise<void> {
  const startTime = Date.now();
  const offset = message.offset;
  const key = message.key?.toString() || 'unknown-key';

  console.log(`[KAFKA_CONSUMER] 📩 Incoming message on topic=${topic}, partition=${partition}, offset=${offset}, key=${key}`);

  if (!message.value) {
    console.warn(
      `[KAFKA_CONSUMER] ⚠️ Empty message payload received on topic=${topic}, partition=${partition}, offset=${offset}`,
    );
    return;
  }

  // ── 1. Parse JSON ───────────────────────────────────────────
  let rawData: unknown;
  try {
    const rawString = message.value.toString('utf-8');
    rawData = JSON.parse(rawString);
  } catch (err) {
    console.error(
      `[KAFKA_CONSUMER] ❌ Malformed JSON rejected on topic=${topic}, partition=${partition}, offset=${offset}, key=${key}:`,
      (err as Error).message,
    );
    // Do not crash, acknowledge/skip invalid JSON
    return;
  }

  // ── 2. Validate against Zod schema ─────────────────────────
  const validation = clickEventSchema.safeParse(rawData);
  if (!validation.success) {
    console.error(
      `[KAFKA_CONSUMER] ❌ Event validation failed on topic=${topic}, partition=${partition}, offset=${offset}, key=${key}:`,
      validation.error.issues,
    );
    // Malformed schema: log error and safely skip
    metrics.recordKafkaConsume(false);
    return;
  }

  const event: ClickEvent = validation.data;
  const headerReqId = message.headers?.['x-request-id']?.toString();
  if (headerReqId && !event.requestId) {
    event.requestId = headerReqId;
  }
  const reqIdTag = event.requestId ? `[${event.requestId}]` : '';

  console.log(
    `[KAFKA_CONSUMER]${reqIdTag} ✅ Event received & validated: clickId=${event.clickId}, shortCode=${event.shortCode}, offset=${offset}`,
  );

  // ── 3. Process with transient retry strategy ───────────────
  let attempts = 0;
  let processed = false;

  while (attempts < MAX_PROCESSING_RETRIES && !processed) {
    try {
      attempts++;
      console.log(`[KAFKA_CONSUMER]${reqIdTag} ⏳ Processing attempt ${attempts}/${MAX_PROCESSING_RETRIES} for clickId=${event.clickId}...`);
      await processClickEvent(event);
      processed = true;
      metrics.recordKafkaConsume(true);
      metrics.recordClickHouseInsert(true);
      const duration = Date.now() - startTime;
      console.log(
        `[KAFKA_CONSUMER]${reqIdTag} ✅ Event processed successfully in ${duration}ms (attempt ${attempts}): clickId=${event.clickId}`,
      );
    } catch (err) {
      const error = err as Error;
      console.error(
        `[KAFKA_CONSUMER]${reqIdTag} ❌ Processing attempt ${attempts}/${MAX_PROCESSING_RETRIES} failed for clickId=${event.clickId}: ${error.message}`,
      );

      if (attempts < MAX_PROCESSING_RETRIES) {
        await sleep(RETRY_BACKOFF_MS * Math.pow(2, attempts - 1));
      } else {
        metrics.recordKafkaConsume(false);
        metrics.recordClickHouseInsert(false);
        const duration = Date.now() - startTime;
        console.error(
          `[KAFKA_CONSUMER]${reqIdTag} 💥 Event processing permanently failed after ${duration}ms (${MAX_PROCESSING_RETRIES} attempts): clickId=${event.clickId}`,
        );
      }
    }
  }
}

/**
 * Start the Kafka consumer and subscribe to the click events topic.
 */
export async function startConsumer(
  groupId: string = KAFKA_GROUP_ID,
  topic: string = KAFKA_TOPIC,
  fromBeginning: boolean = false,
): Promise<void> {
  if (isRunning) {
    console.log('⚠️ Kafka consumer is already running');
    return;
  }

  consumer = kafka.consumer({
    groupId,
    allowAutoTopicCreation: true,
    sessionTimeout: 30000,
    heartbeatInterval: 3000,
  });

  // Attach lifecycle event listeners
  consumer.on('consumer.connect', () => {
    console.log(`✅ Kafka consumer connected (group: ${groupId})`);
  });

  consumer.on('consumer.disconnect', () => {
    console.log('🔌 Kafka consumer disconnected');
  });

  consumer.on('consumer.crash', (event) => {
    console.error('💥 Kafka consumer crashed:', event.payload.error);
    isRunning = false;
  });

  try {
    await consumer.connect();
    await consumer.subscribe({ topic, fromBeginning });

    isRunning = true;
    console.log(
      `🎧 Kafka consumer subscribed to topic "${topic}" [group: ${groupId}]`,
    );

    await consumer.run({
      autoCommit: true,
      eachMessage: handleMessage,
    });
  } catch (err) {
    isRunning = false;
    console.error('❌ Failed to start Kafka consumer:', (err as Error).message);
    throw err;
  }
}

/**
 * Stop the Kafka consumer cleanly.
 */
export async function stopConsumer(): Promise<void> {
  if (!consumer || !isRunning) return;

  try {
    await consumer.stop();
    await consumer.disconnect();
    isRunning = false;
    console.log('🔌 Kafka consumer stopped and disconnected cleanly');
  } catch (err) {
    console.error('⚠️ Error stopping Kafka consumer:', (err as Error).message);
  }
}

/**
 * Check if the consumer is currently running.
 */
export function isConsumerRunning(): boolean {
  return isRunning;
}
