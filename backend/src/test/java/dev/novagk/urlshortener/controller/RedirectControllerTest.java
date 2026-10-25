package dev.novagk.urlshortener.controller;

import dev.novagk.urlshortener.exception.AppException;
import dev.novagk.urlshortener.exception.GlobalExceptionHandler;
import dev.novagk.urlshortener.service.ClickEventService;
import dev.novagk.urlshortener.service.UrlService;
import dev.novagk.urlshortener.util.TelemetryMetrics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class RedirectControllerTest {

    private MockMvc mockMvc;

    @Mock
    private UrlService urlService;

    @Mock
    private ClickEventService clickEventService;

    @Mock
    private TelemetryMetrics telemetryMetrics;

    @InjectMocks
    private RedirectController redirectController;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(redirectController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void testDirect301RedirectWhenDirectParamPresent() throws Exception {
        UrlService.ResolvedUrl resolved = new UrlService.ResolvedUrl(
                "https://example.com/target", "url-id-1", "abc1234", "postgres");

        when(urlService.resolveShortCode("abc1234")).thenReturn(resolved);

        mockMvc.perform(get("/abc1234").param("direct", "true"))
                .andExpect(status().isMovedPermanently())
                .andExpect(header().string("Location", "https://example.com/target"))
                .andExpect(header().string("Cache-Control", "private, no-cache, no-store, max-age=0, must-revalidate"));
    }

    @Test
    void testHtmlSplashWhenBrowserAcceptsHtml() throws Exception {
        UrlService.ResolvedUrl resolved = new UrlService.ResolvedUrl(
                "https://example.com/target", "url-id-1", "abc1234", "cache");

        when(urlService.resolveShortCode("abc1234")).thenReturn(resolved);

        mockMvc.perform(get("/abc1234").header("Accept", "text/html,application/xhtml+xml"))
                .andExpect(status().isOk())
                .andExpect(content().contentTypeCompatibleWith("text/html"))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("Taking you to your destination")))
                .andExpect(content().string(org.hamcrest.Matchers.containsString("https://example.com/target")));
    }

    @Test
    void testRedirectNotFoundReturns404() throws Exception {
        when(urlService.resolveShortCode("missing"))
                .thenThrow(new AppException("Short URL not found", HttpStatus.NOT_FOUND));

        mockMvc.perform(get("/missing"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Short URL not found"));
    }

    @Test
    void testRedirectExpiredReturns410() throws Exception {
        when(urlService.resolveShortCode("expired"))
                .thenThrow(new AppException("This short URL has expired", HttpStatus.GONE));

        mockMvc.perform(get("/expired"))
                .andExpect(status().isGone())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("This short URL has expired"));
    }
}
