package dev.novagk.urlshortener.util;

import java.security.SecureRandom;

/**
 * Generates cryptographically random short codes using Base62 characters.
 * Equivalent to the Node.js shortCode.ts utility.
 */
public final class ShortCodeGenerator {

    private static final String BASE62 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    private static final SecureRandom RANDOM = new SecureRandom();

    private ShortCodeGenerator() {
    }

    public static String generate(int length) {
        StringBuilder sb = new StringBuilder(length);
        byte[] bytes = new byte[length];
        RANDOM.nextBytes(bytes);
        for (int i = 0; i < length; i++) {
            sb.append(BASE62.charAt((bytes[i] & 0xFF) % BASE62.length()));
        }
        return sb.toString();
    }
}
