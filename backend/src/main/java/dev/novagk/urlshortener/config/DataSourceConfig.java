package dev.novagk.urlshortener.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.jdbc.DataSourceBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Primary;

import javax.sql.DataSource;

/**
 * Parse the DATABASE_URL env var (postgres:// format) into a JDBC URL for Spring.
 */
@Configuration
public class DataSourceConfig {

    @Value("${DATABASE_URL:}")
    private String databaseUrl;

    @Bean
    @Primary
    public DataSource dataSource() {
        String jdbcUrl;

        if (databaseUrl != null && !databaseUrl.isBlank()) {
            jdbcUrl = convertToJdbc(databaseUrl);
        } else {
            jdbcUrl = "jdbc:postgresql://localhost:5432/neondb";
        }

        return DataSourceBuilder.create()
                .url(jdbcUrl)
                .driverClassName("org.postgresql.Driver")
                .build();
    }

    /**
     * Convert PostgreSQL connection URLs of various formats to JDBC URLs.
     * Handles: postgresql://, postgres://, jdbc:postgresql://, and plain JDBC
     */
    private String convertToJdbc(String url) {
        url = url.trim();

        // Already a JDBC URL
        if (url.startsWith("jdbc:postgresql://")) {
            return url;
        }

        // Strip single quotes that may wrap the value in .env files
        if (url.startsWith("'") && url.endsWith("'")) {
            url = url.substring(1, url.length() - 1);
        }

        // Convert postgres:// or postgresql:// to jdbc:postgresql://
        if (url.startsWith("postgres://")) {
            url = "jdbc:postgresql://" + url.substring("postgres://".length());
        } else if (url.startsWith("postgresql://")) {
            url = "jdbc:postgresql://" + url.substring("postgresql://".length());
        }

        // Remove channel_binding parameter which Java driver doesn't support
        url = url.replaceAll("[&?]channel_binding=[^&]*", "");

        // Replace sslmode=require with ssl=true for JDBC
        url = url.replace("sslmode=require", "ssl=true&sslfactory=org.postgresql.ssl.NonValidatingFactory");

        // Clean up trailing ? or &
        url = url.replaceAll("[?&]$", "");

        return url;
    }
}
