package com.sportconnect.auth.service;

import com.sportconnect.auth.api.dto.AuthResponse;
import com.sportconnect.auth.config.JwtProperties;
import com.sportconnect.auth.api.dto.LoginRequest;
import com.sportconnect.auth.api.dto.RegisterRequest;
import com.sportconnect.auth.api.service.AuthService;
import com.sportconnect.auth.api.service.JwtTokenService;
import com.sportconnect.auth.entity.RefreshToken;
import com.sportconnect.auth.repository.EmailVerificationRepository;
import com.sportconnect.auth.repository.PasswordResetTokenRepository;
import com.sportconnect.auth.repository.RefreshTokenRepository;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.UnauthorizedException;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Auth service implementation
 * Decoupled from user-impl, now depends only on user-api
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AuthServiceImpl implements AuthService {

    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtTokenService jwtTokenService;
    private final EmailService emailService;
    private final EmailVerificationRepository emailVerificationRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final UserService userService;
    private final JwtProperties jwtProperties;

    @Override
    @Transactional
    public AuthResponse register(RegisterRequest request) {
        // Check if email already exists
        if (userService.existsByEmail(request.getEmail())) {
            throw new BadRequestException("Email already registered");
        }

        // Parse full name into first and last name
        String[] nameParts = request.getFullName().trim().split("\\s+", 2);
        String firstName = nameParts[0];
        String lastName = nameParts.length > 1 ? nameParts[1] : "";

        // Create user via UserService
        String encodedPassword = passwordEncoder.encode(request.getPassword());
        UserResponse userResponse = userService.createUser(
                request.getEmail(),
                encodedPassword,
                firstName,
                lastName,
                request.getPhoneNumber()
        );

        log.info("Registered new user: {}", userResponse.getEmail());

        // Generate tokens
        String accessToken = jwtTokenService.generateAccessToken(toTokenData(userResponse));
        String refreshToken = jwtTokenService.generateRefreshToken(toTokenData(userResponse));

        // Save refresh token
        createRefreshToken(userResponse.getId(), refreshToken);

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(jwtProperties.getExpiration())
                .user(toUserResponse(userResponse))
                .build();
    }

    @Override
    @Transactional
    public AuthResponse login(LoginRequest request) {
        // Verify password via UserService
        if (!userService.verifyPassword(request.getEmail(), request.getPassword())) {
            throw new UnauthorizedException("Invalid email or password");
        }

        // Get user by email
        UserResponse user = userService.getUserByEmail(request.getEmail());

        // Update last login
        userService.updateLastLogin(user.getId());

        log.info("User logged in: {}", user.getEmail());

        // Generate tokens
        String accessToken = jwtTokenService.generateAccessToken(toTokenData(user));
        String refreshToken = jwtTokenService.generateRefreshToken(toTokenData(user));

        // Save refresh token
        createRefreshToken(user.getId(), refreshToken);

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(jwtProperties.getExpiration())
                .user(toUserResponse(user))
                .build();
    }

    @Override
    @Transactional
    public AuthResponse refreshToken(String refreshTokenString) {
        RefreshToken refreshToken = refreshTokenRepository.findByToken(refreshTokenString)
                .orElseThrow(() -> new UnauthorizedException("Invalid refresh token"));

        if (!refreshToken.isValid()) {
            throw new UnauthorizedException("Refresh token expired or revoked");
        }

        // Mark old token as revoked
        refreshToken.setRevoked(true);
        refreshTokenRepository.save(refreshToken);

        // Fetch user via UserService
        UUID userId = refreshToken.getUserId();
        UserResponse user = userService.getUserById(userId);

        if (!user.getIsActive()) {
            throw new UnauthorizedException("Account is deactivated");
        }

        // Generate new tokens
        String newAccessToken = jwtTokenService.generateAccessToken(toTokenData(user));
        String newRefreshToken = jwtTokenService.generateRefreshToken(toTokenData(user));

        // Save new refresh token
        createRefreshToken(user.getId(), newRefreshToken);

        log.info("Refreshed tokens for user: {}", user.getEmail());

        return AuthResponse.builder()
                .accessToken(newAccessToken)
                .refreshToken(newRefreshToken)
                .tokenType("Bearer")
                .expiresIn(jwtProperties.getExpiration())
                .user(toUserResponse(user))
                .build();
    }

    @Override
    @Transactional
    public void logout(UUID userId) {
        refreshTokenRepository.revokeAllUserTokens(userId, LocalDateTime.now());
        log.info("Logged out user: {}", userId);
    }

    /**
     * Helper method to create refresh token
     */
    protected String createRefreshToken(UUID userId, String tokenString) {
        LocalDateTime expiresAt = LocalDateTime.now()
                .plusSeconds(jwtTokenService.getRefreshExpiration() / 1000);

        RefreshToken refreshToken = RefreshToken.builder()
                .token(tokenString)
                .userId(userId)
                .expiresAt(expiresAt)
                .build();

        refreshTokenRepository.save(refreshToken);
        return tokenString;
    }

    /**
     * Convert UserResponse to token data format for JWT generation
     */
    private Map<String, Object> toTokenData(UserResponse user) {
        return Map.of(
                "id", user.getId(),
                "email", user.getEmail(),
                "username", user.getUsername() != null ? user.getUsername() : "",
                "roles", user.getRoles()
        );
    }

    /**
     * Convert UserResponse to a simple response object for AuthResponse.user. A mutable map (not
     * {@code Map.of}) is required here because avatarUrl/phoneNumber are frequently absent for a
     * new user — {@code Map.of} throws on any null value, so the previously-Map.of-only version of
     * this method could never have carried those two fields safely.
     */
    private Object toUserResponse(UserResponse user) {
        Map<String, Object> response = new HashMap<>();
        response.put("id", user.getId());
        response.put("email", user.getEmail());
        response.put("firstName", user.getFirstName() != null ? user.getFirstName() : "");
        response.put("lastName", user.getLastName() != null ? user.getLastName() : "");
        response.put("username", user.getUsername() != null ? user.getUsername() : "");
        response.put("phoneNumber", user.getPhoneNumber());
        response.put("avatarUrl", user.getAvatarUrl());
        response.put("roles", user.getRoles());
        return response;
    }
}
