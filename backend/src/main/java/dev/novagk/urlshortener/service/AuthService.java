package dev.novagk.urlshortener.service;

import dev.novagk.urlshortener.dto.SafeUserDto;
import dev.novagk.urlshortener.entity.UserEntity;
import dev.novagk.urlshortener.exception.AppException;
import dev.novagk.urlshortener.repository.UserRepository;
import dev.novagk.urlshortener.util.JwtUtil;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtUtil jwtUtil;

    /**
     * Register a new user. Returns safe user data (no password hash).
     */
    public SafeUserDto register(String name, String email, String password) {
        email = email.toLowerCase().trim();
        name = name.trim();

        if (userRepository.existsByEmail(email)) {
            throw new AppException("Email is already registered", HttpStatus.CONFLICT);
        }

        String passwordHash = passwordEncoder.encode(password);

        UserEntity user = UserEntity.builder()
                .name(name)
                .email(email)
                .passwordHash(passwordHash)
                .build();

        user = userRepository.save(user);
        log.info("User registered: id={}, email={}", user.getId(), user.getEmail());

        return toSafeUser(user);
    }

    /**
     * Login a user. Returns safe user data + JWT.
     */
    public Map<String, Object> login(String email, String password) {
        email = email.toLowerCase().trim();

        UserEntity user = userRepository.findByEmail(email)
                .orElseThrow(() -> new AppException("Invalid email or password", HttpStatus.UNAUTHORIZED));

        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new AppException("Invalid email or password", HttpStatus.UNAUTHORIZED);
        }

        String token = jwtUtil.signToken(user.getId().toString(), user.getEmail());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("user", toSafeUser(user));
        result.put("token", token);
        return result;
    }

    private SafeUserDto toSafeUser(UserEntity user) {
        return SafeUserDto.builder()
                .id(user.getId())
                .name(user.getName())
                .email(user.getEmail())
                .created_at(user.getCreatedAt())
                .updated_at(user.getUpdatedAt())
                .build();
    }
}
