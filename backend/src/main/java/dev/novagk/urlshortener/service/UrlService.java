package dev.novagk.urlshortener.service;

import dev.novagk.urlshortener.dto.UrlDto;
import dev.novagk.urlshortener.entity.UrlEntity;
import dev.novagk.urlshortener.exception.AppException;
import dev.novagk.urlshortener.repository.UrlRepository;
import dev.novagk.urlshortener.util.ShortCodeGenerator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.*;

/**
 * URL service matching the Node.js url.service.ts — create, resolve, getUserUrls, delete.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class UrlService {

    private final UrlRepository urlRepository;
    private final CacheService cacheService;

    @Value("${app.base-url:https://novagk.dev}")
    private String baseUrl;

    @Value("${app.short-code-length:7}")
    private int shortCodeLength;

    private static final int MAX_COLLISION_RETRIES = 5;

    /**
     * Create a shortened URL for an authenticated user.
     */
    public Map<String, Object> createUrl(String userId, String originalUrl, String expiresAt) {
        log.info("Creating URL for userId={}, originalUrl={}", userId, originalUrl);

        // Validate URL protocol
        if (originalUrl != null) {
            String lower = originalUrl.toLowerCase();
            if (!lower.startsWith("http://") && !lower.startsWith("https://")) {
                throw new AppException("Dangerous or unsupported URL protocol. Only http:// and https:// URLs are allowed.", HttpStatus.BAD_REQUEST);
            }
            // Check dangerous protocols
            Set<String> dangerous = Set.of("javascript:", "data:", "vbscript:", "file:", "blob:");
            for (String proto : dangerous) {
                if (lower.startsWith(proto)) {
                    throw new AppException("Dangerous or unsupported URL protocol. Only http:// and https:// URLs are allowed.", HttpStatus.BAD_REQUEST);
                }
            }
        }

        // Generate unique short code
        String shortCode = "";
        int attempts = 0;
        while (attempts < MAX_COLLISION_RETRIES) {
            shortCode = ShortCodeGenerator.generate(shortCodeLength);
            if (!urlRepository.existsByShortCode(shortCode)) break;
            log.warn("Collision detected for shortCode={}", shortCode);
            attempts++;
        }

        if (attempts >= MAX_COLLISION_RETRIES) {
            throw new AppException("Failed to generate a unique short code. Please try again.", HttpStatus.INTERNAL_SERVER_ERROR);
        }

        // Validate expiration date
        OffsetDateTime expiry = null;
        if (expiresAt != null && !expiresAt.isBlank()) {
            try {
                expiry = OffsetDateTime.parse(expiresAt);
                if (expiry.isBefore(OffsetDateTime.now())) {
                    throw new AppException("Expiration date must be in the future", HttpStatus.BAD_REQUEST);
                }
            } catch (AppException ae) {
                throw ae;
            } catch (Exception e) {
                throw new AppException("Invalid datetime format", HttpStatus.BAD_REQUEST);
            }
        }

        UrlEntity url = UrlEntity.builder()
                .userId(UUID.fromString(userId))
                .originalUrl(originalUrl)
                .shortCode(shortCode)
                .expiresAt(expiry)
                .build();

        url = urlRepository.save(url);
        UrlDto urlDto = toDto(url);

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("url", urlDto);
        result.put("shortUrl", baseUrl.replaceAll("/$", "") + "/" + shortCode);
        result.put("id", url.getId());
        result.put("short_code", url.getShortCode());
        result.put("original_url", url.getOriginalUrl());
        result.put("created_at", url.getCreatedAt());
        result.put("expires_at", url.getExpiresAt());

        return result;
    }

    /**
     * Resolve short code to original URL.
     * Cache-aside pattern: Redis -> PostgreSQL -> populate cache.
     */
    public ResolvedUrl resolveShortCode(String shortCode) {
        // 1. Try cache first
        CacheService.CachedUrl cached = cacheService.getUrl(shortCode);
        if (cached != null) {
            log.info("Cache HIT for shortCode={}", shortCode);
            return new ResolvedUrl(cached.originalUrl(), cached.urlId(), shortCode, "cache");
        }

        // 2. Cache MISS — query PostgreSQL
        UrlEntity url = urlRepository.findByShortCode(shortCode)
                .orElseThrow(() -> new AppException("Short URL not found", HttpStatus.NOT_FOUND));

        // Check expiration
        if (url.getExpiresAt() != null && url.getExpiresAt().isBefore(OffsetDateTime.now())) {
            throw new AppException("This short URL has expired", HttpStatus.GONE);
        }

        // 3. Populate cache
        cacheService.setUrl(shortCode, new CacheService.CachedUrl(url.getOriginalUrl(), url.getId().toString()));

        return new ResolvedUrl(url.getOriginalUrl(), url.getId().toString(), shortCode, "postgres");
    }

    /**
     * Get paginated URLs for a specific user.
     */
    public Map<String, Object> getUserUrls(String userId, int page, int limit) {
        Page<UrlEntity> pageResult = urlRepository.findByUserIdOrderByCreatedAtDesc(
                UUID.fromString(userId), PageRequest.of(page - 1, limit));

        List<UrlDto> urls = pageResult.getContent().stream()
                .map(this::toDto)
                .toList();

        long total = pageResult.getTotalElements();

        Map<String, Object> pagination = new LinkedHashMap<>();
        pagination.put("page", page);
        pagination.put("limit", limit);
        pagination.put("total", total);
        pagination.put("totalPages", (int) Math.ceil((double) total / limit));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("urls", urls);
        result.put("pagination", pagination);
        return result;
    }

    /**
     * Delete a URL, ensuring the requesting user is the owner.
     */
    public void deleteUrl(String urlId, String userId) {
        UrlEntity url = urlRepository.findById(UUID.fromString(urlId))
                .orElseThrow(() -> new AppException("URL not found", HttpStatus.NOT_FOUND));

        if (!url.getUserId().toString().equals(userId)) {
            throw new AppException("You are not authorised to delete this URL", HttpStatus.FORBIDDEN);
        }

        urlRepository.deleteById(url.getId());
        cacheService.deleteUrl(url.getShortCode());
        log.info("URL deleted: id={}, shortCode={}", urlId, url.getShortCode());
    }

    private UrlDto toDto(UrlEntity entity) {
        return UrlDto.builder()
                .id(entity.getId())
                .user_id(entity.getUserId())
                .original_url(entity.getOriginalUrl())
                .short_code(entity.getShortCode())
                .created_at(entity.getCreatedAt())
                .updated_at(entity.getUpdatedAt())
                .expires_at(entity.getExpiresAt())
                .build();
    }

    public record ResolvedUrl(String originalUrl, String urlId, String shortCode, String source) {}
}
