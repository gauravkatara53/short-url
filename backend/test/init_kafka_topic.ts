import dotenv from 'dotenv';
dotenv.config();

import { ensureTopicExists, kafka, KAFKA_TOPIC } from '../src/config/kafka.js';

async function init() {
  console.log(`Verifying / creating topic "${KAFKA_TOPIC}" on Aiven Kafka cluster...`);
  await ensureTopicExists(kafka, KAFKA_TOPIC, 1, 1);
  console.log('Topic initialization attempt completed.');
}

init().catch(console.error);
