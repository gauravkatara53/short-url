package dev.novagk.urlshortener.util;

import io.jsonwebtoken.*;
import io.jsonwebtoken.security.Keys;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.Date;
import java.util.HashMap;
import java.util.Map;

/**
 * JWT utility matching the Node.js jwt.ts — signs with HS256, includes id and email claims.
 */
@Slf4j
@Component
public class JwtUtil {

    private final SecretKey signingKey;
    private final long expirationMs;

    public JwtUtil(
            @Value("${app.jwt.secret}") String secret,
            @Value("${app.jwt.expires-in}") String expiresIn) {
        // Pad to at least 32 bytes for HS256
        String paddedSecret = secret;
        while (paddedSecret.getBytes(StandardCharsets.UTF_8).length < 32) {
            paddedSecret = paddedSecret + paddedSecret;
        }
        this.signingKey = Keys.hmacShaKeyFor(paddedSecret.getBytes(StandardCharsets.UTF_8));
        this.expirationMs = parseDuration(expiresIn);
    }

    /**
     * Sign a JWT with id and email as claims — compatible with the Node.js tokens.
     */
    public String signToken(String userId, String email) {
        Map<String, Object> claims = new HashMap<>();
        claims.put("id", userId);
        claims.put("email", email);

        return Jwts.builder()
                .claims(claims)
                .issuedAt(new Date())
                .expiration(new Date(System.currentTimeMillis() + expirationMs))
                .signWith(signingKey, Jwts.SIG.HS256)
                .compact();
    }

    /**
     * Verify and decode a JWT, returning the claims.
     */
    public Claims verifyToken(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    public String extractUserId(Claims claims) {
        return claims.get("id", String.class);
    }

    public String extractEmail(Claims claims) {
        return claims.get("email", String.class);
    }

    /**
     * Parse duration strings like "7d", "24h", "60m", "3600s".
     */
    private long parseDuration(String duration) {
        if (duration == null || duration.isBlank()) {
            return 7L * 24 * 60 * 60 * 1000; // 7 days default
        }

        duration = duration.trim().toLowerCase();

        try {
            if (duration.endsWith("d")) {
                return Long.parseLong(duration.replace("d", "")) * 24 * 60 * 60 * 1000;
            } else if (duration.endsWith("h")) {
                return Long.parseLong(duration.replace("h", "")) * 60 * 60 * 1000;
            } else if (duration.endsWith("m")) {
                return Long.parseLong(duration.replace("m", "")) * 60 * 1000;
            } else if (duration.endsWith("s")) {
                return Long.parseLong(duration.replace("s", "")) * 1000;
            } else {
                return Long.parseLong(duration) * 1000; // Assume seconds
            }
        } catch (NumberFormatException e) {
            log.warn("Invalid JWT duration: '{}', defaulting to 7d", duration);
            return 7L * 24 * 60 * 60 * 1000;
        }
    }
}
