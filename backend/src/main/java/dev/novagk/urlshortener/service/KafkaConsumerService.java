package dev.novagk.urlshortener.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.novagk.urlshortener.dto.ClickEventDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Service;

/**
 * Kafka consumer service matching the Node.js kafkaConsumer.service.ts.
 * Consumes click events from Kafka and inserts into ClickHouse.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class KafkaConsumerService {

    private final ClickHouseService clickHouseService;
    private final ObjectMapper objectMapper;

    private static final int MAX_RETRIES = 3;
    private static final long RETRY_BACKOFF_MS = 500;

    @KafkaListener(topics = "${app.kafka.topic:url-click-events}",
                   groupId = "${spring.kafka.consumer.group-id:url-shortener-click-consumers}")
    public void handleMessage(String message) {
        if (message == null || message.isBlank()) {
            log.warn("Empty Kafka message received, skipping");
            return;
        }

        ClickEventDto event;
        try {
            event = objectMapper.readValue(message, ClickEventDto.class);
        } catch (Exception e) {
            log.error("Malformed Kafka message: {}", e.getMessage());
            return;
        }

        // Process with retry
        int attempts = 0;
        boolean processed = false;

        while (attempts < MAX_RETRIES && !processed) {
            try {
                attempts++;
                clickHouseService.insertClickEvent(event);
                processed = true;
                log.debug("Kafka event processed: clickId={}", event.getClickId());
            } catch (Exception e) {
                log.warn("Processing attempt {}/{} failed for clickId={}: {}",
                        attempts, MAX_RETRIES, event.getClickId(), e.getMessage());
                if (attempts < MAX_RETRIES) {
                    try {
                        Thread.sleep(RETRY_BACKOFF_MS * (long) Math.pow(2, attempts - 1));
                    } catch (InterruptedException ie) {
                        Thread.currentThread().interrupt();
                        break;
                    }
                }
            }
        }

        if (!processed) {
            log.error("Event permanently failed after {} attempts: clickId={}", MAX_RETRIES, event.getClickId());
        }
    }
}
