package dev.novagk.urlshortener.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Click event DTO for Kafka serialization — matches the Node.js ClickEvent interface.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ClickEventDto {
    private String clickId;
    private String urlId;
    private String shortCode;
    private String timestamp;
    private String ipAddress;
    private String userAgent;
    private String device;
    private String browser;
    private String operatingSystem;
    private String referrer;
    private String country;
    private String requestId;
}
