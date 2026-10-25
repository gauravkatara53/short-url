package dev.novagk.urlshortener.util;

import org.junit.jupiter.api.Test;

import java.util.HashSet;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.*;

class ShortCodeGeneratorTest {

    @Test
    void testDefaultLength() {
        String code = ShortCodeGenerator.generate(7);
        assertNotNull(code);
        assertEquals(7, code.length());
        assertTrue(code.matches("^[0-9a-zA-Z]{7}$"));
    }

    @Test
    void testCustomLength() {
        for (int len : new int[]{5, 8, 12}) {
            String code = ShortCodeGenerator.generate(len);
            assertEquals(len, code.length());
            assertTrue(code.matches("^[0-9a-zA-Z]+$"));
        }
    }

    @Test
    void testUniqueness() {
        Set<String> set = new HashSet<>();
        for (int i = 0; i < 1000; i++) {
            set.add(ShortCodeGenerator.generate(7));
        }
        assertEquals(1000, set.size(), "1000 generated short codes should all be distinct");
    }
}
