package dev.novagk.urlshortener.util;

import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * In-memory telemetry metrics tracker matching the Node.js metrics.ts.
 */
@Component
public class TelemetryMetrics {

    private final long startedAt = System.currentTimeMillis();

    private final AtomicLong totalRequests = new AtomicLong();
    private final AtomicLong status2xx = new AtomicLong();
    private final AtomicLong status3xx = new AtomicLong();
    private final AtomicLong status4xx = new AtomicLong();
    private final AtomicLong status5xx = new AtomicLong();
    private final Map<String, AtomicLong> byRoute = new ConcurrentHashMap<>();

    private final AtomicLong redirectsTotal = new AtomicLong();
    private final AtomicLong cacheHits = new AtomicLong();
    private final AtomicLong cacheMisses = new AtomicLong();
    private final AtomicLong notFound = new AtomicLong();
    private final AtomicLong expired = new AtomicLong();

    private final AtomicLong cacheHitsOp = new AtomicLong();
    private final AtomicLong cacheMissesOp = new AtomicLong();
    private final AtomicLong cacheSets = new AtomicLong();
    private final AtomicLong cacheDeletes = new AtomicLong();

    private final AtomicLong producesSuccess = new AtomicLong();
    private final AtomicLong producesFailed = new AtomicLong();
    private final AtomicLong consumesSuccess = new AtomicLong();
    private final AtomicLong consumesFailed = new AtomicLong();

    private final AtomicLong insertsSuccess = new AtomicLong();
    private final AtomicLong insertsFailed = new AtomicLong();

    public void recordHttpRequest(String method, String route, int statusCode) {
        totalRequests.incrementAndGet();
        if (statusCode >= 200 && statusCode < 300) status2xx.incrementAndGet();
        else if (statusCode >= 300 && statusCode < 400) status3xx.incrementAndGet();
        else if (statusCode >= 400 && statusCode < 500) status4xx.incrementAndGet();
        else if (statusCode >= 500) status5xx.incrementAndGet();

        String key = method + " " + route;
        byRoute.computeIfAbsent(key, k -> new AtomicLong()).incrementAndGet();
    }

    public void recordRedirect(String result) {
        redirectsTotal.incrementAndGet();
        switch (result) {
            case "cache_hit" -> cacheHits.incrementAndGet();
            case "cache_miss" -> cacheMisses.incrementAndGet();
            case "not_found" -> notFound.incrementAndGet();
            case "expired" -> expired.incrementAndGet();
        }
    }

    public void recordCache(String op) {
        switch (op) {
            case "hit" -> cacheHitsOp.incrementAndGet();
            case "miss" -> cacheMissesOp.incrementAndGet();
            case "set" -> cacheSets.incrementAndGet();
            case "del" -> cacheDeletes.incrementAndGet();
        }
    }

    public void recordKafkaProduce(boolean success) {
        if (success) producesSuccess.incrementAndGet();
        else producesFailed.incrementAndGet();
    }

    public void recordKafkaConsume(boolean success) {
        if (success) consumesSuccess.incrementAndGet();
        else consumesFailed.incrementAndGet();
    }

    public void recordClickHouseInsert(boolean success, int count) {
        if (success) insertsSuccess.addAndGet(count);
        else insertsFailed.addAndGet(count);
    }

    public Map<String, Object> getSnapshot() {
        Runtime runtime = Runtime.getRuntime();
        long totalMemory = runtime.totalMemory();
        long freeMemory = runtime.freeMemory();
        long usedMemory = totalMemory - freeMemory;

        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("timestamp", Instant.now().toString());
        snapshot.put("uptimeSeconds", (System.currentTimeMillis() - startedAt) / 1000);

        Map<String, Object> memory = new LinkedHashMap<>();
        memory.put("rssMb", Math.round((totalMemory / (1024.0 * 1024.0)) * 100.0) / 100.0);
        memory.put("heapUsedMb", Math.round((usedMemory / (1024.0 * 1024.0)) * 100.0) / 100.0);
        memory.put("heapTotalMb", Math.round((totalMemory / (1024.0 * 1024.0)) * 100.0) / 100.0);
        snapshot.put("memory", memory);

        Map<String, Object> http = new LinkedHashMap<>();
        http.put("totalRequests", totalRequests.get());
        http.put("status2xx", status2xx.get());
        http.put("status3xx", status3xx.get());
        http.put("status4xx", status4xx.get());
        http.put("status5xx", status5xx.get());
        Map<String, Long> routeCounts = new LinkedHashMap<>();
        byRoute.forEach((k, v) -> routeCounts.put(k, v.get()));
        http.put("byRoute", routeCounts);
        snapshot.put("http", http);

        Map<String, Object> redirects = new LinkedHashMap<>();
        redirects.put("total", redirectsTotal.get());
        redirects.put("cacheHits", cacheHits.get());
        redirects.put("cacheMisses", cacheMisses.get());
        redirects.put("notFound", notFound.get());
        redirects.put("expired", expired.get());
        snapshot.put("redirects", redirects);

        Map<String, Object> cache = new LinkedHashMap<>();
        cache.put("hits", cacheHitsOp.get());
        cache.put("misses", cacheMissesOp.get());
        cache.put("sets", cacheSets.get());
        cache.put("deletes", cacheDeletes.get());
        snapshot.put("cache", cache);

        Map<String, Object> kafka = new LinkedHashMap<>();
        kafka.put("producesSuccess", producesSuccess.get());
        kafka.put("producesFailed", producesFailed.get());
        kafka.put("consumesSuccess", consumesSuccess.get());
        kafka.put("consumesFailed", consumesFailed.get());
        snapshot.put("kafka", kafka);

        Map<String, Object> ch = new LinkedHashMap<>();
        ch.put("insertsSuccess", insertsSuccess.get());
        ch.put("insertsFailed", insertsFailed.get());
        snapshot.put("clickhouse", ch);

        return snapshot;
    }
}
