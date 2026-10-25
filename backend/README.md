# ClickStream — Spring Boot Backend

Complete, production-grade migration of the Node.js / Express backend to **Java 21 + Spring Boot 3.4.4**, preserving 100% of the API contracts, response payloads, database models, and integrations with Zero frontend changes.

---

## 🏛 Layered Architecture

```
dev.novagk.urlshortener/
├── UrlShortenerApplication.java     # Application entrypoint with auto .env loader
├── config/
│   ├── DataSourceConfig.java         # Neon PostgreSQL JDBC conversion & Hikari pool
│   ├── JacksonConfig.java            # Snake_case / ISO-8601 formatting & JavaTimeModule
│   ├── KafkaConfig.java              # Aiven Apache Kafka producer & consumer setup
│   ├── RateLimitFilter.java          # Sliding-window IP rate limiting (auth, api, redirect)
│   ├── RequestIdFilter.java          # X-Request-ID extraction & propagation filter
│   └── SecurityConfig.java           # Stateless JWT authentication & CORS configuration
├── controller/
│   ├── AuthController.java           # POST /api/auth/register, POST /api/auth/login
│   ├── UrlController.java            # POST, GET, DELETE /api/urls
│   ├── RedirectController.java       # GET /{shortCode} (301 redirect or 5s splash screen)
│   ├── AnalyticsController.java      # GET /api/analytics/{shortCode}/*
│   └── HealthController.java         # /api/health, /api/health/live, /api/health/ready, /api/metrics
├── dto/
│   ├── ApiResponse.java              # Standard { success, data, message, error } envelope
│   ├── RegisterRequest.java          # Validation for registration
│   ├── LoginRequest.java             # Validation for login
│   ├── CreateUrlRequest.java         # Validation for short URL creation
│   ├── SafeUserDto.java              # Sanitised user payload (no password hash)
│   ├── UrlDto.java                   # Short URL representation
│   └── ClickEventDto.java            # Kafka event schema
├── entity/
│   ├── UserEntity.java               # JPA Entity -> users table
│   ├── UrlEntity.java                # JPA Entity -> urls table
│   └── ClickEventEntity.java         # JPA Entity -> click_events table
├── exception/
│   ├── AppException.java             # Custom application exception with HttpStatus
│   └── GlobalExceptionHandler.java   # Centralised @RestControllerAdvice
├── repository/
│   ├── UserRepository.java           # Spring Data JPA repository for users
│   ├── UrlRepository.java            # Spring Data JPA repository for urls
│   └── ClickEventRepository.java     # Spring Data JPA repository for click events
├── service/
│   ├── AuthService.java              # Registration, BCrypt hashing, JWT issuance
│   ├── CacheService.java             # Upstash Redis REST cache (cache-aside)
│   ├── ClickEventService.java        # UA parsing, GeoIP resolution, Kafka producer, dual-sink PG
│   ├── ClickHouseService.java        # ClickHouse Cloud OLAP analytics queries
│   ├── KafkaConsumerService.java     # Kafka listener -> ClickHouse ingestion
│   └── UrlService.java               # Collision retry, short code resolution, ownership checks
├── util/
│   ├── JwtUtil.java                  # HS256 JWT signing and validation
│   ├── ShortCodeGenerator.java       # Cryptographically secure Base62 short code generator
│   └── TelemetryMetrics.java         # In-memory HTTP, redirect, cache, and Kafka metrics
└── view/
    └── RedirectSplashView.java       # Bitly-style modern 5-second countdown splash screen
```

---

## 🚀 Getting Started

### Prerequisites
- **Java 21** (`temurin-21` or compatible OpenJDK 21)
- Maven 3.9+ (or use the included `./mvnw`)

### Running Locally

```bash
# 1. Navigate to the backend-spring directory
cd backend-spring

# 2. Ensure your .env file is present (copied from ../backend/.env)
cp ../backend/.env .env

# 3. Run with Maven wrapper (specify JAVA_HOME if default is not Java 21)
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home ./mvnw spring-boot:run
```

The server starts on port `3000` (or the port specified in `PORT` in your `.env`).

### Running Tests

```bash
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home ./mvnw test
```

### Building Production JAR

```bash
JAVA_HOME=/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home ./mvnw clean package -DskipTests
java -jar target/url-shortener-1.0.0.jar
```

---

## 📡 Endpoints Specification

| Method | Endpoint | Description | Auth Required |
|---|---|---|:---:|
| `POST` | `/api/auth/register` | Register new user | No |
| `POST` | `/api/auth/login` | Login user and issue JWT | No |
| `POST` | `/api/urls` | Create short URL | Yes (Bearer) |
| `GET` | `/api/urls` | Get paginated URLs for user | Yes (Bearer) |
| `DELETE` | `/api/urls/{id}` | Delete short URL (ownership verified) | Yes (Bearer) |
| `GET` | `/{shortCode}` | Public short URL redirect (or splash page) | No |
| `GET` | `/api/analytics/{shortCode}/overview` | High-level metrics | Yes (Bearer) |
| `GET` | `/api/analytics/{shortCode}/timeline` | Time-series click data | Yes (Bearer) |
| `GET` | `/api/analytics/{shortCode}/devices` | Device breakdown | Yes (Bearer) |
| `GET` | `/api/analytics/{shortCode}/browsers` | Browser breakdown | Yes (Bearer) |
| `GET` | `/api/analytics/{shortCode}/os` | Operating system breakdown | Yes (Bearer) |
| `GET` | `/api/analytics/{shortCode}/referrers` | Referrer breakdown | Yes (Bearer) |
| `GET` | `/api/analytics/{shortCode}/countries` | Geographic country breakdown | Yes (Bearer) |
| `GET` | `/api/health` | General health check | No |
| `GET` | `/api/health/live` | Liveness probe | No |
| `GET` | `/api/health/ready` | Readiness probe (PG, Redis, Kafka, ClickHouse) | No |
| `GET` | `/api/metrics` | Telemetry metrics snapshot | No |
