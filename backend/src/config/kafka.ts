import { Kafka, KafkaConfig, logLevel, SASLOptions } from 'kafkajs';
import dotenv from 'dotenv';

dotenv.config();

export const KAFKA_TOPIC = process.env.KAFKA_TOPIC || 'url-click-events';
export const KAFKA_GROUP_ID =
  process.env.KAFKA_GROUP_ID || 'url-shortener-click-consumers';

/**
 * Build Kafka client configuration from environment variables.
 * Supports Aiven for Apache Kafka, cloud-managed providers, and local brokers.
 *
 * Security & Aiven Compatibility:
 * - Reads brokers from KAFKA_BROKERS (e.g. your-service.aivencloud.com:25050).
 * - Enables TLS/SSL when KAFKA_SSL=true or when SASL credentials are present.
 * - Authenticates using SASL PLAIN / SCRAM-SHA-256 / SCRAM-SHA-512.
 * - Never hardcodes production broker endpoints or secrets.
 */
export function buildKafkaConfig(clientIdOverride?: string): KafkaConfig {
  const brokersEnv = process.env.KAFKA_BROKERS;

  if (!brokersEnv || brokersEnv.trim() === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'KAFKA_BROKERS environment variable is required in production environment.',
      );
    }
  }

  const brokers = (brokersEnv || 'localhost:9092')
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);

  const clientId =
    clientIdOverride || process.env.KAFKA_CLIENT_ID || 'url-shortener-api';

  const sslEnabled =
    process.env.KAFKA_SSL === 'true' ||
    (process.env.KAFKA_SSL !== 'false' &&
      Boolean(process.env.KAFKA_SASL_USERNAME && process.env.KAFKA_SASL_PASSWORD));

  const saslUsername = process.env.KAFKA_SASL_USERNAME;
  const saslPassword = process.env.KAFKA_SASL_PASSWORD;
  const saslMechanism = (
    process.env.KAFKA_SASL_MECHANISM || 'plain'
  ).toLowerCase() as 'plain' | 'scram-sha-256' | 'scram-sha-512';

  let sasl: SASLOptions | undefined = undefined;

  if (saslUsername && saslPassword) {
    sasl = {
      mechanism: saslMechanism,
      username: saslUsername,
      password: saslPassword,
    };
  }

  const connectionTimeout = parseInt(
    process.env.KAFKA_CONNECTION_TIMEOUT || '5000',
    10,
  );
  const requestTimeout = parseInt(
    process.env.KAFKA_REQUEST_TIMEOUT || '10000',
    10,
  );

  return {
    clientId,
    brokers,
    ssl: sslEnabled
      ? {
          rejectUnauthorized:
            process.env.KAFKA_REJECT_UNAUTHORIZED === 'true' ? true : false,
        }
      : false,
    sasl,
    connectionTimeout,
    requestTimeout,
    retry: {
      initialRetryTime: 100,
      retries: 2,
      factor: 0.2,
      multiplier: 2,
      maxRetryTime: 500,
    },
    logLevel: process.env.NODE_ENV === 'test' ? logLevel.NOTHING : logLevel.ERROR,
  };
}

/**
 * Factory function to create a new Kafka client instance.
 */
export function createKafkaClient(clientIdOverride?: string): Kafka {
  const config = buildKafkaConfig(clientIdOverride);
  return new Kafka(config);
}

/** Default singleton Kafka instance */
export const kafka = createKafkaClient();

/**
 * Ensure topic exists during startup.
 * Connects admin client, verifies if topic exists, and creates it if missing.
 * Handles permission-restricted cloud environments (e.g. Aiven) gracefully without throwing fatal errors.
 */
export async function ensureTopicExists(
  kafkaInstance: Kafka = kafka,
  topic: string = KAFKA_TOPIC,
  numPartitions: number = 1,
  replicationFactor: number = 1,
): Promise<void> {
  const admin = kafkaInstance.admin();
  try {
    await admin.connect();
    const existingTopics = await admin.listTopics();
    if (!existingTopics.includes(topic)) {
      console.log(`[KAFKA_ADMIN] Topic "${topic}" not found on cluster. Creating topic...`);
      await admin.createTopics({
        topics: [
          {
            topic,
            numPartitions,
            replicationFactor,
          },
        ],
      });
      console.log(`[KAFKA_ADMIN] Topic "${topic}" created successfully.`);
    } else {
      console.log(`[KAFKA_ADMIN] Topic "${topic}" verified on cluster.`);
    }
  } catch (err) {
    console.warn(
      `[KAFKA_ADMIN] Note: Topic verification for "${topic}" on managed cluster: ${(err as Error).message}. If topic creation is restricted, ensure it is created in the Aiven Console.`,
    );
  } finally {
    try {
      await admin.disconnect();
    } catch {
      // Ignore admin disconnect error
    }
  }
}
