package dev.novagk.urlshortener.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.novagk.urlshortener.dto.ClickEventDto;
import dev.novagk.urlshortener.entity.ClickEventEntity;
import dev.novagk.urlshortener.repository.ClickEventRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import ua_parser.Client;
import ua_parser.Parser;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Click event service matching the Node.js clickEvent.service.ts.
 * Records clicks to Kafka and dual-sinks to PostgreSQL.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ClickEventService {

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ClickEventRepository clickEventRepository;
    private final ObjectMapper objectMapper;

    @Value("${app.kafka.topic:url-click-events}")
    private String kafkaTopic;

    private final Parser uaParser = new Parser();

    /**
     * Record a click event: build event, stream to Kafka, persist to PostgreSQL.
     */
    public ClickEventDto recordClick(String urlId, String shortCode, HttpServletRequest request) {
        ClickEventDto event = buildClickEvent(urlId, shortCode, request);

        // 1. Stream to Kafka
        try {
            String payload = objectMapper.writeValueAsString(event);
            kafkaTemplate.send(kafkaTopic, event.getClickId(), payload)
                    .whenComplete((result, ex) -> {
                        if (ex != null) {
                            log.warn("Kafka publish failed for clickId={}: {}", event.getClickId(), ex.getMessage());
                        } else {
                            log.debug("Kafka publish success for clickId={}", event.getClickId());
                        }
                    });
        } catch (Exception e) {
            log.warn("Kafka streaming error for clickId={}: {}", event.getClickId(), e.getMessage());
        }

        // 2. Dual-sink to PostgreSQL
        try {
            ClickEventEntity entity = ClickEventEntity.builder()
                    .id(UUID.fromString(event.getClickId()))
                    .urlId(UUID.fromString(event.getUrlId()))
                    .shortCode(event.getShortCode())
                    .timestamp(OffsetDateTime.parse(event.getTimestamp()))
                    .ipAddress(event.getIpAddress())
                    .userAgent(event.getUserAgent())
                    .device(event.getDevice())
                    .browser(event.getBrowser())
                    .operatingSystem(event.getOperatingSystem())
                    .referrer(event.getReferrer())
                    .country(event.getCountry())
                    .build();
            clickEventRepository.save(entity);
            log.debug("Click event persisted to PostgreSQL: clickId={}", event.getClickId());
        } catch (Exception e) {
            log.warn("PostgreSQL click event persistence warning for clickId={}: {}", event.getClickId(), e.getMessage());
        }

        return event;
    }

    /**
     * Build a standardized click event from request metadata.
     */
    public ClickEventDto buildClickEvent(String urlId, String shortCode, HttpServletRequest request) {
        String ipAddress = extractIpAddress(request);
        String country = null; // GeoIP lookup - gracefully degrades
        String rawUserAgent = request.getHeader("User-Agent");
        String referrer = request.getHeader("Referer");
        if (referrer == null) referrer = request.getHeader("Referrer");

        // Parse user agent
        String device = "unknown";
        String browser = "Other";
        String operatingSystem = "Other";

        if (rawUserAgent != null && !rawUserAgent.isBlank()) {
            try {
                Client client = uaParser.parse(rawUserAgent);
                browser = client.userAgent.family != null ? client.userAgent.family : "Other";
                operatingSystem = client.os.family != null ? client.os.family : "Other";
                device = classifyDevice(client.device.family, rawUserAgent);
            } catch (Exception e) {
                log.debug("UA parsing failed: {}", e.getMessage());
            }
        }

        String requestId = (String) request.getAttribute("requestId");

        return ClickEventDto.builder()
                .clickId(UUID.randomUUID().toString())
                .urlId(urlId)
                .shortCode(shortCode)
                .timestamp(OffsetDateTime.now().toString())
                .ipAddress(ipAddress)
                .userAgent(rawUserAgent)
                .device(device)
                .browser(browser)
                .operatingSystem(operatingSystem)
                .referrer(referrer != null && !referrer.isBlank() ? referrer.trim() : null)
                .country(country)
                .requestId(requestId)
                .build();
    }

    private String extractIpAddress(HttpServletRequest request) {
        String xff = request.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            String ip = xff.split(",")[0].trim();
            return ip.replaceFirst("^::ffff:", "");
        }
        String cfIp = request.getHeader("CF-Connecting-IP");
        if (cfIp != null && !cfIp.isBlank()) return cfIp.trim();
        String trueClientIp = request.getHeader("True-Client-IP");
        if (trueClientIp != null && !trueClientIp.isBlank()) return trueClientIp.trim();
        String realIp = request.getHeader("X-Real-IP");
        if (realIp != null && !realIp.isBlank()) return realIp.trim().replaceFirst("^::ffff:", "");

        String remoteAddr = request.getRemoteAddr();
        return remoteAddr != null ? remoteAddr.replaceFirst("^::ffff:", "") : null;
    }

    private String classifyDevice(String deviceFamily, String userAgent) {
        if (userAgent == null || userAgent.isBlank()) return "unknown";

        String ua = userAgent.toLowerCase();
        if (ua.contains("mobile") || ua.contains("android") && !ua.contains("tablet")) return "mobile";
        if (ua.contains("tablet") || ua.contains("ipad")) return "tablet";

        // If device family indicates mobile
        if (deviceFamily != null) {
            String df = deviceFamily.toLowerCase();
            if (df.contains("iphone") || df.contains("android")) return "mobile";
            if (df.contains("ipad")) return "tablet";
        }

        return "desktop";
    }
}
