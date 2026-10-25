package dev.novagk.urlshortener.service;

import dev.novagk.urlshortener.entity.UrlEntity;
import dev.novagk.urlshortener.exception.AppException;
import dev.novagk.urlshortener.repository.UrlRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class UrlServiceTest {

    @Mock
    private UrlRepository urlRepository;

    @Mock
    private CacheService cacheService;

    @InjectMocks
    private UrlService urlService;

    private UUID userId;
    private UrlEntity sampleUrl;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(urlService, "baseUrl", "https://novagk.dev");
        ReflectionTestUtils.setField(urlService, "shortCodeLength", 7);

        userId = UUID.randomUUID();
        sampleUrl = UrlEntity.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .originalUrl("https://example.com/long/path")
                .shortCode("abc1234")
                .createdAt(OffsetDateTime.now())
                .updatedAt(OffsetDateTime.now())
                .build();
    }

    @Test
    void testCreateUrlSuccess() {
        when(urlRepository.existsByShortCode(any())).thenReturn(false);
        when(urlRepository.save(any(UrlEntity.class))).thenAnswer(invocation -> {
            UrlEntity entity = invocation.getArgument(0);
            entity.setId(UUID.randomUUID());
            return entity;
        });

        Map<String, Object> result = urlService.createUrl(userId.toString(), "https://example.com/target", null);
        assertNotNull(result);
        assertTrue(result.containsKey("shortUrl"));
        assertTrue(result.containsKey("url"));
        assertTrue(((String) result.get("shortUrl")).startsWith("https://novagk.dev/"));
    }

    @Test
    void testCreateUrlDangerousProtocol() {
        AppException ex = assertThrows(AppException.class, () ->
                urlService.createUrl(userId.toString(), "javascript:alert(1)", null));
        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatus());
    }

    @Test
    void testResolveShortCodeCacheHit() {
        when(cacheService.getUrl("abc1234"))
                .thenReturn(new CacheService.CachedUrl("https://example.com/cached", "some-uuid"));

        UrlService.ResolvedUrl resolved = urlService.resolveShortCode("abc1234");
        assertNotNull(resolved);
        assertEquals("cache", resolved.source());
        assertEquals("https://example.com/cached", resolved.originalUrl());
        verify(urlRepository, never()).findByShortCode(any());
    }

    @Test
    void testResolveShortCodeCacheMissDbHit() {
        when(cacheService.getUrl("abc1234")).thenReturn(null);
        when(urlRepository.findByShortCode("abc1234")).thenReturn(Optional.of(sampleUrl));

        UrlService.ResolvedUrl resolved = urlService.resolveShortCode("abc1234");
        assertNotNull(resolved);
        assertEquals("postgres", resolved.source());
        assertEquals(sampleUrl.getOriginalUrl(), resolved.originalUrl());
        verify(cacheService).setUrl(eq("abc1234"), any());
    }

    @Test
    void testResolveShortCodeNotFound() {
        when(cacheService.getUrl("unknown")).thenReturn(null);
        when(urlRepository.findByShortCode("unknown")).thenReturn(Optional.empty());

        AppException ex = assertThrows(AppException.class, () -> urlService.resolveShortCode("unknown"));
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatus());
    }

    @Test
    void testResolveShortCodeExpired() {
        sampleUrl.setExpiresAt(OffsetDateTime.now().minusHours(1));
        when(cacheService.getUrl("expired")).thenReturn(null);
        when(urlRepository.findByShortCode("expired")).thenReturn(Optional.of(sampleUrl));

        AppException ex = assertThrows(AppException.class, () -> urlService.resolveShortCode("expired"));
        assertEquals(HttpStatus.GONE, ex.getStatus());
    }

    @Test
    void testDeleteUrlSuccess() {
        when(urlRepository.findById(sampleUrl.getId())).thenReturn(Optional.of(sampleUrl));

        urlService.deleteUrl(sampleUrl.getId().toString(), userId.toString());
        verify(urlRepository).deleteById(sampleUrl.getId());
        verify(cacheService).deleteUrl(sampleUrl.getShortCode());
    }

    @Test
    void testDeleteUrlNotOwner() {
        when(urlRepository.findById(sampleUrl.getId())).thenReturn(Optional.of(sampleUrl));

        UUID otherUserId = UUID.randomUUID();
        AppException ex = assertThrows(AppException.class, () ->
                urlService.deleteUrl(sampleUrl.getId().toString(), otherUserId.toString()));
        assertEquals(HttpStatus.FORBIDDEN, ex.getStatus());
        verify(urlRepository, never()).deleteById(any());
    }

    @Test
    void testGetUserUrlsPagination() {
        when(urlRepository.findByUserIdOrderByCreatedAtDesc(eq(userId), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(sampleUrl)));

        Map<String, Object> result = urlService.getUserUrls(userId.toString(), 1, 10);
        assertNotNull(result);
        assertTrue(result.containsKey("urls"));
        assertTrue(result.containsKey("pagination"));
        List<?> urls = (List<?>) result.get("urls");
        assertEquals(1, urls.size());
    }
}
