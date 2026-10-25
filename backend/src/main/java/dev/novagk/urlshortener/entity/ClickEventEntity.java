package dev.novagk.urlshortener.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.UuidGenerator;

import java.time.OffsetDateTime;
import java.util.UUID;

@Entity
@Table(name = "click_events", indexes = {
        @Index(name = "idx_click_events_url_id", columnList = "url_id"),
        @Index(name = "idx_click_events_timestamp", columnList = "timestamp"),
        @Index(name = "idx_click_events_short_code", columnList = "short_code")
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ClickEventEntity {

    @Id
    @Column(name = "id", updatable = false, nullable = false)
    private UUID id;

    @Column(name = "url_id", nullable = false)
    private UUID urlId;

    @Column(name = "short_code", nullable = false, length = 20)
    private String shortCode;

    @Column(name = "timestamp", nullable = false)
    @Builder.Default
    private OffsetDateTime timestamp = OffsetDateTime.now();

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "user_agent", columnDefinition = "TEXT")
    private String userAgent;

    @Column(name = "device", nullable = false, length = 50)
    @Builder.Default
    private String device = "unknown";

    @Column(name = "browser", nullable = false, length = 50)
    @Builder.Default
    private String browser = "Other";

    @Column(name = "operating_system", nullable = false, length = 50)
    @Builder.Default
    private String operatingSystem = "Other";

    @Column(name = "referrer", columnDefinition = "TEXT")
    private String referrer;

    @Column(name = "country", length = 10)
    private String country;

    @Column(name = "created_at", nullable = false, updatable = false)
    @Builder.Default
    private OffsetDateTime createdAt = OffsetDateTime.now();
}
