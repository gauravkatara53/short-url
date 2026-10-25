package dev.novagk.urlshortener.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.novagk.urlshortener.dto.ClickEventDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import java.sql.*;
import java.util.*;

/**
 * ClickHouse service matching the Node.js clickhouse.service.ts and analytics.service.ts.
 * Uses JDBC to interact with ClickHouse Cloud.
 */
@Slf4j
@Service
public class ClickHouseService {

    @Value("${app.clickhouse.url:http://localhost:8123}")
    private String clickhouseUrl;

    @Value("${app.clickhouse.username:default}")
    private String username;

    @Value("${app.clickhouse.password:}")
    private String password;

    @Value("${app.clickhouse.database:default}")
    private String database;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private boolean configured = false;

    @PostConstruct
    public void init() {
        configured = clickhouseUrl != null && !clickhouseUrl.isBlank();

        if (!configured) {
            log.warn("ClickHouse not configured. Analytics will return empty results.");
            return;
        }

        try {
            initClickHouseTables();
        } catch (Exception e) {
            log.warn("ClickHouse table initialization warning: {}", e.getMessage());
        }
    }

    private Connection getConnection() throws SQLException {
        String jdbcUrl = clickhouseUrl;
        if (!jdbcUrl.startsWith("jdbc:")) {
            // Convert https://host:port to jdbc:ch:https://host:port/database
            jdbcUrl = "jdbc:ch:" + clickhouseUrl + "/" + database
                    + "?ssl=true&sslmode=NONE";
        }

        Properties props = new Properties();
        props.setProperty("user", username);
        props.setProperty("password", password);

        return DriverManager.getConnection(jdbcUrl, props);
    }

    private void initClickHouseTables() {
        String createTable = """
                CREATE TABLE IF NOT EXISTS click_events (
                    click_id UUID,
                    url_id UUID,
                    short_code LowCardinality(String),
                    timestamp DateTime64(3, 'UTC'),
                    ip_address Nullable(String),
                    user_agent Nullable(String),
                    device LowCardinality(String),
                    browser LowCardinality(String),
                    operating_system LowCardinality(String),
                    referrer Nullable(String),
                    country Nullable(String),
                    created_at DateTime64(3, 'UTC') DEFAULT now64(3)
                )
                ENGINE = ReplacingMergeTree(created_at)
                ORDER BY (url_id, short_code, timestamp, click_id)
                """;

        try (Connection conn = getConnection();
             Statement stmt = conn.createStatement()) {
            stmt.execute(createTable);
            log.info("✅ ClickHouse analytics tables initialized");
        } catch (Exception e) {
            log.warn("ClickHouse init warning: {}", e.getMessage());
        }
    }

