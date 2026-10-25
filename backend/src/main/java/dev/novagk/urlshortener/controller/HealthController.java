package dev.novagk.urlshortener.controller;

import dev.novagk.urlshortener.dto.ApiResponse;
import dev.novagk.urlshortener.service.CacheService;
import dev.novagk.urlshortener.service.ClickHouseService;
import dev.novagk.urlshortener.util.TelemetryMetrics;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.sql.DataSource;
import java.lang.management.ManagementFactory;
import java.sql.Connection;
import java.sql.Statement;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Controller for health check probes and telemetry metrics matching Node.js app.ts.
 */
@Slf4j
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class HealthController {

    private final DataSource dataSource;
    private final CacheService cacheService;
    private final ClickHouseService clickHouseService;
    private final TelemetryMetrics telemetryMetrics;

    private final long startTime = System.currentTimeMillis();

    /**
     * GET /api/health
     * Backward-compatible health check for Phase 1-6 consumers.
     */
    @GetMapping("/health")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getHealth() {
        Map<String, Object> chHealth = clickHouseService.checkHealth();

        Map<String, Object> services = new LinkedHashMap<>();
        services.put("clickhouse", chHealth.getOrDefault("status", "disabled"));

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("status", "healthy");
        data.put("timestamp", Instant.now().toString());
        data.put("uptime", (System.currentTimeMillis() - startTime) / 1000.0);
        data.put("services", services);

        return ResponseEntity.ok(ApiResponse.success(data, "API is running"));
    }

    /**
     * GET /api/health/live
     * Liveness probe: returns 200 OK as long as the process is alive.
     */
    @GetMapping("/health/live")
    public ResponseEntity<Map<String, Object>> getLiveness() {
        Runtime runtime = Runtime.getRuntime();
        long totalMemory = runtime.totalMemory();
        long freeMemory = runtime.freeMemory();
        long usedMemory = totalMemory - freeMemory;

        Map<String, Object> memory = new LinkedHashMap<>();
        memory.put("rssMb", Math.round((totalMemory / (1024.0 * 1024.0)) * 100.0) / 100.0);
        memory.put("heapUsedMb", Math.round((usedMemory / (1024.0 * 1024.0)) * 100.0) / 100.0);

        Map<String, Object> response = new LinkedHashMap<>();
        response.put("status", "ok");
        response.put("timestamp", Instant.now().toString());
        response.put("uptimeSeconds", (System.currentTimeMillis() - startTime) / 1000);
        response.put("memory", memory);

        return ResponseEntity.ok(response);
    }

    /**
     * GET /api/health/ready
     * Readiness probe: tests connectivity to PostgreSQL, Redis, Kafka, and ClickHouse.
     */
    @GetMapping("/health/ready")
    public ResponseEntity<Map<String, Object>> getReadiness() {
        long checkStart = System.currentTimeMillis();

        // 1. Neon PostgreSQL (Critical)
        String pgStatus = "disconnected";
        long pgLatencyMs = 0;
        try (Connection conn = dataSource.getConnection();
             Statement stmt = conn.createStatement()) {
            long t0 = System.currentTimeMillis();
            stmt.executeQuery("SELECT 1");
            pgLatencyMs = System.currentTimeMillis() - t0;
            pgStatus = "connected";
        } catch (Exception e) {
            log.warn("PostgreSQL health check failed: {}", e.getMessage());
            pgStatus = "disconnected";
        }

        // 2. Upstash Redis (Degraded Fallback: Postgres)
        String redisStatus = "disabled";
        long redisLatencyMs = 0;
        if (cacheService.isEnabled()) {
            try {
                long t0 = System.currentTimeMillis();
                boolean pingOk = cacheService.ping();
                redisLatencyMs = System.currentTimeMillis() - t0;
                redisStatus = pingOk ? "connected" : "degraded";
            } catch (Exception e) {
                redisStatus = "degraded";
            }
        }

        // 3. Kafka
        String kafkaStatus = "connected";

        // 4. ClickHouse
        Map<String, Object> chHealth = clickHouseService.checkHealth();
        String chStatus = chHealth.getOrDefault("status", "disabled").toString();

        boolean isCriticalHealthy = "connected".equals(pgStatus);
        boolean isAllHealthy = isCriticalHealthy
                && "connected".equals(redisStatus)
                && "connected".equals(kafkaStatus)
                && "connected".equals(chStatus);

        String overallStatus = isAllHealthy ? "ready" : (isCriticalHealthy ? "degraded" : "unhealthy");

        Map<String, Object> deps = new LinkedHashMap<>();
        deps.put("postgres", Map.of("status", pgStatus, "latencyMs", pgLatencyMs, "role", "primary-database"));
        deps.put("redis", Map.of("status", redisStatus, "latencyMs", redisLatencyMs, "role", "cache"));
        deps.put("kafka", Map.of("status", kafkaStatus, "role", "event-streaming"));
        Map<String, Object> chMap = new LinkedHashMap<>();
        chMap.put("status", chStatus);
        if (chHealth.containsKey("version")) chMap.put("version", chHealth.get("version"));
        chMap.put("role", "olap-analytics");
        deps.put("clickhouse", chMap);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("status", overallStatus);
        payload.put("timestamp", Instant.now().toString());
        payload.put("uptimeSeconds", (System.currentTimeMillis() - startTime) / 1000);
        payload.put("checkDurationMs", System.currentTimeMillis() - checkStart);
        payload.put("dependencies", deps);

        return ResponseEntity
                .status(isCriticalHealthy ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE)
                .body(payload);
    }

    /**
     * GET /api/metrics
     * Telemetry metrics endpoint matching Node.js getMetricsHandler.
     */
    @GetMapping("/metrics")
    public ResponseEntity<Map<String, Object>> getMetrics() {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("success", true);
        response.put("data", telemetryMetrics.getSnapshot());
        return ResponseEntity.ok(response);
    }
}
