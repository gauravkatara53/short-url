package dev.novagk.urlshortener.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.Data;
import org.hibernate.validator.constraints.URL;

@Data
public class CreateUrlRequest {

    @NotBlank(message = "Invalid URL format")
    @URL(message = "Invalid URL format")
    private String originalUrl;

    private String expiresAt;
}
