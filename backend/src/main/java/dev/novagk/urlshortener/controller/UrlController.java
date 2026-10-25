package dev.novagk.urlshortener.controller;

import dev.novagk.urlshortener.dto.ApiResponse;
import dev.novagk.urlshortener.dto.CreateUrlRequest;
import dev.novagk.urlshortener.service.UrlService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * Controller for URL management endpoints matching Node.js url.controller.ts.
 */
@Slf4j
@RestController
@RequestMapping("/api/urls")
@RequiredArgsConstructor
public class UrlController {

    private final UrlService urlService;

    @PostMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> createUrl(
            @Valid @RequestBody CreateUrlRequest request,
            Authentication auth) {
        String userId = auth.getName();
        log.info("Create URL request for userId={}, originalUrl={}", userId, request.getOriginalUrl());
        Map<String, Object> result = urlService.createUrl(userId, request.getOriginalUrl(), request.getExpiresAt());
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ApiResponse.success(result, "Short URL created successfully"));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<Map<String, Object>>> getUserUrls(
            @RequestParam(defaultValue = "1") int page,
            @RequestParam(defaultValue = "10") int limit,
            Authentication auth) {
        String userId = auth.getName();
        log.info("Get user URLs for userId={}, page={}, limit={}", userId, page, limit);
        Map<String, Object> result = urlService.getUserUrls(userId, Math.max(1, page), Math.max(1, limit));
        return ResponseEntity.ok(ApiResponse.success(result, "URLs retrieved successfully"));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteUrl(
            @PathVariable String id,
            Authentication auth) {
        String userId = auth.getName();
        log.info("Delete URL request for id={}, userId={}", id, userId);
        urlService.deleteUrl(id, userId);
        return ResponseEntity.ok(ApiResponse.success(null, "URL deleted successfully"));
    }
}
