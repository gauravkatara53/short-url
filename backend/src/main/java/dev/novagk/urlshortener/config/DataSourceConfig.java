package dev.novagk.urlshortener.config;

import com.zaxxer.hikari.HikariDataSource;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import javax.sql.DataSource;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses DATABASE_URL (including cloud postgresql:// URLs with credentials in URI)
 * into a valid JDBC URL, username, and password acceptable by org.postgresql.Driver and HikariCP.
 */
@Slf4j
@Getter
@Configuration
public class DataSourceConfig {

    @Value("${DATABASE_URL:}")
    private String databaseUrl;

    private String jdbcUrl;
    private String username;
    private String password;

    @Bean
    @Primary
    public DataSource dataSource() {
        parseDatabaseUrl();

        log.info("Configuring PostgreSQL HikariDataSource: jdbcUrl={}, username={}", jdbcUrl, username);

        HikariDataSource ds = new HikariDataSource();
        ds.setJdbcUrl(jdbcUrl);
        ds.setDriverClassName("org.postgresql.Driver");
        if (username != null && !username.isBlank()) {
            ds.setUsername(username);
        }
        if (password != null && !password.isBlank()) {
            ds.setPassword(password);
        }
        ds.setMaximumPoolSize(20);
        ds.setIdleTimeout(30000);
        ds.setConnectionTimeout(20000);

        return ds;
    }

    private void parseDatabaseUrl() {
        String raw = databaseUrl != null ? databaseUrl.trim() : "";

        // Strip surrounding single/double quotes if present from .env
        if ((raw.startsWith("'") && raw.endsWith("'")) || (raw.startsWith("\"") && raw.endsWith("\""))) {
            raw = raw.substring(1, raw.length() - 1).trim();
        }

        if (raw.isBlank()) {
            this.jdbcUrl = "jdbc:postgresql://localhost:5432/neondb";
            return;
        }

        // Pattern matching: [jdbc:]postgres[ql]://[username:password@]host[:port][/database][?query]
        Pattern pattern = Pattern.compile("^(?:jdbc:)?postgres(?:ql)?://(?:([^:]+)(?::([^@]*))?@)?([^/?#]+)(?:/([^?#]*))?(?:\\?(.*))?$");
        Matcher matcher = pattern.matcher(raw);

        if (matcher.matches()) {
            String userGroup = matcher.group(1);
            String passGroup = matcher.group(2);
            String hostPort = matcher.group(3);
            String dbName = matcher.group(4);
            String query = matcher.group(5);

            if (userGroup != null) {
                this.username = URLDecoder.decode(userGroup, StandardCharsets.UTF_8);
            }
            if (passGroup != null) {
                this.password = URLDecoder.decode(passGroup, StandardCharsets.UTF_8);
            }

            StringBuilder urlBuilder = new StringBuilder("jdbc:postgresql://");
            urlBuilder.append(hostPort);
            urlBuilder.append("/");
            urlBuilder.append(dbName != null && !dbName.isBlank() ? dbName : "neondb");

            // Process query parameters
            StringBuilder cleanQuery = new StringBuilder();
            if (query != null && !query.isBlank()) {
                String[] params = query.split("&");
                for (String param : params) {
                    if (param.startsWith("channel_binding=")) continue; // Not supported by JDBC
                    if (cleanQuery.length() > 0) cleanQuery.append("&");
                    cleanQuery.append(param);
                }
            }

            // Ensure sslmode=require for cloud databases if not already present
            if (!cleanQuery.toString().contains("sslmode=")) {
                if (cleanQuery.length() > 0) cleanQuery.append("&");
                cleanQuery.append("sslmode=require");
            }

            if (cleanQuery.length() > 0) {
                urlBuilder.append("?").append(cleanQuery);
            }

            this.jdbcUrl = urlBuilder.toString();
        } else {
            if (!raw.startsWith("jdbc:")) {
                raw = "jdbc:" + raw;
            }
            this.jdbcUrl = raw;
        }
    }
}
