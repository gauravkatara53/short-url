package dev.novagk.urlshortener.controller;

import dev.novagk.urlshortener.dto.ApiResponse;
import dev.novagk.urlshortener.dto.LoginRequest;
import dev.novagk.urlshortener.dto.RegisterRequest;
import dev.novagk.urlshortener.dto.SafeUserDto;
import dev.novagk.urlshortener.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Controller for authentication endpoints matching Node.js auth.controller.ts.
 */
@Slf4j
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<Map<String, SafeUserDto>>> register(@Valid @RequestBody RegisterRequest request) {
        log.info("Registration attempt for email: {}", request.getEmail());
        SafeUserDto user = authService.register(request.getName(), request.getEmail(), request.getPassword());
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ApiResponse.success(Map.of("user", user), "User registered successfully"));
    }

    @PostMapping("/login")
    public ResponseEntity<ApiResponse<Map<String, Object>>> login(@Valid @RequestBody LoginRequest request) {
        log.info("Login attempt for email: {}", request.getEmail());
        Map<String, Object> result = authService.login(request.getEmail(), request.getPassword());
        return ResponseEntity.ok(ApiResponse.success(result, "Login successful"));
    }
}
