package dev.novagk.urlshortener.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.novagk.urlshortener.dto.CreateUrlRequest;
import dev.novagk.urlshortener.exception.AppException;
import dev.novagk.urlshortener.exception.GlobalExceptionHandler;
import dev.novagk.urlshortener.service.UrlService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class UrlControllerTest {

    private MockMvc mockMvc;

    @Mock
    private UrlService urlService;

    @InjectMocks
    private UrlController urlController;

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final String userId = UUID.randomUUID().toString();
    private Authentication auth;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(urlController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
        auth = new UsernamePasswordAuthenticationToken(userId, "test@example.com", Collections.emptyList());
    }

    @Test
    void testCreateUrlSuccess() throws Exception {
        CreateUrlRequest req = new CreateUrlRequest();
        req.setOriginalUrl("https://example.com/target");

        Map<String, Object> result = Map.of(
                "id", UUID.randomUUID().toString(),
                "shortCode", "abc1234",
                "shortUrl", "https://novagk.dev/abc1234",
                "originalUrl", "https://example.com/target"
        );

        when(urlService.createUrl(eq(userId), eq("https://example.com/target"), any()))
                .thenReturn(result);

        mockMvc.perform(post("/api/urls")
                        .principal(auth)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Short URL created successfully"))
                .andExpect(jsonPath("$.data.shortUrl").value("https://novagk.dev/abc1234"));
    }

    @Test
    void testGetUserUrls() throws Exception {
        Map<String, Object> result = Map.of(
                "urls", List.of(),
                "pagination", Map.of("page", 1, "limit", 10, "total", 0, "totalPages", 0)
        );

        when(urlService.getUserUrls(eq(userId), eq(1), eq(10)))
                .thenReturn(result);

        mockMvc.perform(get("/api/urls")
                        .principal(auth)
                        .param("page", "1")
                        .param("limit", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("URLs retrieved successfully"))
                .andExpect(jsonPath("$.data.pagination.page").value(1));
    }

    @Test
    void testDeleteUrlSuccess() throws Exception {
        String urlId = UUID.randomUUID().toString();

        mockMvc.perform(delete("/api/urls/" + urlId)
                        .principal(auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("URL deleted successfully"));
    }

    @Test
    void testDeleteUrlForbidden() throws Exception {
        String urlId = UUID.randomUUID().toString();

        doThrow(new AppException("You are not authorised to delete this URL", HttpStatus.FORBIDDEN))
                .when(urlService).deleteUrl(urlId, userId);

        mockMvc.perform(delete("/api/urls/" + urlId)
                        .principal(auth))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("You are not authorised to delete this URL"));
    }
}
