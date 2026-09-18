# URL Shortener + Clickstream Analytics Backend

A high-performance URL shortening and clickstream event streaming backend built with Node.js, Express, TypeScript, PostgreSQL, Upstash Redis, and **Aiven for Apache Kafka**.

---

## Architecture Overview

```text
                                  User Request
                                       │
                                       ▼
                              GET /:shortCode
                                       │
                         ┌─────────────┴─────────────┐
                         ▼                           ▼
                   Redis Cache                Neon / Aiven PostgreSQL
                    (Cache HIT)                     (Cache MISS)
                         │                               │
                         └─────────────┬─────────────────┘
                                       │
                                 Valid URL found
                                       │
                                       ▼
                               Build ClickEvent
                         (UUID, IP, UA, Device, Time)
                                       │
                                       ▼
                              Kafka Producer Service
                                       │
                      ┌────────────────┴────────────────┐
                      │                                 │
           (Publish Success)                     (Publish Failure)
                      │                                 │
                      ▼                                 ▼
           Aiven for Apache Kafka                Structured Error Log
         Topic: url-click-events             (Redirect NEVER fails with 500)
                      │                                 │
                      │                                 │
                      └────────────────┬────────────────┘
                                       │
                                       ▼
                              HTTP 301 Redirect
                                       │
                      ═════════════════╪═════════════════ (Async Boundary)
                                       │
                                       ▼
                           Kafka Consumer Service
                                       │
                                       ▼
                           Dedicated Background Worker
                          (npm run worker / standalone)
                                       │
                                       ▼
                           Parse JSON & Zod Validation
                                       │
                         ┌─────────────┴─────────────┐
                         ▼                           ▼
                    Valid Event                Malformed/Invalid
                         │                           │
                         ▼                           ▼
                 Event Processor             Log & Safe Skip / DLQ
               (Pluggable Handler)           (Worker NEVER crashes)
                         │
                         ▼
             Ready for ClickHouse (Phase 5)
```

---

## Kafka Integration Details (Aiven for Apache Kafka)

- **Managed Kafka Provider**: Aiven for Apache Kafka
- **Kafka Client**: KafkaJS (`kafkajs`)
- **Kafka Topic**: `url-click-events` (configurable via `KAFKA_TOPIC`)
- **Consumer Group**: `url-shortener-click-consumers` (configurable via `KAFKA_GROUP_ID`)
- **Security & Authentication**:
  - **SSL/TLS**: Enabled via `KAFKA_SSL=true`
  - **SASL Authentication**: Supported mechanism `plain` (or `scram-sha-256`/`scram-sha-512`)
  - **Zero Credentials Hardcoded**: All credentials loaded strictly from environment variables (`.env`).
- **Redirect Availability Guarantee**: Fail-open architecture ensures that transient Kafka outages, broker rebalances, or network partitions never cause short URL redirects to fail with HTTP 500.

---

## Environment Variables (.env)

Configure your `.env` using placeholders (never commit secrets):

```env
# Server
PORT=3000
NODE_ENV=development

# PostgreSQL
DATABASE_URL=postgresql://avnadmin:your_password@your-pg-service.aivencloud.com:25049/defaultdb?sslmode=require

# JWT
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=7d

# App
BASE_URL=https://novagk.dev
SHORT_CODE_LENGTH=7

# CORS
CORS_ORIGIN=https://console.novagk.dev

# Upstash Redis
UPSTASH_REDIS_REST_URL=https://your-upstash-redis-url.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_redis_token
REDIS_URL_TTL=86400

# Aiven for Apache Kafka
KAFKA_BROKERS=your-kafka-service.aivencloud.com:25050
KAFKA_CLIENT_ID=url-shortener-api
KAFKA_TOPIC=url-click-events
KAFKA_GROUP_ID=url-shortener-click-consumers
KAFKA_SSL=true
KAFKA_SASL_MECHANISM=plain
KAFKA_SASL_USERNAME=avnadmin
KAFKA_SASL_PASSWORD=your_aiven_kafka_password
KAFKA_CONNECTION_TIMEOUT=5000
KAFKA_REQUEST_TIMEOUT=10000
```

---

## Running the Application

### 1. Start the API Server
```bash
npm run dev
```

### 2. Start the Kafka Background Worker
In a separate terminal:
```bash
npm run worker
```

### 3. Run Verification Tests
```bash
npm test
```

### 4. Build for Production
```bash
npm run build
```
