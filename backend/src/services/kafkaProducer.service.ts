import { Producer } from 'kafkajs';
import { kafka, KAFKA_TOPIC } from '../config/kafka.js';
import type { ClickEvent } from '../types/index.js';
import { metrics } from '../utils/metrics.js';

let producer: Producer | null = null;
let isConnected = false;
let lastConnectAttempt = 0;
const RECONNECT_COOLDOWN_MS = 10000;

/**
 * Get or initialize the Kafka producer singleton.
 */
function getProducer(): Producer {
  if (!producer) {
    producer = kafka.producer({
      allowAutoTopicCreation: true,
      transactionTimeout: 5000,
    });
  }
  return producer;
}

/**
 * Connect the Kafka producer to the cluster.
 * Uses a cooldown throttle to prevent blocking incoming HTTP requests when Kafka is offline.
 */
export async function connectProducer(force: boolean = false): Promise<void> {
  if (isConnected) return;

  const now = Date.now();
  if (!force && now - lastConnectAttempt < RECONNECT_COOLDOWN_MS) {
    return;
  }

  lastConnectAttempt = now;

  try {
    const p = getProducer();
    await p.connect();
    isConnected = true;
    console.log('✅ Kafka producer connected');
  } catch (err) {
    isConnected = false;
    console.error('❌ Kafka producer connection failed:', (err as Error).message);
  }
}

/**
 * Disconnect the Kafka producer cleanly.
 */
export async function disconnectProducer(): Promise<void> {
  if (!producer || !isConnected) return;

  try {
    await producer.disconnect();
    isConnected = false;
    console.log('🔌 Kafka producer disconnected cleanly');
  } catch (err) {
    console.error('⚠️ Error disconnecting Kafka producer:', (err as Error).message);
  }
}

/**
 * Check if the producer is currently connected.
 */
export function isProducerConnected(): boolean {
  return isConnected;
}

/**
 * Publish a ClickEvent to the configured Kafka topic.
 *
 * Resilience guarantee:
 * - Uses clickId as the message key for partition affinity.
 * - If publishing fails or Kafka is offline, logs diagnostic metadata (clickId, shortCode, error)
 *   and returns false without throwing, ensuring the caller (e.g. redirect handler) is not crashed.
 */
export async function publishClickEvent(event: ClickEvent): Promise<boolean> {
  const startTime = Date.now();
  console.log(
    `[KAFKA_PRODUCER] ⏳ Preparing to publish click event: clickId=${event.clickId}, shortCode=${event.shortCode}, urlId=${event.urlId}, topic=${KAFKA_TOPIC}`,
  );

  try {
    const p = getProducer();

    if (!isConnected) {
      console.log('[KAFKA_PRODUCER] 🔌 Producer not connected, attempting reconnect...');
      // Attempt reconnection with cooldown throttle
      await connectProducer();
      if (!isConnected) {
        console.warn(
          `[KAFKA_PRODUCER] ⚠️ Publish skipped (producer offline): clickId=${event.clickId}, shortCode=${event.shortCode}`,
        );
        return false;
      }
    }

    const payload = JSON.stringify(event);

    await p.send({
      topic: KAFKA_TOPIC,
      messages: [
        {
          key: event.clickId,
          value: payload,
          timestamp: new Date(event.timestamp).getTime().toString(),
          headers: {
            'content-type': 'application/json',
            'event-type': 'url-click',
            ...(event.requestId ? { 'x-request-id': event.requestId } : {}),
          },
        },
      ],
    });

    const duration = Date.now() - startTime;
    metrics.recordKafkaProduce(true);
    console.log(
      `[KAFKA_PRODUCER] ✅ Click event published in ${duration}ms: clickId=${event.clickId}, shortCode=${event.shortCode}, payloadBytes=${Buffer.byteLength(payload)}`,
    );
    return true;
  } catch (err) {
    const duration = Date.now() - startTime;
    isConnected = false;
    metrics.recordKafkaProduce(false);
    const error = err as Error;
    console.error(
      `[KAFKA_PRODUCER] ❌ Failed to publish click event after ${duration}ms: clickId=${event.clickId}, shortCode=${event.shortCode}, error=${error.name}: ${error.message}`,
      error.stack,
    );
    return false;
  }
}
