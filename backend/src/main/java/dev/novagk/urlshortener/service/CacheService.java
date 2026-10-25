package dev.novagk.urlshortener.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import okhttp3.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.concurrent.TimeUnit;

/**
 * Upstash Redis REST cache service matching the Node.js cache.service.ts.
 * Uses OkHttp to interact with Upstash Redis REST API.
 */
@Slf4j
@Service
public class CacheService {

    private final OkHttpClient httpClient;
    private final ObjectMapper objectMapper;
    private final String restUrl;
    private final String restToken;
    private final int urlTtl;
    private final boolean enabled;

    private static final String URL_PREFIX = "url:";

    public CacheService(
            @Value("${app.upstash.redis.rest-url:}") String restUrl,
            @Value("${app.upstash.redis.rest-token:}") String restToken,
            @Value("${app.redis.url-ttl:86400}") int urlTtl) {
        this.restUrl = restUrl != null ? restUrl.replaceAll("/$", "") : "";
        this.restToken = restToken != null ? restToken : "";
        this.urlTtl = urlTtl;
        this.objectMapper = new ObjectMapper();
        this.httpClient = new OkHttpClient.Builder()
                .connectTimeout(5, TimeUnit.SECONDS)
                .readTimeout(5, TimeUnit.SECONDS)
                .build();
        this.enabled = !this.restUrl.isBlank() && !this.restToken.isBlank()
                && this.restUrl.startsWith("https://");

        if (this.enabled) {
            log.info("✅ Upstash Redis cache enabled");
        } else {
            log.warn("⚠️ Upstash Redis credentials not configured. Caching is disabled.");
        }
    }

    /**
     * Get cached URL data by short code.
     */
    public CachedUrl getUrl(String shortCode) {
        if (!enabled) return null;

        String key = URL_PREFIX + shortCode;
        try {
            String url = restUrl + "/get/" + key;
            Request request = new Request.Builder()
                    .url(url)
                    .addHeader("Authorization", "Bearer " + restToken)
                    .get()
                    .build();

            try (Response response = httpClient.newCall(request).execute()) {
                if (response.isSuccessful() && response.body() != null) {
                    String body = response.body().string();
                    Map<String, Object> result = objectMapper.readValue(body, Map.class);
                    Object value = result.get("result");

                    if (value == null) return null;

                    String valueStr = value.toString();
                    if (valueStr.isBlank() || "null".equals(valueStr)) return null;

                    // Try to parse as JSON object
                    try {
                        Map<String, Object> parsed = objectMapper.readValue(valueStr, Map.class);
                        String originalUrl = (String) parsed.get("originalUrl");
                        String urlId = (String) parsed.get("urlId");
                        if (originalUrl != null && urlId != null) {
                            return new CachedUrl(originalUrl, urlId);
                        }
                    } catch (Exception e) {
                        log.debug("Cache value not JSON for key '{}', treating as miss", key);
                    }
                }
            }
        } catch (Exception e) {
            log.warn("Redis GET error for '{}': {}", key, e.getMessage());
        }
        return null;
    }

    /**
     * Cache URL data with TTL.
     */
    public void setUrl(String shortCode, CachedUrl data) {
        if (!enabled) return;

        String key = URL_PREFIX + shortCode;
        try {
            String jsonValue = objectMapper.writeValueAsString(
                    Map.of("originalUrl", data.originalUrl(), "urlId", data.urlId()));

            // Use Upstash REST pipeline: SET key value EX ttl
            String url = restUrl + "/pipeline";
            String pipelineBody = objectMapper.writeValueAsString(
                    new Object[][]{{"SET", key, jsonValue, "EX", String.valueOf(urlTtl)}});

            Request request = new Request.Builder()
                    .url(url)
                    .addHeader("Authorization", "Bearer " + restToken)
                    .post(RequestBody.create(pipelineBody, MediaType.parse("application/json")))
                    .build();

            try (Response response = httpClient.newCall(request).execute()) {
                if (response.isSuccessful()) {
                    log.debug("Redis SET for '{}' succeeded", key);
                }
            }
        } catch (Exception e) {
            log.warn("Redis SET error for '{}': {}", key, e.getMessage());
        }
    }

    /**
     * Delete cached URL by short code.
     */
    public void deleteUrl(String shortCode) {
        if (!enabled) return;

        String key = URL_PREFIX + shortCode;
        try {
            String url = restUrl + "/del/" + key;
            Request request = new Request.Builder()
                    .url(url)
                    .addHeader("Authorization", "Bearer " + restToken)
                    .get()
                    .build();

            try (Response response = httpClient.newCall(request).execute()) {
                if (response.isSuccessful()) {
                    log.debug("Redis DEL for '{}' succeeded", key);
                }
            }
        } catch (Exception e) {
            log.warn("Redis DEL error for '{}': {}", key, e.getMessage());
        }
    }

    /**
     * Ping Upstash Redis for health check.
     */
    public boolean ping() {
        if (!enabled) return false;

        try {
            String url = restUrl + "/ping";
            Request request = new Request.Builder()
                    .url(url)
                    .addHeader("Authorization", "Bearer " + restToken)
                    .get()
                    .build();

            try (Response response = httpClient.newCall(request).execute()) {
                return response.isSuccessful();
            }
        } catch (Exception e) {
            return false;
        }
    }

    public boolean isEnabled() {
        return enabled;
    }

    public record CachedUrl(String originalUrl, String urlId) {}
}
