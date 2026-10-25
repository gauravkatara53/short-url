package dev.novagk.urlshortener.view;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RedirectSplashViewTest {

    @Test
    void testRenderSplashHtml() {
        String html = RedirectSplashView.render("abc1234", "https://google.com/search?q=spring", 5);
        assertNotNull(html);
        assertTrue(html.contains("<!DOCTYPE html>"));
        assertTrue(html.contains("Redirecting to google.com"));
        assertTrue(html.contains("https://google.com/search?q=spring"));
        assertTrue(html.contains("/abc1234"));
        assertTrue(html.contains("ClickStream"));
        assertTrue(html.contains("timerRing"));
    }

    @Test
    void testRenderSplashEscapesHtml() {
        String html = RedirectSplashView.render("test<script>", "https://example.com/?a=<script>alert(1)</script>", 5);
        assertNotNull(html);
        assertTrue(html.contains("test&lt;script&gt;"));
        assertTrue(html.contains("&lt;script&gt;alert(1)&lt;/script&gt;"));
        assertFalse(html.contains("</script><script>"));
    }
}
