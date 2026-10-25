package dev.novagk.urlshortener.controller;

import dev.novagk.urlshortener.entity.UrlEntity;
import dev.novagk.urlshortener.exception.GlobalExceptionHandler;
import dev.novagk.urlshortener.repository.UrlRepository;
import dev.novagk.urlshortener.service.ClickHouseService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.OffsetDateTime;
import java.util.*;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class AnalyticsControllerTest {

    private MockMvc mockMvc;

    @Mock
    private UrlRepository urlRepository;

    @Mock
    private ClickHouseService clickHouseService;

    @InjectMocks
    private AnalyticsController analyticsController;

    private UUID userId;
    private UrlEntity sampleUrl;
    private Authentication auth;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(analyticsController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();

        userId = UUID.randomUUID();
        sampleUrl = UrlEntity.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .shortCode("abc1234")
                .originalUrl("https://example.com/dest")
                .createdAt(OffsetDateTime.now())
                .build();

        auth = new UsernamePasswordAuthenticationToken(userId.toString(), "user@example.com", Collections.emptyList());
    }

    @Test
    void testGetOverviewSuccess() throws Exception {
        when(urlRepository.findByShortCode("abc1234")).thenReturn(Optional.of(sampleUrl));
        when(clickHouseService.getOverviewAnalytics(eq(sampleUrl.getId().toString()), any()))
                .thenReturn(Map.of("totalClicks", 15L, "clicksToday", 3L));

        mockMvc.perform(get("/api/analytics/abc1234/overview")
                        .principal(auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Overview analytics retrieved successfully"))
                .andExpect(jsonPath("$.data.overview.totalClicks").value(15));
    }

    @Test
    void testGetOverviewForbiddenWhenNotOwner() throws Exception {
        UUID otherUserId = UUID.randomUUID();
        Authentication otherAuth = new UsernamePasswordAuthenticationToken(otherUserId.toString(), "other@example.com");
        when(urlRepository.findByShortCode("abc1234")).thenReturn(Optional.of(sampleUrl));

        mockMvc.perform(get("/api/analytics/abc1234/overview")
                        .principal(otherAuth))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("You are not authorised to view analytics for this URL"));
    }

    @Test
    void testGetTimelineSuccess() throws Exception {
        when(urlRepository.findByShortCode("abc1234")).thenReturn(Optional.of(sampleUrl));
        when(clickHouseService.getClicksOverTime(eq(sampleUrl.getId().toString()), any(), any(), any(), any()))
                .thenReturn(List.of(Map.of("time", "2026-10-25T00:00:00.000Z", "clicks", 5L)));

        mockMvc.perform(get("/api/analytics/abc1234/timeline")
                        .principal(auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data[0].clicks").value(5));
    }

    @Test
    void testGetDevicesSuccess() throws Exception {
        when(urlRepository.findByShortCode("abc1234")).thenReturn(Optional.of(sampleUrl));
        when(clickHouseService.getClicksByDimension(eq(sampleUrl.getId().toString()), eq("device"), any(), any(), eq(0)))
                .thenReturn(List.of(Map.of("device", "Desktop", "clicks", 10L, "count", 10L, "percentage", 100.0)));

        mockMvc.perform(get("/api/analytics/abc1234/devices")
                        .principal(auth))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data[0].device").value("Desktop"));
    }
}
