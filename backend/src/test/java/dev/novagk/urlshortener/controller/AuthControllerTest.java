package dev.novagk.urlshortener.controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import dev.novagk.urlshortener.dto.LoginRequest;
import dev.novagk.urlshortener.dto.RegisterRequest;
import dev.novagk.urlshortener.dto.SafeUserDto;
import dev.novagk.urlshortener.exception.AppException;
import dev.novagk.urlshortener.exception.GlobalExceptionHandler;
import dev.novagk.urlshortener.service.AuthService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(MockitoExtension.class)
class AuthControllerTest {

    private MockMvc mockMvc;

    @Mock
    private AuthService authService;

    @InjectMocks
    private AuthController authController;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        mockMvc = MockMvcBuilders.standaloneSetup(authController)
                .setControllerAdvice(new GlobalExceptionHandler())
                .build();
    }

    @Test
    void testRegisterSuccess() throws Exception {
        RegisterRequest req = new RegisterRequest();
        req.setName("Bob");
        req.setEmail("bob@example.com");
        req.setPassword("securePassword123");

        SafeUserDto user = SafeUserDto.builder()
                .id(UUID.randomUUID())
                .name("Bob")
                .email("bob@example.com")
                .created_at(OffsetDateTime.now())
                .build();

        when(authService.register("Bob", "bob@example.com", "securePassword123"))
                .thenReturn(user);

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("User registered successfully"))
                .andExpect(jsonPath("$.data.user.email").value("bob@example.com"));
    }

    @Test
    void testRegisterDuplicateEmailReturns409() throws Exception {
        RegisterRequest req = new RegisterRequest();
        req.setName("Bob");
        req.setEmail("bob@example.com");
        req.setPassword("securePassword123");

        when(authService.register("Bob", "bob@example.com", "securePassword123"))
                .thenThrow(new AppException("Email is already registered", HttpStatus.CONFLICT));

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Email is already registered"));
    }

    @Test
    void testLoginSuccess() throws Exception {
        LoginRequest req = new LoginRequest();
        req.setEmail("bob@example.com");
        req.setPassword("securePassword123");

        when(authService.login(eq("bob@example.com"), eq("securePassword123")))
                .thenReturn(Map.of("token", "jwt-token-xyz"));

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.message").value("Login successful"))
                .andExpect(jsonPath("$.data.token").value("jwt-token-xyz"));
    }

    @Test
    void testLoginInvalidCredentialsReturns401() throws Exception {
        LoginRequest req = new LoginRequest();
        req.setEmail("bob@example.com");
        req.setPassword("wrongPassword");

        when(authService.login(eq("bob@example.com"), eq("wrongPassword")))
                .thenThrow(new AppException("Invalid email or password", HttpStatus.UNAUTHORIZED));

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(req)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Invalid email or password"));
    }
}