    /**
     * Insert a click event into ClickHouse.
     */
    public void insertClickEvent(ClickEventDto event) {
        if (!configured) return;

        String sql = """
                INSERT INTO click_events
                (click_id, url_id, short_code, timestamp, ip_address, user_agent,
                 device, browser, operating_system, referrer, country)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """;

        try (Connection conn = getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, event.getClickId());
            stmt.setString(2, event.getUrlId());
            stmt.setString(3, event.getShortCode());
            stmt.setString(4, event.getTimestamp());
            stmt.setString(5, event.getIpAddress());
            stmt.setString(6, event.getUserAgent());
            stmt.setString(7, event.getDevice());
            stmt.setString(8, event.getBrowser());
            stmt.setString(9, event.getOperatingSystem());
            stmt.setString(10, event.getReferrer());
            stmt.setString(11, event.getCountry());
            stmt.executeUpdate();
            log.debug("ClickHouse insert success: clickId={}", event.getClickId());
        } catch (Exception e) {
            log.warn("ClickHouse insert failed for clickId={}: {}", event.getClickId(), e.getMessage());
        }
    }

    /**
     * Check ClickHouse health.
     */
    public Map<String, Object> checkHealth() {
        Map<String, Object> result = new LinkedHashMap<>();

        if (!configured) {
            result.put("status", "disabled");
            result.put("error", "ClickHouse credentials not configured");
            return result;
        }

        try (Connection conn = getConnection();
             Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery("SELECT version() as ver")) {
            if (rs.next()) {
                result.put("status", "connected");
                result.put("version", rs.getString("ver"));
            }
        } catch (Exception e) {
            result.put("status", "degraded");
            result.put("error", e.getMessage());
        }
        return result;
    }

    // ── Analytics query methods ────────────────────────────────

    public Map<String, Object> getOverviewAnalytics(String urlId, String timezone) {
        Map<String, Object> overview = new LinkedHashMap<>();
        overview.put("totalClicks", 0);
        overview.put("clicksToday", 0);
        overview.put("clicksLast7Days", 0);
        overview.put("clicksLast30Days", 0);

        if (!configured) return overview;

        String tz = sanitizeTimezone(timezone);
        String sql = String.format("""
                SELECT
                    count() as totalClicks,
                    countIf(timestamp >= toStartOfDay(now(), '%s')) as clicksToday,
                    countIf(timestamp >= now() - INTERVAL 7 DAY) as clicksLast7Days,
                    countIf(timestamp >= now() - INTERVAL 30 DAY) as clicksLast30Days
                FROM click_events
                WHERE url_id = ?
                """, tz);

        try (Connection conn = getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, urlId);
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) {
                    overview.put("totalClicks", rs.getLong("totalClicks"));
                    overview.put("clicksToday", rs.getLong("clicksToday"));
                    overview.put("clicksLast7Days", rs.getLong("clicksLast7Days"));
                    overview.put("clicksLast30Days", rs.getLong("clicksLast30Days"));
                }
            }
        } catch (Exception e) {
            log.warn("ClickHouse overview query failed: {}", e.getMessage());
        }
        return overview;
    }

    public List<Map<String, Object>> getClicksOverTime(String urlId, String startDate, String endDate, String interval, String timezone) {
        if (!configured) return Collections.emptyList();

        String tz = sanitizeTimezone(timezone);
        String bucketExpr = switch (interval != null ? interval : "day") {
            case "hour" -> "toStartOfHour(timestamp)";
            case "week" -> String.format("toStartOfWeek(timestamp, 1, '%s')", tz);
            case "month" -> String.format("toStartOfMonth(timestamp, '%s')", tz);
            default -> String.format("toStartOfDay(timestamp, '%s')", tz);
        };

        StringBuilder sql = new StringBuilder();
        sql.append("SELECT formatDateTime(").append(bucketExpr).append(", '%Y-%m-%dT%H:%i:%s.000Z') as time, ");
        sql.append("count() as clicks FROM click_events WHERE url_id = ?");

        List<Object> params = new ArrayList<>();
        params.add(urlId);

        if (startDate != null && !startDate.isBlank()) {
            sql.append(" AND timestamp >= parseDateTimeBestEffortOrNull(?)");
            params.add(formatDateTime(startDate));
        }
        if (endDate != null && !endDate.isBlank()) {
            sql.append(" AND timestamp <= parseDateTimeBestEffortOrNull(?)");
            params.add(formatDateTime(endDate));
        }

        sql.append(" GROUP BY ").append(bucketExpr);
        sql.append(" ORDER BY ").append(bucketExpr).append(" ASC");

        return executeGroupByQuery(sql.toString(), params, "time", "clicks");
    }

    public List<Map<String, Object>> getClicksByDimension(String urlId, String dimension, String startDate, String endDate, int limit) {
        if (!configured) return Collections.emptyList();

        String column = switch (dimension) {
            case "browser" -> "browser";
            case "os" -> "operating_system";
            case "referrer" -> dimension.equals("referrer") ? "ifNull(referrer, 'Direct / None')" : dimension;
            case "country" -> "ifNull(country, 'Unknown')";
            default -> "device";
        };

        String alias = switch (dimension) {
            case "os" -> "operatingSystem";
            case "referrer" -> "referrer";
            case "country" -> "country";
            default -> dimension;
        };

        StringBuilder sql = new StringBuilder();
        sql.append("SELECT ").append(column).append(" as ").append(alias);
        sql.append(", count() as count FROM click_events WHERE url_id = ?");

        List<Object> params = new ArrayList<>();
        params.add(urlId);

        if (startDate != null && !startDate.isBlank()) {
            sql.append(" AND timestamp >= parseDateTimeBestEffortOrNull(?)");
            params.add(formatDateTime(startDate));
        }
        if (endDate != null && !endDate.isBlank()) {
            sql.append(" AND timestamp <= parseDateTimeBestEffortOrNull(?)");
            params.add(formatDateTime(endDate));
        }

        // For referrer/country, GROUP BY the raw column
        String groupByCol = switch (dimension) {
            case "referrer" -> "referrer";
            case "country" -> "country";
            default -> column;
        };
        sql.append(" GROUP BY ").append(groupByCol);
        sql.append(" ORDER BY count DESC");
        if (limit > 0) sql.append(" LIMIT ").append(limit);

        // Get total for percentage
        long total = getTotalClicks(urlId, startDate, endDate);
        if (total == 0) return Collections.emptyList();

        List<Map<String, Object>> results = new ArrayList<>();
        try (Connection conn = getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql.toString())) {
            for (int i = 0; i < params.size(); i++) {
                stmt.setString(i + 1, params.get(i).toString());
            }
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    String value = rs.getString(1);
                    long count = rs.getLong("count");
                    double percentage = Math.round(((double) count / total) * 10000.0) / 100.0;

                    row.put(alias, value != null ? value : "unknown");
                    if (dimension.equals("os")) {
                        row.put("os", value != null ? value : "Other");
                    }
                    row.put("clicks", count);
                    row.put("count", count);
                    row.put("percentage", percentage);
                    results.add(row);
                }
            }
        } catch (Exception e) {
            log.warn("ClickHouse {} query failed: {}", dimension, e.getMessage());
        }
        return results;
    }

    private long getTotalClicks(String urlId, String startDate, String endDate) {
        StringBuilder sql = new StringBuilder("SELECT count() as total FROM click_events WHERE url_id = ?");
        List<Object> params = new ArrayList<>();
        params.add(urlId);

        if (startDate != null && !startDate.isBlank()) {
            sql.append(" AND timestamp >= parseDateTimeBestEffortOrNull(?)");
            params.add(formatDateTime(startDate));
        }
        if (endDate != null && !endDate.isBlank()) {
            sql.append(" AND timestamp <= parseDateTimeBestEffortOrNull(?)");
            params.add(formatDateTime(endDate));
        }

        try (Connection conn = getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql.toString())) {
            for (int i = 0; i < params.size(); i++) {
                stmt.setString(i + 1, params.get(i).toString());
            }
            try (ResultSet rs = stmt.executeQuery()) {
                if (rs.next()) return rs.getLong("total");
            }
        } catch (Exception e) {
            log.warn("ClickHouse total clicks query failed: {}", e.getMessage());
        }
        return 0;
    }

    private List<Map<String, Object>> executeGroupByQuery(String sql, List<Object> params, String... columns) {
        List<Map<String, Object>> results = new ArrayList<>();
        try (Connection conn = getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            for (int i = 0; i < params.size(); i++) {
                stmt.setString(i + 1, params.get(i).toString());
            }
            try (ResultSet rs = stmt.executeQuery()) {
                while (rs.next()) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    for (String col : columns) {
                        Object value = rs.getObject(col);
                        if (value instanceof Number n) {
                            row.put(col, n.longValue());
                        } else {
                            row.put(col, value != null ? value.toString() : null);
                        }
                    }
                    results.add(row);
                }
            }
        } catch (Exception e) {
            log.warn("ClickHouse query failed: {}", e.getMessage());
        }
        return results;
    }

    private String sanitizeTimezone(String tz) {
        if (tz != null && tz.matches("^[A-Za-z0-9_\\-+/]+$")) return tz;
        return "Asia/Kolkata";
    }

    private String formatDateTime(String isoDate) {
        try {
            return isoDate.replace("T", " ").replace("Z", "");
        } catch (Exception e) {
            return isoDate;
        }
    }

    public boolean isConfigured() {
        return configured;
    }
}
