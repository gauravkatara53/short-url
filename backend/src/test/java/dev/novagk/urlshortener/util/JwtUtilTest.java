package dev.novagk.urlshortener.util;

import io.jsonwebtoken.Claims;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class JwtUtilTest {

    private JwtUtil jwtUtil;

    @BeforeEach
    void setUp() {
        jwtUtil = new JwtUtil("my-super-secret-key-at-least-32-chars-long", "7d");
    }

    @Test
    void testSignAndVerifyToken() {
        String userId = "550e8400-e29b-41d4-a716-446655440000";
        String email = "test@example.com";

        String token = jwtUtil.signToken(userId, email);
        assertNotNull(token);
        assertFalse(token.isBlank());

        Claims claims = jwtUtil.verifyToken(token);
        assertNotNull(claims);
        assertEquals(userId, jwtUtil.extractUserId(claims));
        assertEquals(email, jwtUtil.extractEmail(claims));
    }

    @Test
    void testInvalidTokenThrows() {
        assertThrows(Exception.class, () -> jwtUtil.verifyToken("invalid.jwt.token"));
    }
}
