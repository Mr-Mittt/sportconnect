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
import com.sportconnect.common.exception.ServiceUnavailableException;
import com.sportconnect.common.exception.UnauthorizedException;
import com.sportconnect.user.api.dto.CredentialCheck;
import com.sportconnect.user.api.dto.ExternalIdentity;
import com.sportconnect.user.api.dto.UserAccessState;
import com.sportconnect.user.api.dto.UserRegistrationDetails;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
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
    private final EmailVerificationRepository emailVerificationRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final UserService userService;
    private final JwtProperties jwtProperties;
    private final KeycloakTokenClient keycloak;
    private final JwtDecoder jwtDecoder;
    private final ReactivationTicketStore reactivationTickets;

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
     * {@inheritDoc}
     *
     * <p>Flow: exchange the code; verify the access token Keycloak returned (the same decoder every request goes
     * through) and read the subject and claims; provision or load the {@code users} row; then apply the deactivation
     * rule, telling a social sign-in from a password one by the {@code identity_provider} claim the realm's
     * session-note mapper puts in the token (absent for a password login).
     *
     * <p>Any failure after the exchange except the deliberate {@code ACCOUNT_DEACTIVATED} ends the Keycloak session
     * again: otherwise the user's next attempt would sign in silently and land on the same failure.
     */
    @Override
    public AuthResponse callback(String code, String codeVerifier) {
        KeycloakTokens tokens = keycloak.exchangeCode(code, codeVerifier);
        UserResponse user;
        try {
            Jwt jwt = verify(tokens.accessToken());
            UUID userId = subjectOf(jwt);
            boolean social = jwt.getClaimAsString("identity_provider") != null;
            user = provision(identityOf(jwt, userId));
            if (!Boolean.TRUE.equals(user.getIsActive()) && social) {
                // A social sign-in is the user's own confirmation that they are back.
                user = userService.reactivateUser(userId);
            }
            if (Boolean.TRUE.equals(user.getIsActive())) {
                userService.updateLastLogin(userId);
            }
        } catch (RuntimeException e) {
            endSessionQuietly(tokens.refreshToken());
            throw e;
        }

        if (!Boolean.TRUE.equals(user.getIsActive())) {
            String ticket;
            try {
                ticket = reactivationTickets.issue(user.getId(), tokens.refreshToken());
            } catch (RuntimeException e) {
                endSessionQuietly(tokens.refreshToken());
                throw e;
            }
            log.info("Deactivated user {} signed in with a password; re-activation ticket issued", user.getId());
            throw new UnauthorizedException("ACCOUNT_DEACTIVATED", "Account is deactivated",
                    Map.of("reactivationTicket", ticket));
        }
        log.info("User signed in through Keycloak: {}", user.getId());
        return sessionOf(tokens, user);
    }

    /** {@inheritDoc} The ticket is consumed first (single use); the account is reactivated only once its Keycloak session proved alive. */
    @Override
    public AuthResponse reactivate(String ticket) {
        ReactivationTicketStore.Ticket parked = reactivationTickets.consume(ticket)
                .orElseThrow(AuthServiceImpl::ticketInvalid);
        KeycloakTokens tokens;
        try {
            tokens = keycloak.refresh(parked.refreshToken());
        } catch (UnauthorizedException e) {
            // The parked session ended in the meantime (idle timeout, or another logout).
            throw ticketInvalid();
        }
        try {
            if (!parked.userId().equals(subjectOf(verify(tokens.accessToken())))) {
                throw ticketInvalid();
            }
            UserResponse user = userService.reactivateUser(parked.userId());
            userService.updateLastLogin(user.getId());
            log.info("Re-activated user {} with a ticket", user.getId());
            return sessionOf(tokens, user);
        } catch (RuntimeException e) {
            endSessionQuietly(tokens.refreshToken());
            throw e;
        }
    }

    /** {@inheritDoc} Never reveals whether the ticket existed. */
    @Override
    public void cancelReactivation(String ticket) {
        reactivationTickets.consume(ticket).ifPresent(parked -> endSessionQuietly(parked.refreshToken()));
    }

    /**
     * {@inheritDoc}
     *
     * <p>The cookie's token is Keycloak's. After the refresh grant the new access token goes through the same gate as
     * every request ({@code getAccessState}); a user who is gone or deactivated ends the session and gets the generic
     * "logged out" 401, never {@code ACCOUNT_DEACTIVATED} (that is the sign-in's, where the user can choose to come
     * back) and never a 404 that would leak the id.
     */
    @Override
    public AuthResponse refreshToken(String refreshTokenString) {
        KeycloakTokens tokens = keycloak.refresh(refreshTokenString);
        UUID userId;
        try {
            userId = subjectOf(verify(tokens.accessToken()));
        } catch (RuntimeException e) {
            endSessionQuietly(tokens.refreshToken());
            throw e;
        }
        Optional<UserAccessState> state = userService.getAccessState(userId);
        if (state.isEmpty() || !state.get().isActive()) {
            endSessionQuietly(tokens.refreshToken());
            throw new UnauthorizedException("REFRESH_TOKEN_EXPIRED_OR_REVOKED", "Refresh token expired or revoked", null);
        }
        UserResponse user = userService.getUserById(userId);
        log.info("Refreshed tokens for user: {}", userId);
        return sessionOf(tokens, user);
    }

    @Override
    public void endSession(String refreshToken) {
        keycloak.endSession(refreshToken);
    }

    private static UnauthorizedException ticketInvalid() {
        return new UnauthorizedException("REACTIVATION_TICKET_INVALID",
                "The re-activation request is invalid or has expired", null);
    }

    /**
     * A token Keycloak itself just handed us must verify; if it does not (issuer, audience or key mismatch) this app is
     * misconfigured, which is a 503 for the user, not a 401 they could fix by signing in again.
     */
    private Jwt verify(String accessToken) {
        try {
            return jwtDecoder.decode(accessToken);
        } catch (JwtException e) {
            log.error("A token issued by Keycloak failed verification: {}", e.getMessage());
            throw new ServiceUnavailableException("The identity provider's token could not be verified", e);
        }
    }

    private static UUID subjectOf(Jwt jwt) {
        try {
            return UUID.fromString(jwt.getSubject());
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new ServiceUnavailableException("The identity provider's token has no usable subject", e);
        }
    }

    private static ExternalIdentity identityOf(Jwt jwt, UUID userId) {
        return ExternalIdentity.builder()
                .id(userId)
                .email(jwt.getClaimAsString("email"))
                .emailVerified(Boolean.TRUE.equals(jwt.getClaimAsBoolean("email_verified")))
                .username(jwt.getClaimAsString("preferred_username"))
                .firstName(jwt.getClaimAsString("given_name"))
                .lastName(jwt.getClaimAsString("family_name"))
                .fullName(jwt.getClaimAsString("name"))
                .phoneNumber(jwt.getClaimAsString("phone_number"))
                .languageCode(jwt.getClaimAsString("locale"))
                .build();
    }

    /**
     * Provisioning in its own transaction (inside {@code UserService}). Two first sign-ins for one subject can race; the
     * loser fails on the primary key, or on the winner's email or phone (the same person, so those surface as a 409
     * here), and a second call then simply finds the winner's row by id. A genuine clash (another account holds the
     * email or phone) fails the same way again and is rethrown by that second call.
     */
    private UserResponse provision(ExternalIdentity identity) {
        try {
            return userService.provisionExternalUser(identity);
        } catch (DataIntegrityViolationException | ConflictException e) {
            log.info("First sign-in for {} lost a race or clashed ({}); re-reading the account", identity.getId(), e.getClass().getSimpleName());
            return userService.provisionExternalUser(identity);
        }
    }

    private void endSessionQuietly(String refreshToken) {
        try {
            keycloak.endSession(refreshToken);
        } catch (RuntimeException e) {
            log.warn("Could not end the Keycloak session: {}", e.getMessage());
        }
    }

    /** The response of any successful sign-in or refresh: the access token in the body, the refresh token for the cookie. */
    private AuthResponse sessionOf(KeycloakTokens tokens, UserResponse user) {
        return AuthResponse.builder()
                .accessToken(tokens.accessToken())
                .refreshToken(tokens.refreshToken())
                .refreshTokenMaxAgeSeconds(tokens.refreshExpiresIn())
                .tokenType("Bearer")
                .expiresIn(tokens.expiresIn() * 1000)
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
        // U23: email is absent for a phone-only account, and Map.of rejects null values.
        Map<String, Object> data = new HashMap<>();
        data.put("id", user.getId());
        if (user.getEmail() != null) {
            data.put("email", user.getEmail());
        }
        data.put("username", user.getUsername() != null ? user.getUsername() : "");
        data.put("roles", user.getRoles());
        return data;
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
