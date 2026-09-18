# Distributed URL Shortener & Clickstream Analytics Platform

A production-grade, distributed URL shortener and real-time clickstream analytics platform designed for high write throughput, sub-millisecond redirection latency, and analytical querying.

---

## ⚡ Key Highlights & Architecture

- **High-Speed Cache Layer**: Redis (Upstash) caches active short URLs for lightning-fast sub-millisecond redirects.
- **Relational Metadata**: PostgreSQL (Neon) stores user accounts, URLs, and authentication credentials.
- **Asynchronous Event Streaming**: High-throughput URL clicks are published to **Aiven for Apache Kafka** via a fail-open architecture (redirects never fail even during broker downtime).
- **Columnar Analytics**: Kafka consumers ingest events in real-time into **ClickHouse Cloud** for instant aggregate queries across millions of click records.
- **Dedicated Background Worker**: Decoupled consumer worker processes clickstream events, validates schemas with Zod, and streams batches to ClickHouse.
- **Modern Dashboard UI**: Interactive React + Vite frontend with TailwindCSS, dynamic click graphs, device/browser distribution, and URL management.

```text
                                  User Request
                                       │
                                       ▼
                             GET /:shortCode (API)
                                       │
                         ┌─────────────┴─────────────┐
                         ▼                           ▼
                   Redis Cache                  PostgreSQL
                    (Cache HIT)                 (Cache MISS)
                         │                           │
                         └─────────────┬─────────────┘
                                       │
                                 URL Resolved
                                       │
                                       ▼
                              Publish ClickEvent
                                       │
                      ┌────────────────┴────────────────┐
                      │                                 │
                 (Success)                          (Failure)
                      │                                 │
                      ▼                                 ▼
            Aiven for Apache Kafka             Structured Log & Skip
            Topic: url-click-events          (Fail-Open: No 500 Error)
                      │                                 │
                      └────────────────┬────────────────┘
                                       │
                                       ▼
                               HTTP 301 Redirect
                                       │
                      ═════════════════╪═════════════════ (Async Boundary)
                                       │
                                       ▼
                             Kafka Consumer Worker
                                       │
                                       ▼
                          Zod Validation & Processing
                                       │
                                       ▼
                               ClickHouse Cloud
                        (Real-Time Columnar Analytics)
```

---

## 📁 Repository Structure

```text
.
├── backend/                  # Node.js + Express + TypeScript API & Consumer Worker
│   ├── src/
│   │   ├── config/           # Database, Redis, Kafka, & ClickHouse configurations
│   │   ├── controllers/      # Auth, URL, and Analytics controllers
│   │   ├── middleware/       # JWT auth, rate limiting, and error handlers
│   │   ├── routes/           # REST API routes
│   │   ├── services/         # Business logic (URL hashing, Kafka producer, analytics)
│   │   └── workers/          # Standalone Kafka click consumer worker
│   ├── test/                 # End-to-end integration and resilience test suites
│   ├── .env.example          # Sample environment variables template
│   └── package.json
└── frontend/                 # React 18 + Vite + TailwindCSS Web Application
    ├── src/
    │   ├── components/       # UI components (URL shortener form, analytics charts, metrics)
    │   ├── pages/            # Dashboard, Login, Register, Splash redirect
    │   └── services/         # Axios API client & backend integrations
    ├── index.html
    └── package.json
```

---

## 🚀 Quick Start

### 1. Backend Setup

```bash
cd backend
npm install

# Configure your environment variables
cp .env.example .env
# Edit .env with your Neon PostgreSQL, Upstash Redis, Aiven Kafka, and ClickHouse credentials

# Start the API server in development mode
npm run dev

# Start the background Kafka click consumer in another terminal
npm run worker
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The application will be running at:
- **Frontend Dashboard**: `http://localhost:5173`
- **Backend API**: `http://localhost:3000`

---

## 🧪 Testing & Verification

Comprehensive test suites verify end-to-end functionality, security, rate limiting, and service resilience:

```bash
cd backend

# Run comprehensive verification suite
npm test

# Run resilience tests (simulating database / broker downtime)
npm run test:resilience
```

---

## 🔒 Security Best Practices

- All secrets and credentials strictly loaded via environment variables (`.env`).
- Passwords salted and hashed with `bcrypt`.
- Statless session management with JWT.
- Protection against common vulnerabilities via `helmet` and `express-rate-limit`.
