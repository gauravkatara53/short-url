package dev.novagk.urlshortener.service;

import dev.novagk.urlshortener.dto.SafeUserDto;
import dev.novagk.urlshortener.entity.UserEntity;
import dev.novagk.urlshortener.exception.AppException;
import dev.novagk.urlshortener.repository.UserRepository;
import dev.novagk.urlshortener.util.JwtUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private PasswordEncoder passwordEncoder;

    @Mock
    private JwtUtil jwtUtil;

    @InjectMocks
    private AuthService authService;

    private UserEntity sampleUser;

    @BeforeEach
    void setUp() {
        sampleUser = UserEntity.builder()
                .id(UUID.randomUUID())
                .name("Alice")
                .email("alice@example.com")
                .passwordHash("$2a$12$hashedPassword")
                .build();
    }

    @Test
    void testRegisterSuccess() {
        when(userRepository.existsByEmail("alice@example.com")).thenReturn(false);
        when(passwordEncoder.encode("password123")).thenReturn("$2a$12$hashedPassword");
        when(userRepository.save(any(UserEntity.class))).thenReturn(sampleUser);

        SafeUserDto dto = authService.register("Alice", "alice@example.com", "password123");
        assertNotNull(dto);
        assertEquals(sampleUser.getId(), dto.getId());
        assertEquals("alice@example.com", dto.getEmail());
        assertEquals("Alice", dto.getName());
    }

    @Test
    void testRegisterDuplicateEmail() {
        when(userRepository.existsByEmail("alice@example.com")).thenReturn(true);

        AppException ex = assertThrows(AppException.class, () ->
                authService.register("Alice", "alice@example.com", "password123"));
        assertEquals(HttpStatus.CONFLICT, ex.getStatus());
        assertEquals("Email is already registered", ex.getMessage());
    }

    @Test
    void testLoginSuccess() {
        when(userRepository.findByEmail("alice@example.com")).thenReturn(Optional.of(sampleUser));
        when(passwordEncoder.matches("password123", sampleUser.getPasswordHash())).thenReturn(true);
        when(jwtUtil.signToken(sampleUser.getId().toString(), sampleUser.getEmail())).thenReturn("mock.jwt.token");

        Map<String, Object> result = authService.login("alice@example.com", "password123");
        assertNotNull(result);
        assertEquals("mock.jwt.token", result.get("token"));
        assertTrue(result.containsKey("user"));
    }

    @Test
    void testLoginInvalidPassword() {
        when(userRepository.findByEmail("alice@example.com")).thenReturn(Optional.of(sampleUser));
        when(passwordEncoder.matches("wrongpass", sampleUser.getPasswordHash())).thenReturn(false);

        AppException ex = assertThrows(AppException.class, () ->
                authService.login("alice@example.com", "wrongpass"));
        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatus());
    }

    @Test
    void testLoginUserNotFound() {
        when(userRepository.findByEmail("nobody@example.com")).thenReturn(Optional.empty());

        AppException ex = assertThrows(AppException.class, () ->
                authService.login("nobody@example.com", "password123"));
        assertEquals(HttpStatus.UNAUTHORIZED, ex.getStatus());
    }
}
