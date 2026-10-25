package dev.novagk.urlshortener.controller;

import dev.novagk.urlshortener.dto.ApiResponse;
import dev.novagk.urlshortener.entity.UrlEntity;
import dev.novagk.urlshortener.exception.AppException;
import dev.novagk.urlshortener.repository.UrlRepository;
import dev.novagk.urlshortener.service.ClickHouseService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Controller for OLAP analytics endpoints matching Node.js analytics.controller.ts.
 */
@Slf4j
@RestController
@RequestMapping("/api/analytics")
@RequiredArgsConstructor
public class AnalyticsController {

    private final UrlRepository urlRepository;
    private final ClickHouseService clickHouseService;

    private UrlEntity getOwnedUrl(String shortCode, String userId) {
        UrlEntity url = urlRepository.findByShortCode(shortCode)
                .orElseThrow(() -> new AppException("Short URL not found", HttpStatus.NOT_FOUND));

        if (!url.getUserId().toString().equals(userId)) {
            throw new AppException("You are not authorised to view analytics for this URL", HttpStatus.FORBIDDEN);
        }
        return url;
    }

    @GetMapping("/{shortCode}/overview")
    public ResponseEntity<ApiResponse<Map<String, Object>>> getOverview(
            @PathVariable String shortCode,
            @RequestParam(required = false) String timezone,
            @RequestHeader(value = "X-Timezone", required = false) String headerTimezone,
            Authentication auth) {
        String tz = timezone != null ? timezone : headerTimezone;
        UrlEntity url = getOwnedUrl(shortCode, auth.getName());

        Map<String, Object> overview = clickHouseService.getOverviewAnalytics(url.getId().toString(), tz);

        Map<String, Object> urlData = new LinkedHashMap<>();
        urlData.put("id", url.getId());
        urlData.put("shortCode", url.getShortCode());
        urlData.put("originalUrl", url.getOriginalUrl());
        urlData.put("createdAt", url.getCreatedAt());
        urlData.put("expiresAt", url.getExpiresAt());

        Map<String, Object> responseData = new LinkedHashMap<>();
        responseData.put("url", urlData);
        responseData.put("overview", overview);

        return ResponseEntity.ok(ApiResponse.success(responseData, "Overview analytics retrieved successfully"));
    }

    @GetMapping("/{shortCode}/timeline")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getTimeline(
            @PathVariable String shortCode,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(defaultValue = "day") String interval,
            @RequestParam(required = false) String timezone,
            @RequestHeader(value = "X-Timezone", required = false) String headerTimezone,
            Authentication auth) {
        String tz = timezone != null ? timezone : headerTimezone;
        UrlEntity url = getOwnedUrl(shortCode, auth.getName());

        List<Map<String, Object>> timeline = clickHouseService.getClicksOverTime(
                url.getId().toString(), startDate, endDate, interval, tz);

        return ResponseEntity.ok(ApiResponse.success(timeline, "Timeline analytics retrieved successfully"));
    }

    @GetMapping("/{shortCode}/devices")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getDevices(
            @PathVariable String shortCode,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            Authentication auth) {
        UrlEntity url = getOwnedUrl(shortCode, auth.getName());
        List<Map<String, Object>> devices = clickHouseService.getClicksByDimension(
                url.getId().toString(), "device", startDate, endDate, 0);

        return ResponseEntity.ok(ApiResponse.success(devices, "Device analytics retrieved successfully"));
    }

    @GetMapping("/{shortCode}/browsers")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getBrowsers(
            @PathVariable String shortCode,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            Authentication auth) {
        UrlEntity url = getOwnedUrl(shortCode, auth.getName());
        List<Map<String, Object>> browsers = clickHouseService.getClicksByDimension(
                url.getId().toString(), "browser", startDate, endDate, 0);

        return ResponseEntity.ok(ApiResponse.success(browsers, "Browser analytics retrieved successfully"));
    }

    @GetMapping("/{shortCode}/os")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getOperatingSystems(
            @PathVariable String shortCode,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            Authentication auth) {
        UrlEntity url = getOwnedUrl(shortCode, auth.getName());
        List<Map<String, Object>> os = clickHouseService.getClicksByDimension(
                url.getId().toString(), "os", startDate, endDate, 0);

        return ResponseEntity.ok(ApiResponse.success(os, "Operating system analytics retrieved successfully"));
    }

    @GetMapping("/{shortCode}/referrers")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getReferrers(
            @PathVariable String shortCode,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(defaultValue = "20") int limit,
            Authentication auth) {
        UrlEntity url = getOwnedUrl(shortCode, auth.getName());
        List<Map<String, Object>> referrers = clickHouseService.getClicksByDimension(
                url.getId().toString(), "referrer", startDate, endDate, limit);

        return ResponseEntity.ok(ApiResponse.success(referrers, "Referrer analytics retrieved successfully"));
    }

    @GetMapping("/{shortCode}/countries")
    public ResponseEntity<ApiResponse<List<Map<String, Object>>>> getCountries(
            @PathVariable String shortCode,
            @RequestParam(required = false) String startDate,
            @RequestParam(required = false) String endDate,
            @RequestParam(defaultValue = "50") int limit,
            Authentication auth) {
        UrlEntity url = getOwnedUrl(shortCode, auth.getName());
        List<Map<String, Object>> countries = clickHouseService.getClicksByDimension(
                url.getId().toString(), "country", startDate, endDate, limit);

        return ResponseEntity.ok(ApiResponse.success(countries, "Country analytics retrieved successfully"));
    }
}
