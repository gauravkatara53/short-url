# ── Stage 1: Build JAR using Maven Wrapper ─────────────────────
FROM eclipse-temurin:21-jdk-alpine AS builder
WORKDIR /app

# Cache Maven dependencies by copying pom and wrapper first
COPY .mvn/ .mvn/
COPY mvnw pom.xml ./
RUN chmod +x ./mvnw
RUN ./mvnw dependency:go-offline -B

# Copy source code and build
COPY src ./src
RUN ./mvnw clean package -DskipTests

# ── Stage 2: Lightweight Production Runtime ───────────────────
FROM eclipse-temurin:21-jre-alpine
WORKDIR /app

# Security: run as non-root user
RUN addgroup -S spring && adduser -S spring -G spring
USER spring:spring

COPY --from=builder /app/target/url-shortener-1.0.0.jar app.jar

# Render injects PORT (default 10000), Spring Boot reads ${PORT:3000}
ENV PORT=10000
EXPOSE 10000

ENTRYPOINT ["java", "-XX:+UseContainerSupport", "-XX:MaxRAMPercentage=75.0", "-Dserver.port=${PORT}", "-jar", "app.jar"]
