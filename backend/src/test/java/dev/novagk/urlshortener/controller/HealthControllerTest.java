package dev.novagk.urlshortener.controller;

import dev.novagk.urlshortener.service.CacheService;
import dev.novagk.urlshortener.service.ClickHouseService;
import dev.novagk.urlshortener.util.TelemetryMetrics;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;
import java.util.Map;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class HealthControllerTest {

    private MockMvc mockMvc;

    @Mock
    private DataSource dataSource;

    @Mock
    private CacheService cacheService;

    @Mock
    private ClickHouseService clickHouseService;

    @Mock
    private TelemetryMetrics telemetryMetrics;

    @InjectMocks
    private HealthController healthController;

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(healthController).build();
    }

    @Test
    void testGetHealth() throws Exception {
        when(clickHouseService.checkHealth()).thenReturn(Map.of("status", "connected"));

        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("API is running"))
                .andExpect(jsonPath("$.data.status").value("healthy"))
                .andExpect(jsonPath("$.data.services.clickhouse").value("connected"));
    }

    @Test
    void testGetLiveness() throws Exception {
        mockMvc.perform(get("/api/health/live"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ok"))
                .andExpect(jsonPath("$.memory").exists());
    }

    @Test
    void testGetReadiness() throws Exception {
        Connection conn = mock(Connection.class);
        Statement stmt = mock(Statement.class);
        when(dataSource.getConnection()).thenReturn(conn);
        when(conn.createStatement()).thenReturn(stmt);
        when(stmt.executeQuery(anyString())).thenReturn(null);

        when(cacheService.isEnabled()).thenReturn(true);
        when(cacheService.ping()).thenReturn(true);
        when(clickHouseService.checkHealth()).thenReturn(Map.of("status", "connected"));

        mockMvc.perform(get("/api/health/ready"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("ready"))
                .andExpect(jsonPath("$.dependencies.postgres.status").value("connected"))
                .andExpect(jsonPath("$.dependencies.redis.status").value("connected"));
    }

    @Test
    void testGetMetrics() throws Exception {
        when(telemetryMetrics.getSnapshot()).thenReturn(Map.of("uptimeSeconds", 42));

        mockMvc.perform(get("/api/metrics"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.uptimeSeconds").value(42));
    }
}
