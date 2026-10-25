package dev.novagk.urlshortener.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * DTO representing a URL record — matches the Node.js UrlRow with snake_case fields.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.ALWAYS)
public class UrlDto {
    private UUID id;
    private UUID user_id;
    private String original_url;
    private String short_code;
    private OffsetDateTime created_at;
    private OffsetDateTime updated_at;
    private OffsetDateTime expires_at;
}
