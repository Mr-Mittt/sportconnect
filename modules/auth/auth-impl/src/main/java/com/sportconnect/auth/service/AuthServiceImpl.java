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
import com.sportconnect.common.exception.ConflictException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.common.exception.UnauthorizedException;
import com.sportconnect.user.api.dto.CredentialCheck;
import com.sportconnect.user.api.dto.UserRegistrationDetails;
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
            throw new ConflictException("EMAIL_ALREADY_REGISTERED", "Email already registered", null);
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
                request.getPhoneNumber(),
                // U16: the optional language / country / region / coordinates. Validated inside createUser, before
                // the user is saved, so a bad selection is a 400 that creates nothing.
                UserRegistrationDetails.builder()
                        .languageCode(request.getLanguageCode())
                        .countryId(request.getCountryId())
                        .regionId(request.getRegionId())
                        .latitude(request.getLatitude())
                        .longitude(request.getLongitude())
                        .build()
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
        CredentialCheck check = userService.verifyCredentials(request.getEmail(), request.getPassword());
        if (check == CredentialCheck.NO_MATCH) {
            throw new UnauthorizedException("INVALID_CREDENTIALS", "Invalid email or password", null);
        }
        if (check == CredentialCheck.MATCH_INACTIVE) {
            // A9: only reachable with the correct password, so this does not reveal account state to a
            // stranger. No tokens; the client may offer reactivate().
            throw new UnauthorizedException("ACCOUNT_DEACTIVATED", "Account is deactivated", null);
        }

        return startSession(userService.getUserByEmail(request.getEmail()));
    }

    @Override
    @Transactional
    public AuthResponse reactivate(LoginRequest request) {
        CredentialCheck check = userService.verifyCredentials(request.getEmail(), request.getPassword());
        if (check == CredentialCheck.NO_MATCH) {
            throw new UnauthorizedException("INVALID_CREDENTIALS", "Invalid email or password", null);
        }

        UserResponse user = check == CredentialCheck.MATCH_INACTIVE
                ? userService.reactivateUserByEmail(request.getEmail())
                : userService.getUserByEmail(request.getEmail());
        return startSession(user);
    }

    /** Stamps the last login, mints the access/refresh pair and stores the refresh token (login and reactivate). */
    private AuthResponse startSession(UserResponse user) {
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

    /**
     * Rotates a refresh token. Failures are 401s with registered codes (A8): {@code REFRESH_TOKEN_INVALID} (unknown
     * token) and {@code REFRESH_TOKEN_EXPIRED_OR_REVOKED}. A9: a user who is deactivated (or gone) at the moment of
     * the refresh -- the race U12 closed, or a token that was never revoked -- also gets
     * {@code REFRESH_TOKEN_EXPIRED_OR_REVOKED}: the generic "you have been logged out, log in again", never
     * {@code ACCOUNT_DEACTIVATED} (that is login's, where the user can choose to re-activate) and never a 404 that
     * leaks the user id.
     */
    @Override
    @Transactional
    public AuthResponse refreshToken(String refreshTokenString) {
        RefreshToken refreshToken = refreshTokenRepository.findByToken(refreshTokenString)
                .orElseThrow(() -> new UnauthorizedException("REFRESH_TOKEN_INVALID", "Invalid refresh token", null));

        if (!refreshToken.isValid()) {
            throw new UnauthorizedException("REFRESH_TOKEN_EXPIRED_OR_REVOKED", "Refresh token expired or revoked", null);
        }

        // U12: locks the user row (PESSIMISTIC_READ, held for this whole transaction) BEFORE
        // touching refresh_tokens below — deliberately the same "users row first, refresh_tokens
        // second" order UserServiceImpl.deleteUser() uses (PESSIMISTIC_WRITE on the same row), so
        // the two can never deadlock on each other. This also closes the race where a concurrent
        // deactivation's stale-read window would otherwise let this method mint a fresh token pair
        // for an account that's being deactivated at that exact moment: this call now blocks until
        // any in-flight deleteUser() for this user fully commits, then correctly observes
        // isActive = false instead of racing ahead on stale data.
        UUID userId = refreshToken.getUserId();
        UserResponse user;
        try {
            user = userService.getActiveUserForUpdate(userId);
        } catch (ResourceNotFoundException e) {
            // A9: getActiveUserForUpdate throws this for an inactive user. Answer with the same generic 401 as a
            // revoked token; the 404 would leak the user id and the code does not belong to a refresh.
            throw new UnauthorizedException("REFRESH_TOKEN_EXPIRED_OR_REVOKED", "Refresh token expired or revoked", null);
        }

        // Mark old token as revoked
        refreshToken.setRevoked(true);
        refreshTokenRepository.save(refreshToken);

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
