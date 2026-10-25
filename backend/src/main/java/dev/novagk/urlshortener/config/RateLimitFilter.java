package dev.novagk.urlshortener.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.novagk.urlshortener.dto.ApiResponse;
import jakarta.servlet.*;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory IP-based rate limiter using simple token bucket.
 * Matches the Node.js express-rate-limit middleware behavior.
 * Uses a simple ConcurrentHashMap approach since we don't have bucket4j on classpath.
 */
@Slf4j
@Component
@org.springframework.core.annotation.Order(2)
public class RateLimitFilter implements Filter {

    @Value("${app.rate-limit.auth.max:20}")
    private int authMax;

    @Value("${app.rate-limit.auth.window-ms:900000}")
    private long authWindowMs;

    @Value("${app.rate-limit.api.max:200}")
    private int apiMax;

    @Value("${app.rate-limit.api.window-ms:900000}")
    private long apiWindowMs;

    @Value("${app.rate-limit.redirect.max:2000}")
    private int redirectMax;

    @Value("${app.rate-limit.redirect.window-ms:900000}")
    private long redirectWindowMs;

    private final Map<String, RateLimitBucket> buckets = new ConcurrentHashMap<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException {
        HttpServletRequest httpReq = (HttpServletRequest) request;
        HttpServletResponse httpRes = (HttpServletResponse) response;
        String path = httpReq.getRequestURI();
        String clientIp = getClientIp(httpReq);

        int max;
        long windowMs;

        if (path.startsWith("/api/auth")) {
            max = authMax;
            windowMs = authWindowMs;
        } else if (path.startsWith("/api/")) {
            max = apiMax;
            windowMs = apiWindowMs;
        } else {
            max = redirectMax;
            windowMs = redirectWindowMs;
        }

        String bucketKey = clientIp + ":" + getBucketCategory(path);
        RateLimitBucket bucket = buckets.computeIfAbsent(bucketKey,
                k -> new RateLimitBucket(max, windowMs));

        if (!bucket.tryConsume()) {
            httpRes.setStatus(429);
            httpRes.setContentType(MediaType.APPLICATION_JSON_VALUE);
            String message = path.startsWith("/api/auth")
                    ? "Too many authentication attempts. Please wait a few minutes before trying again."
                    : path.startsWith("/api/")
                    ? "Too many API requests. Please reduce request frequency."
                    : "Redirect rate limit reached. Please try again shortly.";

            httpRes.getWriter().write(objectMapper.writeValueAsString(Map.of(
                    "success", false,
                    "message", message,
                    "retryAfter", String.valueOf(windowMs / 1000)
            )));
            return;
        }

        chain.doFilter(request, response);
    }

    private String getBucketCategory(String path) {
        if (path.startsWith("/api/auth")) return "auth";
        if (path.startsWith("/api/")) return "api";
        return "redirect";
    }

    private String getClientIp(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }
        return request.getRemoteAddr();
    }

    /**
     * Simple sliding window rate limit bucket.
     */
    private static class RateLimitBucket {
        private final int maxTokens;
        private final long windowMs;
        private int tokens;
        private long windowStart;

        RateLimitBucket(int maxTokens, long windowMs) {
            this.maxTokens = maxTokens;
            this.windowMs = windowMs;
            this.tokens = maxTokens;
            this.windowStart = System.currentTimeMillis();
        }

        synchronized boolean tryConsume() {
            long now = System.currentTimeMillis();
            if (now - windowStart > windowMs) {
                tokens = maxTokens;
                windowStart = now;
            }
            if (tokens > 0) {
                tokens--;
                return true;
            }
            return false;
        }
    }
}
