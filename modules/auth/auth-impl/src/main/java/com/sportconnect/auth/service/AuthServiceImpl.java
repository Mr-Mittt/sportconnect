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
import com.sportconnect.user.entity.Role;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.RoleRepository;
import com.sportconnect.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Auth service implementation
 * Note: This is a simplified version that works with user data as generic objects
 * The actual User entity will be in the user module
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
    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final JwtProperties jwtProperties;

    @Override
    @Transactional
    public AuthResponse register(RegisterRequest request) {
        // Check if email already exists
        if (userRepository.existsByEmail(request.getEmail())) {
            throw new BadRequestException("Email already registered");
        }

        // Parse full name into first and last name
        String[] nameParts = request.getFullName().trim().split("\\s+", 2);
        String firstName = nameParts[0];
        String lastName = nameParts.length > 1 ? nameParts[1] : "";

        // Create user
        User user = User.builder()
                .email(request.getEmail())
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .firstName(firstName)
                .lastName(lastName)
                .phoneNumber(request.getPhoneNumber())
                .isEmailVerified(false)
                .isActive(true)
                .build();

        // Assign default USER role
        Role userRole = roleRepository.findByName("USER")
                .orElseThrow(() -> new RuntimeException("Default USER role not found"));
        user.addRole(userRole);

        User savedUser = userRepository.save(user);
        log.info("Registered new user: {}", savedUser.getEmail());

        // Generate tokens
        String accessToken = jwtTokenService.generateAccessToken(savedUser);
        String refreshToken = jwtTokenService.generateRefreshToken(savedUser);

        // Save refresh token
        createRefreshToken(savedUser.getId(), refreshToken);

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(jwtProperties.getExpiration())
                .user(toUserResponse(savedUser))
                .build();
    }

    @Override
    @Transactional
    public AuthResponse login(LoginRequest request) {
        // Find user by email
        User user = userRepository.findByEmail(request.getEmail())
                .orElseThrow(() -> new UnauthorizedException("Invalid email or password"));

        // Check if user is active
        if (!user.getIsActive()) {
            throw new UnauthorizedException("Account is deactivated");
        }

        // Verify password
        if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
            throw new UnauthorizedException("Invalid email or password");
        }

        // Update last login
        user.setLastLoginAt(LocalDateTime.now());
        User updatedUser = userRepository.save(user);

        // Generate tokens
        String accessToken = jwtTokenService.generateAccessToken(updatedUser);
        String refreshToken = jwtTokenService.generateRefreshToken(updatedUser);

        // Save refresh token
        createRefreshToken(updatedUser.getId(), refreshToken);

        log.info("User logged in: {}", updatedUser.getEmail());

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .tokenType("Bearer")
                .expiresIn(jwtProperties.getExpiration())
                .user(toUserResponse(updatedUser))
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

        // Fetch user
        User user = userRepository.findById(refreshToken.getUserId())
                .orElseThrow(() -> new UnauthorizedException("User not found"));

        if (!user.getIsActive()) {
            throw new UnauthorizedException("Account is deactivated");
        }

        // Generate new tokens
        String newAccessToken = jwtTokenService.generateAccessToken(user);
        String newRefreshToken = jwtTokenService.generateRefreshToken(user);

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
     * Will be used once user module is integrated
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
     * Convert User entity to a simple response object
     */
    private Object toUserResponse(User user) {
        return java.util.Map.of(
                "id", user.getId(),
                "email", user.getEmail(),
                "firstName", user.getFirstName() != null ? user.getFirstName() : "",
                "lastName", user.getLastName() != null ? user.getLastName() : "",
                "username", user.getUsername() != null ? user.getUsername() : "",
                "roles", user.getRoles().stream()
                        .map(Role::getName)
                        .toList()
        );
    }
}
