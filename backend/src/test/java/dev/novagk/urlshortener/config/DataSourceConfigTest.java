package dev.novagk.urlshortener.config;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import javax.sql.DataSource;
import java.sql.SQLException;

import static org.junit.jupiter.api.Assertions.*;

class DataSourceConfigTest {

    @Test
    void testNeonUrlParsing() throws SQLException {
        DataSourceConfig config = new DataSourceConfig();
        String neonUrl = "postgresql://neondb_owner:npg_T6NZwp7hvVkM@ep-dawn-glitter-b4vt322w-pooler.c-6.us-east-2.aws.neon.tech/neondb?sslmode=require";
        ReflectionTestUtils.setField(config, "databaseUrl", neonUrl);

        DataSource ds = config.dataSource();
        assertNotNull(ds);

        // Verify driver accepts the URL
        org.postgresql.Driver driver = new org.postgresql.Driver();
        String jdbcUrl = (String) ReflectionTestUtils.invokeMethod(config, "getJdbcUrl");
        String username = (String) ReflectionTestUtils.invokeMethod(config, "getUsername");
        String password = (String) ReflectionTestUtils.invokeMethod(config, "getPassword");

        assertTrue(driver.acceptsURL(jdbcUrl), "Postgres driver must accept the parsed JDBC URL: " + jdbcUrl);
        assertEquals("neondb_owner", username);
        assertEquals("npg_T6NZwp7hvVkM", password);
        assertFalse(jdbcUrl.contains("@"), "JDBC URL must not contain '@'");
        assertTrue(jdbcUrl.startsWith("jdbc:postgresql://ep-dawn-glitter-b4vt322w-pooler.c-6.us-east-2.aws.neon.tech/neondb"));
    }
}
