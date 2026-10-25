package dev.novagk.urlshortener.controller;

import dev.novagk.urlshortener.exception.AppException;
import dev.novagk.urlshortener.service.ClickEventService;
import dev.novagk.urlshortener.service.UrlService;
import dev.novagk.urlshortener.util.TelemetryMetrics;
import dev.novagk.urlshortener.view.RedirectSplashView;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * High-throughput public redirect endpoint matching Node.js redirectUrl handler.
 */
@Slf4j
@RestController
@RequiredArgsConstructor
public class RedirectController {

    private final UrlService urlService;
    private final ClickEventService clickEventService;
    private final TelemetryMetrics telemetryMetrics;

    @GetMapping("/{shortCode:[a-zA-Z0-9_-]+}")
    public ResponseEntity<?> redirect(
            @PathVariable String shortCode,
            @RequestParam(required = false) String direct,
            @RequestParam(required = false) String preview,
            HttpServletRequest request) {

        long startTime = System.currentTimeMillis();
        log.info("Redirect requested for shortCode={}", shortCode);

        UrlService.ResolvedUrl resolved;
        try {
            resolved = urlService.resolveShortCode(shortCode);
        } catch (AppException ex) {
            if (ex.getStatus() == HttpStatus.NOT_FOUND) {
                telemetryMetrics.recordRedirect("not_found");
            } else if (ex.getStatus() == HttpStatus.GONE) {
                telemetryMetrics.recordRedirect("expired");
            }
            throw ex;
        }

        telemetryMetrics.recordRedirect("cache".equalsIgnoreCase(resolved.source()) ? "cache_hit" : "cache_miss");

        // Record clickstream event asynchronously / in service
        try {
            clickEventService.recordClick(resolved.urlId(), resolved.shortCode(), request);
        } catch (Exception e) {
            log.warn("Click recording error for shortCode={}: {}", shortCode, e.getMessage());
        }

        // Anti-caching headers
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.CACHE_CONTROL, "private, no-cache, no-store, max-age=0, must-revalidate");
        headers.set(HttpHeaders.PRAGMA, "no-cache");
        headers.set(HttpHeaders.EXPIRES, "0");

        String accept = request.getHeader(HttpHeaders.ACCEPT);
        boolean acceptsHtml = accept != null && (accept.contains("text/html") || accept.contains("application/xhtml+xml"));
        boolean directRequested = "true".equalsIgnoreCase(direct)
                || "false".equalsIgnoreCase(preview)
                || (accept != null && accept.contains("application/json"));

        boolean shouldRenderSplash = acceptsHtml && !directRequested;

        long duration = System.currentTimeMillis() - startTime;

        if (!shouldRenderSplash) {
            log.info("Direct 301 redirect to {} for shortCode={} ({}ms)", resolved.originalUrl(), shortCode, duration);
            headers.set(HttpHeaders.LOCATION, resolved.originalUrl());
            return new ResponseEntity<>(headers, HttpStatus.MOVED_PERMANENTLY);
        }

        log.info("Rendering countdown splash screen to {} for shortCode={} ({}ms)", resolved.originalUrl(), shortCode, duration);
        String html = RedirectSplashView.render(resolved.shortCode(), resolved.originalUrl(), 5);
        headers.setContentType(MediaType.valueOf("text/html;charset=UTF-8"));
        return new ResponseEntity<>(html, headers, HttpStatus.OK);
    }
}
