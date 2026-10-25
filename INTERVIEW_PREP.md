# 🚀 Distributed URL Shortener & Clickstream Analytics Platform
## Complete System Design, Architecture & Interview Preparation Guide

> **Target Audience**: Read this document before a Technical Interview (System Design, Backend Engineering, Distributed Systems, or Full-Stack). It provides the complete mental model, architectural decisions, failure modes, trade-offs, code structures, and expected interview Q&As for this project.

---

## 📑 Table of Contents

1. [Quick-Recall Cheat Sheet (5-Minute Review)](#1-quick-recall-cheat-sheet-5-minute-review)
2. [Project Elevator Pitch & High-Level Summary](#2-project-elevator-pitch--high-level-summary)
3. [Core Tech Stack & Cloud Infrastructure](#3-core-tech-stack--cloud-infrastructure)
4. [End-to-End System Architecture Diagram](#4-end-to-end-system-architecture-diagram)
5. [The 4 Core Data Flows (Deep Dive)](#5-the-4-core-data-flows-deep-dive)
   - [Write Path: Creating a Short URL](#flow-1-write-path-creating-a-short-url)
   - [Read Path: Sub-Millisecond Redirection](#flow-2-read-path-sub-millisecond-redirection)
   - [Async Ingestion Path: Kafka to ClickHouse](#flow-3-async-ingestion-path-kafka-to-clickhouse)
   - [Analytics Query Path: OLAP Aggregations](#flow-4-analytics-query-path-olap-aggregations)
6. [Key Architectural Decisions & Trade-Offs (Why X and not Y?)](#6-key-architectural-decisions--trade-offs)
7. [Database Schemas & Data Modeling](#7-database-schemas--data-modeling)
8. [Failure Modes, Resilience & Production Hardening](#8-failure-modes-resilience--production-hardening)
9. [Security, Rate Limiting & Observability](#9-security-rate-limiting--observability)
10. [Back-of-the-Envelope Capacity Calculations](#10-back-of-the-envelope-capacity-calculations)
11. [Frontend Architecture & UI Features](#11-frontend-architecture--ui-features)
12. [Top 25 Interview Questions & High-Impact Answers](#12-top-25-interview-questions--high-impact-answers)

---

## 1. Quick-Recall Cheat Sheet (5-Minute Review)

If your interview starts in 5 minutes, memorize these points:

| Dimension | Details |
|---|---|
| **What is it?** | A production-grade, distributed URL shortener with real-time clickstream event streaming and sub-second OLAP analytics across millions of clicks. |
| **Primary Databases** | **PostgreSQL (Neon)** for ACID relational metadata; **Redis (Upstash)** for sub-ms caching; **ClickHouse Cloud** for columnar OLAP analytics; **Aiven Apache Kafka** for event streaming. |
| **Short Code Math** | **Base62 (`[A-Za-z0-9]`)**, **7 characters** $\rightarrow 62^7 \approx 3.52$ trillion unique URLs. Generated via `crypto.randomBytes(7)` to prevent enumeration attacks; retries up to 5 times on collision. |
| **Redirect SLA** | Cache HIT: **< 1-2 ms** via Redis. Cache MISS: **15-30 ms** via PostgreSQL index on `short_code`. Populates Redis with 24h TTL. |
| **Fail-Open Resilience** | In the redirect handler, Kafka event streaming is **fail-open**. If Kafka is down, the error is logged and the user still receives **HTTP 301** redirect. Redirection **never fails with 500**. |
| **Anti-Caching Headers** | Redirect responses use `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate` so browsers don't cache 301, preserving accurate click tracking. |
| **ClickHouse Engine** | `ReplacingMergeTree(created_at)` with `ORDER BY (url_id, short_code, timestamp, click_id)`. Automatically reconciles duplicate events caused by Kafka's at-least-once delivery! |
| **ClickHouse Optimizations**| `LowCardinality(String)` on `device`, `browser`, `operating_system`, `short_code` (dictionary encoding, 90% disk reduction). `async_insert: 1` server-side micro-batching. |
| **Observability** | Distributed `X-Request-ID` tracing from HTTP request $\rightarrow$ Kafka message headers $\rightarrow$ Consumer worker $\rightarrow$ ClickHouse; `/api/health/live`, `/api/health/ready`, `/api/metrics`. |
| **Security** | Helmet CSP, strict origin CORS (no wildcard with credentials), bcrypt salt rounds, JWT stateless auth, Zod validation, dangerous scheme rejection (`javascript:`, `data:`). |

---

## 2. Project Elevator Pitch & High-Level Summary

### 30-Second Elevator Pitch
> *"I designed and built a distributed URL shortener and real-time clickstream analytics platform. It separates high-speed transactional redirects from heavy analytical workloads using a decoupled, event-driven architecture. Active URLs are resolved in sub-millisecond time via Redis cache-aside backed by PostgreSQL. Each redirect asynchronously publishes click telemetry to Apache Kafka via a fail-open pipeline, which a dedicated worker ingests into ClickHouse Cloud. This allows instant analytical queries over millions of click records—filtering by country, device, browser, and custom time buckets—without ever slowing down user redirects."*

### 2-Minute Architectural Pitch
> *"The biggest challenge in a modern URL shortener isn't shortening the link—it's handling high-velocity click tracking without bottlenecking redirects. In traditional architectures, inserting a click row into a relational database on every redirect causes write contention, table lock issues, and high latency.*
> 
> *To solve this, I designed a 4-tier decoupled pipeline:*
> 1. *First, the **Read Path** optimizes redirect latency using a Redis Cache-Aside pattern. Short codes use 7-character Base62 encoding ($62^7 \approx 3.52$ trillion combinations) generated cryptographically to prevent scraping. Cache hits return in under 2ms.*
> 2. *Second, click tracking is **asynchronous and fail-open**. The Express server extracts client metadata (IP geolocation via MaxMind/geoip-lite, User-Agent device/browser/OS parsing) and pushes an event to an Aiven Apache Kafka topic (`url-click-events`). If Kafka is offline, the redirect still succeeds with HTTP 301; redirects never fail with a 500 error.*
> 3. *Third, a **standalone consumer worker** ingests events from Kafka, validates them with Zod, and streams them into ClickHouse Cloud using the `ReplacingMergeTree` engine. This engine handles deduplication at storage level, which is critical because Kafka provides at-least-once delivery semantics.*
> 4. *Fourth, the **React frontend dashboard** queries ClickHouse via parameterized analytical APIs to render real-time time-series trends, device donuts, browser/OS breakdowns, and geographic distributions.*
> 
> *The entire system includes production-grade resilience: 3-tier rate limiting, Helmet CSP, strict CORS, distributed `X-Request-ID` tracing, and Kubernetes-style `/api/health/live` and `/ready` probes."*

---

## 3. Core Tech Stack & Cloud Infrastructure

| Layer | Technology | Service / Provider | Purpose & Technical Justification |
|---|---|---|---|
| **Backend Runtime** | Node.js + Express 5 + TypeScript | Self-hosted / Node container | High I/O event-driven concurrency, strict type safety across services. |
| **Relational Database** | PostgreSQL 16 | Neon Serverless PostgreSQL | ACID compliance, relational integrity, user auth, foreign keys with cascade deletes. |
| **In-Memory Cache** | Redis | Upstash Serverless Redis | Sub-millisecond URL resolution, 24-hour TTL, transparent fallback to Postgres. |
| **Event Streaming** | Apache Kafka | Aiven for Apache Kafka | Decouples redirect path from analytics sink; absorbs traffic spikes with partitioned durability. |
| **OLAP Analytics** | ClickHouse | ClickHouse Cloud | Columnar storage, vectorized execution, sub-second aggregation over millions of rows. |
| **Background Worker** | Standalone Node.js process | Docker / Node process | Decoupled consumer group worker; parses, validates, and batches Kafka events into ClickHouse. |
| **Frontend UI** | React 18 + Vite + TailwindCSS | Cloudflare Pages / Vercel | Modern responsive dashboard, interactive charts, date range filtering, link management. |
| **Validation & Schema** | Zod (v4) | Runtime library | Strict runtime validation for API requests, Kafka payloads, and ClickHouse data types. |
| **Security & Utilities** | Helmet, bcrypt, jsonwebtoken, express-rate-limit, geoip-lite, ua-parser-js | Open-source libraries | Defense-in-depth, IP country lookup, User-Agent classification, password hashing. |

---

## 4. End-to-End System Architecture Diagram

```text
                                 [ Client Browser / cURL ]
                                             │
                                             │ 1. GET /:shortCode
                                             ▼
                                  ┌───────────────────────┐
                                  │      Express API      │
                                  │   (Rate Limiter &     │
                                  │   RequestId Tracing)  │
                                  └───────────┬───────────┘
                                              │
                                              ▼
                                    Redis Cache-Aside?
                                     ┌────────┴────────┐
                        (Cache HIT)  │                 │  (Cache MISS)
                                     ▼                 ▼
                              [ Upstash Redis ]   [ PostgreSQL ]
                              (Returns URL + Id)   (Finds URL & populates Redis)
                                     │                 │
                                     └────────┬────────┘
                                              │ URL Resolved (< 2ms)
                                              ▼
                                   Extract Telemetry Data
                                  (IP Geolocation + UA Parsing)
                                              │
                                              ▼
                                   Publish ClickEvent to Kafka
                                   Topic: 'url-click-events'
                                              │
                                ┌─────────────┴─────────────┐
                    (Kafka UP)  │                           │  (Kafka DOWN - Fail-Open)
                                ▼                           ▼
                      [ Aiven Kafka Broker ]        [ Log Warning & Metric ]
                      (Partition Key: clickId)      (Redirect NEVER fails with 500)
                                │                           │
                                └─────────────┬─────────────┘
                                              │
                                              ▼
                                    HTTP 301 Redirect /
                                   Intermediate Splash UI
                                              │
══════════════════════════════════════════════╪══════════════════════════════════════════════
                                    (Async Boundary)
                                              │
                                              ▼
                                   [ Dedicated Worker ]
                                  (clickConsumer.worker)
                                              │
                                              ▼
                                   Validate Schema (Zod)
                                (Drops poison pills safely)
                                              │
                                              ▼
                                  [ ClickHouse Cloud OLAP ]
                                 Table: click_events (ReplacingMergeTree)
                                              │
══════════════════════════════════════════════╪══════════════════════════════════════════════
                                    (Analytics Query Path)
                                              │
                                              ▼
       [ React Dashboard ] ─── GET /api/analytics/:code/overview ───► [ ClickHouse SQL Queries ]
       (Console.novagk.dev)    GET /api/analytics/:code/timeline      (Vectorized Aggregation)
                               GET /api/analytics/:code/devices
```

---

## 5. The 4 Core Data Flows (Deep Dive)

### Flow 1: Write Path (Creating a Short URL)
**Endpoint**: `POST /api/urls` (Protected with JWT Auth & Rate Limited to 200 req / 15 min)

1. **Authentication & Validation**:
   - `authenticate` middleware extracts JWT Bearer token, verifies signature, and populates `req.user` (`{ id, email }`).
   - Request body is validated against `createUrlSchema` (Zod):
     - `originalUrl`: Required, valid URL, maximum 2048 chars, **must be `http` or `https`** (dangerous schemes like `javascript:`, `data:`, `file:` are rejected).
     - `expiresAt`: Optional ISO 8601 datetime string. Must be in the future.
2. **Short Code Generation (Collision-Resistant Base62)**:
   - `generateShortCode(7)` generates 7 cryptographically secure random bytes using `node:crypto.randomBytes(7)` and maps each byte modulo 62 into the Base62 charset:
     $$\text{Charset: } [A-Z, a-z, 0-9] \quad (\text{Total } 62 \text{ chars})$$
     $$\text{Capacity: } 62^7 = 3,521,614,606,208 \quad (\approx 3.52 \text{ Trillion unique URLs})$$
3. **Collision Detection & Retry Loop**:
   - A `while` loop checks `UrlModel.shortCodeExists(shortCode)` up to **5 retries**. If a collision occurs (probability $< 10^{-6}$), it immediately generates a fresh code.
4. **Relational Persistence**:
   - URL is inserted into PostgreSQL `urls` table: `(id, user_id, original_url, short_code, expires_at)`.
5. **Response**: Returns HTTP 201 with created record and full shortened URL (e.g., `https://novagk.dev/aB3x9Zq`).

---

### Flow 2: Read Path (Sub-Millisecond Redirection)
**Endpoint**: `GET /:shortCode` (Public, Rate Limited to 2,000 req / 15 min)

1. **Request Reception & Tracing**:
   - `requestIdMiddleware` attaches or generates `X-Request-ID`.
   - Client IP is resolved from `x-forwarded-for`, `x-real-ip`, or socket address.
2. **Cache-Aside Resolution**:
   - **Step 2A (Cache HIT)**: Check Redis key `url:<shortCode>`. If found, returns `{ originalUrl, urlId }` in **< 1-2 ms**.
   - **Step 2B (Cache MISS)**: Query PostgreSQL `SELECT * FROM urls WHERE short_code = $1`.
     - If not found $\rightarrow$ HTTP 404 (`Short URL not found`).
     - If found but `expires_at < NOW()` $\rightarrow$ HTTP 410 (`This short URL has expired`). Expired URLs are never cached.
     - If valid $\rightarrow$ Store in Redis with key `url:<shortCode>`, payload `JSON.stringify({ originalUrl, urlId })`, and **TTL = 86,400s (24 hours)**.
3. **Telemetry Extraction**:
   - `geoip-lite` maps IP address to ISO Country Code (e.g., `US`, `IN`, `GB`).
   - `ua-parser-js` parses User-Agent into `device` (`desktop`, `mobile`, `tablet`, `unknown`), `browser` (e.g., `Chrome`, `Safari`), and `operatingSystem` (e.g., `macOS`, `Windows`, `iOS`, `Android`).
   - HTTP Referrer is extracted from request headers.
4. **Asynchronous Fail-Open Kafka Emission**:
   - Construct `ClickEvent` object (with `clickId: crypto.randomUUID()`).
   - Call `publishClickEvent(event)`. Kafka message key = `event.clickId` (ensures even distribution across partitions).
   - **Fail-Open Contract**: If Kafka broker is down or times out, the error is caught, logged to console, and a metric counter increments. **The function does not throw**, ensuring the HTTP response is never aborted.
5. **Anti-Caching Headers & Redirection**:
   - Crucial anti-cache headers are set:
     ```http
     Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
     Pragma: no-cache
     Expires: 0
     ```
   - **Why?** If browsers cache an HTTP 301, subsequent clicks from the same user bypass the server entirely, causing lost click analytics.
   - If programmatic client (`direct=true`, `curl`, or non-HTML `Accept` header): **HTTP 301 Moved Permanently** directly to destination.
   - If browser client: Renders modern branded Bitly-style HTML countdown splash page that redirects after 5 seconds or immediately on click.

---

### Flow 3: Async Ingestion Path (Kafka to ClickHouse)
**Process**: `npm run worker` (`src/workers/clickConsumer.worker.ts`)

1. **Decoupled Architecture**:
   - Runs as a standalone Node.js process using KafkaJS consumer group `url-shortener-click-consumers`.
   - Can be scaled horizontally across multiple instances (each consuming specific Kafka topic partitions).
2. **Startup & Idempotency**:
   - `ensureTopicExists()` checks broker metadata; creates `url-click-events` topic if missing.
   - `initClickHouse()` runs `CREATE TABLE IF NOT EXISTS click_events` on ClickHouse Cloud.
3. **Message Consumption & Validation**:
   - For each message in `eachMessage({ topic, partition, message })`:
     - **Parse JSON**: Malformed JSON strings are rejected and skipped without crashing.
     - **Schema Validation via Zod**: `clickEventSchema.safeParse(rawData)`. Catches schema drift or bad data ("poison pills"). Skipped safely.
     - **Distributed Trace Propagation**: Extracts `x-request-id` from Kafka message headers.
4. **Retry Loop with Exponential Backoff**:
   - Consumer attempts to insert into ClickHouse with up to **3 retries** (`500ms * 2^(attempt-1)` backoff).
   - If ClickHouse suffers a transient network blip, the worker retries before advancing the Kafka offset.
5. **ClickHouse Ingestion**:
   - Formats event into `ClickHouseClickEventRow`.
   - Inserts row using `@clickhouse/client` with `format: 'JSONEachRow'`.
   - Client is configured with `async_insert: 1` and `wait_for_async_insert: 0` for server-side micro-batching.

---

### Flow 4: Analytics Query Path (OLAP Aggregations)
**Endpoints**: `/api/analytics/:shortCode/*` (Protected by JWT Auth & Ownership Verification)

1. **Ownership Verification**:
   - `getOwnedUrl(shortCode, userId)` verifies the URL exists in PostgreSQL and `url.user_id === authUser.id`. Users cannot view analytics for URLs they do not own (HTTP 403).
2. **Parameterized Dynamic SQL Construction**:
   - Builds parameterized SQL queries against ClickHouse `click_events` table using ClickHouse parameterized syntax (`{urlId: UUID}`, `{startDate: String}`).
   - **Zero SQL injection vulnerability**.
3. **Timezone-Aware Bucket Aggregations**:
   - Users can pass their local IANA timezone (e.g., `Asia/Kolkata`, `America/New_York`).
   - ClickHouse uses native functions:
     - `toStartOfDay(now(), 'Asia/Kolkata')` for clicks today.
     - `toStartOfHour(timestamp)` / `toStartOfDay(timestamp, '...')` for timeline graphs.
4. **Specialized Aggregation Queries**:
   - **Overview**: `count()`, `countIf(timestamp >= toStartOfDay(...))`, `countIf(timestamp >= now() - INTERVAL 7 DAY)`, `countIf(timestamp >= now() - INTERVAL 30 DAY)`.
   - **Time-series Timeline**: `SELECT formatDateTime(bucket, '%Y-%m-%dT%H:%i:%s.000Z'), count() GROUP BY bucket ORDER BY bucket ASC`.
   - **Device Breakdown**: `SELECT device, count() GROUP BY device ORDER BY count DESC`.
   - **Browser Breakdown**: `SELECT browser, count() GROUP BY browser ORDER BY count DESC`.
   - **OS Breakdown**: `SELECT operating_system, count() GROUP BY operating_system ORDER BY count DESC`.
   - **Referrers**: `SELECT ifNull(referrer, 'Direct / None'), count() GROUP BY referrer ORDER BY count DESC LIMIT 20`.
   - **Countries**: `SELECT ifNull(country, 'Unknown'), count() GROUP BY country ORDER BY count DESC LIMIT 50`.

---

## 6. Key Architectural Decisions & Trade-Offs

### 1. Why Base62 + Crypto Random Bytes instead of Auto-Increment ID or Hash?
* **Rejected Alternative 1: Auto-Increment Database ID (1, 2, 3...) converted to Base62**:
  - *Vulnerability*: Sequential IDs are predictable. Competitors or malicious actors can easily enumerate all URLs by iterating $1, 2, 3...$ (Insecure Direct Object Reference / Scraping attack).
  - *Bottleneck*: In a distributed system, generating auto-increment IDs requires centralized coordination (PostgreSQL sequence lock or distributed Snowflake ID generator).
* **Rejected Alternative 2: MD5 or SHA-256 Hash of original URL truncated to 7 chars**:
  - *Flaw*: If two different users shorten the same original URL, they get the exact same short code. User A could delete or modify User B's link.
* **Chosen Approach: Cryptographically Secure Random Bytes (`crypto.randomBytes(7)`)**:
  - Completely unpredictable (immune to scraping attacks).
  - Works statelessly in any distributed web server without cross-server coordination.
  - $62^7 \approx 3.52$ trillion combinations. Collision chance is astronomically low and handled cleanly by a 5-attempt retry loop.

---

### 2. Why Redis Cache-Aside for Redirection?
* **Latency SLA**: Redirection is on the user-critical path. PostgreSQL disk I/O or connection pooling adds 15–50ms. Redis in-memory lookup responds in **< 1-2 ms**.
* **Cache-Aside Pattern**:
  - Read: Check Redis $\rightarrow$ Miss $\rightarrow$ Read PostgreSQL $\rightarrow$ Populate Redis with 24h TTL.
  - Write: Insert into PostgreSQL. (Do not write to Redis immediately; lazy-load on first read).
  - Delete: Delete from PostgreSQL, and explicitly call `redis.del('url:' + shortCode)` to invalidate stale cache entries.
* **Degraded Fallback**: If Redis crashes or network drops, the service catches the Redis error, logs a warning, and falls back to PostgreSQL. The service degrades from 1ms to 20ms, but **maintains 100% uptime**.

---

### 3. Why Apache Kafka for Click Telemetry?
* **Why not write clicks directly into the database on redirect?**
  - If a shortened URL goes viral (e.g., posted on Twitter/Reddit with 50,000 clicks/sec), writing directly to a database causes connection pool exhaustion, write lock contention, and server crashes.
* **Why Kafka?**
  - **Decoupling**: The redirect HTTP handler pushes to Kafka and completes immediately.
  - **Backpressure Buffer**: Kafka buffers millions of events safely on disk during traffic spikes without overwhelming downstream consumers.
  - **Partitioning**: Messages partitioned by `clickId` allow horizontal scaling of consumer workers.
  - **Fail-Open Design**: Redirects succeed even during Kafka maintenance.

---

### 4. Why ClickHouse OLAP instead of PostgreSQL for Analytics?

| Feature | PostgreSQL (Row-Store OLTP) | ClickHouse (Column-Store OLAP) |
|---|---|---|
| **Data Organization** | Entire row stored together on disk. | Each column stored in separate, compressed files. |
| **Query Performance (Aggregations)** | Must read every row and every column from disk; slow at 1M+ rows. | Reads *only* the specific columns queried (`device`, `timestamp`). 100x–1000x faster. |
| **Compression Ratio** | Modest (~1.5x–2x). Similar data is separated by row. | Extreme (**5x–10x**). Similar column data is packed together. |
| **Vectorized Execution** | Processes one row at a time. | Processes data in SIMD vector chunks across CPU registers. |
| **Deduplication** | Unique constraints with costly B-tree index checks on every insert. | Background merge deduplication via `ReplacingMergeTree`. |

---

### 5. Why `ReplacingMergeTree(created_at)` in ClickHouse?
* Kafka provides **at-least-once delivery guarantees**. In edge cases (consumer network crash before offset commit), a click event could be delivered to ClickHouse twice.
* `ReplacingMergeTree(created_at)` with `ORDER BY (url_id, short_code, timestamp, click_id)` resolves this. During background partition merges, ClickHouse identifies rows with matching primary sort keys and retains only the latest record based on `created_at`.
* This gives the platform **eventual idempotency** with zero insert performance penalty.

---

### 6. Why `LowCardinality(String)` in ClickHouse Schema?
* Columns like `device` (`desktop`, `mobile`, `tablet`), `browser` (`Chrome`, `Firefox`, `Safari`), `operating_system`, and `short_code` have low cardinality (few unique strings repeated millions of times).
* `LowCardinality(String)` creates an internal dictionary of unique strings and replaces column entries with 8-bit or 16-bit integer indices.
* Result: **80–90% reduction in disk and memory footprint** and faster `GROUP BY` execution.

---

## 7. Database Schemas & Data Modeling

### 1. PostgreSQL Schema (Relational Metadata)

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(255) NOT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. URLs Table
CREATE TABLE urls (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_url  TEXT NOT NULL,
  short_code    VARCHAR(20) NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at    TIMESTAMPTZ
);

-- 3. Indexes
CREATE INDEX idx_urls_short_code ON urls (short_code);
CREATE INDEX idx_urls_user_id ON urls (user_id);
CREATE INDEX idx_users_email ON users (email);
```

### 2. ClickHouse Schema (OLAP Analytics)

```sql
CREATE TABLE IF NOT EXISTS click_events (
  click_id          UUID,
  url_id            UUID,
  short_code        LowCardinality(String),
  timestamp         DateTime64(3, 'UTC'),
  ip_address        Nullable(String),
  user_agent        Nullable(String),
  device            LowCardinality(String),
  browser           LowCardinality(String),
  operating_system  LowCardinality(String),
  referrer          Nullable(String),
  country           Nullable(String),
  created_at        DateTime64(3, 'UTC') DEFAULT now64(3)
)
ENGINE = ReplacingMergeTree(created_at)
ORDER BY (url_id, short_code, timestamp, click_id);
```

**Key Schema Details**:
* `DateTime64(3, 'UTC')`: Millisecond-level precision stored in UTC timezone.
* `ORDER BY (url_id, short_code, timestamp, click_id)`: Crucial sort order. ClickHouse stores physical data sorted by this tuple. Queries filtering by `url_id` and time range perform minimal disk seeks.

---

## 8. Failure Modes, Resilience & Production Hardening

During system design interviews, senior candidates stand out by explaining **what happens when things fail**. Here is how our architecture survives 5 critical failure scenarios:

### Scenario A: Redis Cache Outage / Unreachable
* **Behavior**: `cacheService.getUrl()` catches the connection error, records a `cache_miss` metric, and returns `null`.
* **Impact**: Transparent fallback to PostgreSQL. Redirection continues with zero dropped requests.
* **Latency**: Latency increases from ~1ms to ~20ms, but zero downtime.
* **Recovery**: When Redis comes back online, subsequent cache misses automatically re-populate the cache.

### Scenario B: Kafka Broker Outage / Network Partition
* **Behavior**: In `url.controller.ts`, `publishClickEvent()` detects the offline broker, skips message publishing, increments error metrics, and returns `false`.
* **Impact**: The redirect handler proceeds directly to Step 4 and returns **HTTP 301** to the client.
* **Guarantee**: **Fail-Open Architecture**. Redirects are never sacrificed for analytics. The platform never returns an HTTP 500 error due to broker issues.
* **Dual-Sink Redundancy**: In development, clicks are also written to PostgreSQL's `click_events` fallback table.

### Scenario C: ClickHouse Down or Experiencing High Ingestion Latency
* **Behavior**: The consumer worker's `processClickEvent()` throws an error when attempting to insert.
* **Handling**: The worker catches the error and triggers an exponential backoff retry loop (3 attempts: 500ms, 1000ms, 2000ms).
* **Buffer Guarantee**: If ClickHouse remains down, the worker does **not commit its Kafka offset**. Kafka acts as a durable, distributed buffer holding the unconsumed messages. Once ClickHouse recovers, the worker resumes exactly where it left off. **Zero click events are lost**.

### Scenario D: "Poison Pill" Malformed Message in Kafka
* **Behavior**: A malformed JSON string or invalid payload (e.g., missing `urlId` or invalid UUID) is pushed to the Kafka topic.
* **Handling**:
  1. `JSON.parse` is wrapped in a try/catch. Malformed JSON is logged and discarded.
  2. `clickEventSchema.safeParse()` runs. If the schema fails, validation issues are logged to structured error output, and the function returns early.
* **Result**: Consumer advances the offset past the bad message. The worker never enters a crash loop.

### Scenario E: Database Socket Disconnects / ECONNRESET
* **Behavior**: Cloud PostgreSQL databases (Neon, Aiven) close idle client connections after timeouts.
* **Handling**: In `database.ts`, `dbQuery()` wraps executions in a retry block. If an error matching `ECONNRESET` or `Connection terminated` occurs, it automatically discards the dead client and retries the query on a fresh connection from the pool.

---

## 9. Security, Rate Limiting & Observability

### Security Posture (Defense in Depth)
1. **URL Scheme Filtering**: Prevents XSS and SSRF by strictly requiring `http://` or `https://`. Rejects `javascript:`, `data:`, `vbscript:`, and `file:`.
2. **Helmet Security Headers**: Enables `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, and custom Content Security Policy (CSP).
3. **Hardened CORS Policy**:
   - Disallows wildcard origin (`*`) when credentials are enabled.
   - Strictly validates `Origin` header against configured whitelist (`FRONTEND_URL`, `console.novagk.dev`).
4. **Password Storage**: Passwords hashed with `bcrypt` (salt rounds configured via environment).
5. **Stateless JWT Authentication**: Tokens signed with HMAC-SHA256, verified via `auth.middleware.ts`. Payload contains only `{ id, email }`. Raw tokens are never logged.

### 3-Tier Rate Limiting (`express-rate-limit`)

| Tier | Route | Window | Max Requests | Purpose |
|---|---|---|---|---|
| **Tier 1: Auth** | `/api/auth/*` | 15 minutes | 20 reqs | Prevents brute-force password guessing & credential stuffing. |
| **Tier 2: API** | `/api/urls/*`, `/api/analytics/*` | 15 minutes | 200 reqs | Prevents database scraping & resource exhaustion. |
| **Tier 3: Redirect** | `/:shortCode` | 15 minutes | 2,000 reqs | High-throughput protection against DDoS attacks on redirection. |

### Observability & Telemetry
* **Distributed Tracing (`X-Request-ID`)**:
  - Automatically read from incoming `X-Request-ID` or generated via UUID.
  - Attached to Express response headers, logged in structured JSON logs, passed as Kafka message header, and stored in ClickHouse.
* **Kubernetes Health Probes**:
  - `GET /api/health/live`: Liveness probe. Returns process uptime and heap memory usage.
  - `GET /api/health/ready`: Readiness probe. Tests live connectivity to PostgreSQL, Upstash Redis, Aiven Kafka, and ClickHouse Cloud. Returns 200 if critical dependencies are healthy, 503 if degraded.
* **Telemetry Metrics Endpoint**:
  - `GET /api/metrics`: Exposes real-time internal metrics:
    - HTTP requests count by method and status code.
    - Redirect cache hit vs miss ratio.
    - Kafka produce success vs failure counts.
    - ClickHouse batch insert latencies.

---

## 10. Back-of-the-Envelope Capacity Calculations

Be ready to walk through these numbers on a whiteboard:

### 1. Traffic Assumptions
* **Read-to-Write Ratio**: URL shorteners are heavily read-intensive: **100:1** (or 1000:1).
* **Write Throughput**: 100 new URLs shortened per second.
  $$\text{New URLs / day} = 100 \times 86,400 \approx 8.64 \text{ Million / day}$$
  $$\text{New URLs / year} \approx 3.15 \text{ Billion / year}$$
* **Read Throughput (Redirections)**:
  $$\text{Read QPS} = 100 \times 100 = 10,000 \text{ redirects / sec}$$
  $$\text{Peak Read QPS (2x)} \approx 20,000 \text{ redirects / sec}$$

### 2. Storage Estimation (PostgreSQL Metadata)
* Average record size in `urls` table:
  - `id` (UUID): 16 bytes
  - `user_id` (UUID): 16 bytes
  - `original_url`: ~100 bytes
  - `short_code`: 7 bytes
  - `created_at`, `updated_at`, `expires_at`: 24 bytes
  - Indexes & Overhead: ~150 bytes
  - **Total per URL**: $\approx 300 \text{ bytes}$
* Storage per year:
  $$3.15 \text{ Billion} \times 300 \text{ bytes} \approx 945 \text{ GB / year} \quad (\approx 1 \text{ TB / year})$$
  *(Easily managed by managed PostgreSQL with read-replicas).*

### 3. Cache Estimation (Redis)
* Pareto Principle: 20% of short URLs generate 80% of click traffic.
* Caching top 20% of daily active URLs for 24 hours:
  $$\text{Daily URLs} = 8.64 \text{ Million}$$
  $$\text{Cache entries} = 8.64 \text{M} \times 0.20 \approx 1.73 \text{ Million URLs}$$
* Size per cache entry: `{ urlId: UUID, originalUrl: string }` $\approx 200 \text{ bytes}$.
  $$\text{Memory required} = 1.73 \text{M} \times 200 \text{ bytes} \approx 346 \text{ MB}$$
  *(Even allocating 5 GB of Redis covers several days of high-velocity active links).*

### 4. Clickstream Analytics Storage (ClickHouse)
* Clicks per day at 10,000 QPS:
  $$10,000 \times 86,400 = 864 \text{ Million clicks / day}$$
* Raw uncompressed event size $\approx 500 \text{ bytes}$.
* ClickHouse columnar compression with `LowCardinality` strings achieves **8x–10x compression**:
  $$\text{Compressed event size} \approx 50 \text{ bytes}$$
  $$\text{Storage per day} = 864 \text{M} \times 50 \text{ bytes} \approx 43.2 \text{ GB / day}$$
  *(ClickHouse handles hundreds of gigabytes per day with ease on standard cloud nodes).*

---

## 11. Frontend Architecture & UI Features

The frontend is a modern SPA built with **React 18, Vite, and TailwindCSS**:

* **Authentication & Protected Routing**:
  - `ProtectedRoute` component guards `/` (Dashboard) and `/analytics/:shortCode`.
  - Redirects unauthenticated users to `/login`.
  - Token stored securely; automatically attached via Axios interceptor.
* **Dashboard Page (`DashboardPage.tsx`)**:
  - URL Shortener creation card with optional custom expiration date.
  - Interactive URL list with copy-to-clipboard button and external destination preview.
  - Quick action to open granular analytics for any URL.
* **Analytics Page (`AnalyticsPage.tsx`)**:
  - **Metric Cards**: Total Clicks, Clicks Today, Last 7 Days, Last 30 Days.
  - **Date Range Selector**: Presets for Last 24 Hours, Last 7 Days, Last 30 Days, or Custom Date Picker with interval selection (`minute`, `hour`, `day`, `week`).
  - **Timeline Chart (`TimelineChart.tsx`)**: SVG/Canvas time-series line chart with hover tooltips.
  - **Device Breakdown (`DeviceChart.tsx`)**: Visual breakdown of Desktop vs. Mobile vs. Tablet traffic.
  - **Browser & OS Distribution (`BrowserChart.tsx`, `OSChart.tsx`)**: Breakdown of Chrome, Safari, Firefox, macOS, Windows, iOS, Android.
  - **Referrer Table (`ReferrerTable.tsx`)**: Top traffic sources (Google, Twitter, Direct, LinkedIn).
  - **Country Table (`CountryTable.tsx`)**: Top countries with click counts and percentages.

---

## 12. Top 25 Interview Questions & High-Impact Answers

### System Design & Architecture

#### Q1: "How do you ensure sub-millisecond redirection latency at scale?"
> **Answer**: *"We achieve sub-millisecond redirect latency by separating the critical read path from all slow disk operations. We use an in-memory Redis Cache-Aside layer keyed by `url:<shortCode>`. On a cache hit, the URL is resolved directly from memory without touching PostgreSQL. Furthermore, all telemetry logging and click tracking are completely asynchronous—the Express handler fires a message to an Apache Kafka topic and immediately issues an HTTP 301 without waiting for analytics databases. If Redis misses, the query hits an indexed PostgreSQL column (`short_code`) and populates Redis with a 24-hour TTL."*

#### Q2: "Why did you use Base62 instead of Base64 or standard hex for the short code?"
> **Answer**: *"Base62 uses `[A-Z, a-z, 0-9]`, which contains only alphanumeric characters. Base64 includes `+` and `/` (or `-` and `_` in URL-safe Base64), and hexadecimal is restricted to 16 characters (`0-9, a-f`). Base62 is ideal for URLs because it requires zero URL-encoding, does not trigger word breaks, and is easy for humans to read and type. With 7 characters, Base62 provides $62^7 \approx 3.52$ trillion combinations, compared to hex which would only yield $16^7 \approx 268$ million combinations for the same length."*

#### Q3: "What happens if two users simultaneously generate the same short code?"
> **Answer**: *"We handle collisions at two layers. In application logic, `generateShortCode()` generates cryptographically random Base62 strings and checks `shortCodeExists()` in a retry loop up to 5 times. At the database layer, PostgreSQL enforces a `UNIQUE` constraint on the `short_code` column. If a race condition occurred between two concurrent instances, the second insert would fail with a unique constraint violation (`23505`), which the application catches and retries gracefully."*

#### Q4: "Why HTTP 301 Moved Permanently instead of HTTP 302 Found?"
> **Answer**: *"HTTP 301 is semantically correct for permanent short links and provides the fastest client redirect experience. However, browsers aggressively cache HTTP 301 responses. To prevent browsers from bypassing our clickstream analytics on subsequent clicks, we explicitly attach strict anti-caching response headers: `Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate`. For browser clients wanting a preview, we also support an intermediate countdown splash page."*

#### Q5: "How does your system handle a massive spike in click traffic (e.g., a viral link)?"
> **Answer**: *"A viral link affects two layers: read resolution and click ingestion. For read resolution, Redis absorbs 99%+ of queries in memory; even under 50,000 QPS, Redis handles the workload via in-memory key lookups without hitting PostgreSQL. For click ingestion, rather than writing each click to a database, we emit events to Apache Kafka. Kafka easily buffers thousands of incoming events per second across partitioned logs. The consumer worker then pulls and ingests events into ClickHouse at a controlled, sustainable rate, completely shielding downstream databases from write spikes."*

#### Q6: "Why use ClickHouse instead of running analytical queries on PostgreSQL?"
> **Answer**: *"PostgreSQL is a row-oriented OLTP database designed for transactional integrity. When calculating aggregate metrics—such as total clicks over 30 days grouped by country and browser across 50 million clicks—PostgreSQL has to scan every full row off disk, exhausting I/O and RAM. ClickHouse is a columnar OLAP engine. It stores each column in separate compressed files and uses vectorized CPU execution. It only reads the specific columns queried, compressing data by 90% and executing aggregate queries over millions of records in milliseconds."*

#### Q7: "How do you guarantee that Kafka consumer failures don't crash the background worker?"
> **Answer**: *"Our consumer worker implements three lines of defense: First, incoming messages are parsed in a try/catch to drop invalid JSON. Second, parsed objects are validated against our Zod `clickEventSchema`. Any payload violating the schema (a 'poison pill') is logged and skipped rather than throwing an uncaught exception. Third, transient network errors when inserting to ClickHouse are handled via an exponential backoff retry loop (3 attempts). If all retries fail, the error is logged and the consumer pauses rather than dropping data silently."*

#### Q8: "How does ClickHouse handle duplicate events if Kafka delivers a message twice?"
> **Answer**: *"Kafka provides at-least-once delivery semantics, meaning network retries could produce duplicate records. We configured our ClickHouse table with the `ReplacingMergeTree(created_at)` engine and ordered by `(url_id, short_code, timestamp, click_id)`. During background part merges, ClickHouse identifies duplicate rows sharing the exact same sort keys and keeps only the latest record according to `created_at`. This provides storage-level idempotency without needing expensive unique indexes."*

#### Q9: "How do you protect your platform from malicious URLs (phishing, malware, XSS)?"
> **Answer**: *"First, we enforce schema-level protocol validation using Zod: the URL must start with `http://` or `https://`, rejecting dangerous schemes like `javascript:`, `data:`, `file:`, or `vbscript:`. Second, we implement 3-tier rate limiting to prevent automated spamming. In production, we can also integrate Google Safe Browsing API during the `createUrl` flow to check destination domains against known malware and phishing blacklists before storing."*

#### Q10: "How do you handle URL expiration?"
> **Answer**: *"The `urls` table has an optional `expires_at TIMESTAMPTZ` column. During resolution, if `url.expires_at < NOW()`, the service immediately aborts with an HTTP 410 Gone error. Crucially, expired URLs are **never written to Redis**, ensuring they are not cached. Additionally, a periodic cron job can purge expired records from PostgreSQL."*

---

### Backend & Databases

#### Q11: "Explain the Redis Cache-Aside pattern used here."
> **Answer**: *"Cache-Aside puts the application in charge of cache management. When a short code request arrives, the app queries Redis. If found (Cache HIT), it returns immediately. If missing (Cache MISS), the app queries PostgreSQL. If found in Postgres, the app asynchronously writes the record to Redis with an expiration TTL (24 hours) and returns the URL. When a user deletes a URL, our service deletes from PostgreSQL and explicitly removes the key from Redis (`redis.del`)."*

#### Q12: "Why do you use connection pooling for PostgreSQL?"
> **Answer**: *"Creating a new TCP connection and performing the TLS handshake for every incoming HTTP request adds 50–100ms of latency and exhausts database process limits. We use `pg.Pool` with `max: 20` connections. Connections remain open and are reused across requests. We also implemented error listeners and automatic query retries on `ECONNRESET` to handle cloud serverless database idle timeouts (like Neon/Aiven) without crashing requests."*

#### Q13: "What is `LowCardinality` in ClickHouse and why is it important here?"
> **Answer**: *"In ClickHouse, `LowCardinality(String)` applies dictionary encoding to string columns with relatively few unique values—like `device` (desktop/mobile/tablet), `browser`, `operating_system`, and `short_code`. Instead of storing the full string repeatedly for millions of rows, ClickHouse stores a numeric dictionary key (1 or 2 bytes). This reduces disk storage by 80–90%, saves memory bandwidth, and significantly speeds up `GROUP BY` aggregation queries."*

#### Q14: "How do you extract geolocation and user-agent without adding latency?"
> **Answer**: *"We perform parsing in-process using local memory-mapped databases rather than calling external HTTP APIs. For geolocation, we use `geoip-lite`, which does binary lookups in an in-memory MaxMind database in under 0.1ms. For User-Agent parsing, we use `ua-parser-js`, which runs fast regex matching in memory. Both operations execute synchronously in under 1ms."*

#### Q15: "How does JWT authentication work and where is it validated?"
> **Answer**: *"When a user logs in, we verify their bcrypt password hash against PostgreSQL. Upon success, we sign a stateless JWT containing the user's `id` and `email` with HMAC-SHA256, set to expire in 7 days. On protected endpoints (`/api/urls`, `/api/analytics`), the `authenticate` middleware extracts the `Bearer` token from the `Authorization` header, verifies the signature, and sets `req.user`. No database query is needed for authentication."*

---

### Event Streaming & Kafka

#### Q16: "What message key do you use in Kafka and why?"
> **Answer**: *"We use `event.clickId` (a UUIDv4) as the Kafka message key. In Kafka, the message key determines partition assignment via hashing: `hash(key) % num_partitions`. Using `clickId` guarantees a uniform, balanced distribution of events across all topic partitions, preventing partition hotspots."*

#### Q17: "What happens if the Kafka cluster is temporarily unreachable when a click occurs?"
> **Answer**: *"Our producer is designed to be **fail-open**. The function `publishClickEvent` wraps the send operation in a try/catch. If Kafka is unreachable or the connection times out, the error is logged, a degraded metric is recorded, and the function returns `false`. The redirect handler ignores this failure and proceeds to issue the HTTP 301 redirect. The user's experience is prioritized over analytics collection."*

#### Q18: "How would you scale the Kafka consumer if click traffic increased by 10x?"
> **Answer**: *"Kafka scales consumption horizontally through partitions. If our topic has 10 partitions, we can run up to 10 instances of our consumer worker within the same `KAFKA_GROUP_ID`. Kafka automatically assigns specific partitions to each worker instance. If traffic surges, we increase the partition count on the topic and spin up additional container instances of the worker."*

#### Q19: "Why run the Kafka consumer as a standalone worker instead of inside the Express API?"
> **Answer**: *"Running the consumer inside the API server couples HTTP request serving with batch stream processing. A memory spike or CPU-intensive batch insert to ClickHouse could starve the Node.js event loop, causing HTTP timeouts and degraded redirect latency. Running a dedicated worker process (`clickConsumer.worker.ts`) isolates CPU/memory resources and allows independent autoscaling."*

#### Q20: "What is `async_insert` in ClickHouse?"
> **Answer**: *"By default, ClickHouse expects large batches of 10,000+ rows per insert; sending individual single-row inserts creates too many small data parts on disk. With `async_insert: 1` and `wait_for_async_insert: 0`, ClickHouse buffers incoming inserts on the server side and commits them in optimal micro-batches every 200ms or 100,000 rows. This allows our worker to stream events smoothly without complex client-side buffering logic."*

---

### Observability, Testing & System Resilience

#### Q21: "How do you achieve end-to-end distributed tracing across microservices?"
> **Answer**: *"We propagate a unique `X-Request-ID`. When a redirect request arrives, Express reads the header or generates a UUID. This ID is attached to the HTTP response, logged in structured Pino/console logs, injected into the Kafka message headers, and extracted by the background worker when writing to ClickHouse. If a click fails or goes missing, we can trace the exact event lifecycle across the API, Kafka broker, worker, and ClickHouse using a single ID."*

#### Q22: "Explain the difference between your `/api/health/live` and `/api/health/ready` endpoints."
> **Answer**: *"They follow Kubernetes probe patterns:
> - `/api/health/live` is a liveness probe that verifies whether the Node.js process is responsive and returns memory stats. If it fails, the orchestrator restarts the container.
> - `/api/health/ready` is a readiness probe that actively tests downstream connectivity to PostgreSQL, Redis, Kafka, and ClickHouse. If PostgreSQL is down, it returns 503 so traffic routers stop sending requests until the database recovers."*

#### Q23: "How do you test system resilience under failure conditions?"
> **Answer**: *"We have an automated resilience test suite (`phase7_resilience.ts`). It boots a test instance of the application and programmatically simulates failures:
> 1. We mock Redis failure and assert that redirects transparently fall back to PostgreSQL with HTTP 301.
> 2. We mock Kafka broker outages and assert that redirects still return 301 without throwing 500 errors.
> 3. We inject unparseable JSON and schema-violating poison pills into the Kafka consumer and verify the worker skips them without crashing.
> 4. We simulate ClickHouse timeouts and verify the worker retries with exponential backoff."*

#### Q24: "How do you prevent CORS and CSRF attacks on your APIs?"
> **Answer**: *"For CORS, we disallow wildcard `*` with credentials and validate the `Origin` header against an explicit list of trusted frontend domains (`console.novagk.dev`). For CSRF, our authentication is stateless and uses Bearer tokens stored in client memory/headers rather than ambient browser cookies. Since browsers do not attach custom Authorization headers automatically on cross-site requests, CSRF attacks are fundamentally mitigated."*

#### Q25: "If you had another month to work on this platform, what would you add next?"
> **Answer**: *"I would focus on three major enhancements:
> 1. **Custom Branded Domains**: Allow enterprise users to map their own domains (e.g., `link.company.com`) via CNAME with automated SSL provisioning using Caddy or AWS ACM.
> 2. **Multi-Region Geodistributed Edge Redirects**: Deploy the redirect engine to Cloudflare Workers or Fly.io edge nodes with Upstash Global Redis replication for sub-10ms redirection worldwide.
> 3. **ClickHouse AggregatingMergeTrees**: Pre-aggregate click metrics into hourly and daily summary tables using ClickHouse Materialized Views, further accelerating dashboard queries over billions of rows."*

---

## 🏁 Summary Checklist Before Your Interview

- [ ] Can you draw the ASCII architecture diagram from memory?
- [ ] Can you explain why **Base62 ($62^7$)** was chosen over sequential IDs and MD5?
- [ ] Can you explain the **Fail-Open** redirect design?
- [ ] Can you explain why **ClickHouse** outperforms PostgreSQL for analytics?
- [ ] Do you know what **`ReplacingMergeTree`** does with duplicate Kafka events?
- [ ] Can you explain why **anti-caching headers** are placed on HTTP 301 redirects?
- [ ] Can you walk through the **back-of-the-envelope capacity numbers**?
- [ ] Can you describe the **resilience test suite** and how it validates failure scenarios?

*Good luck with your interview! You've got this.* 🚀
