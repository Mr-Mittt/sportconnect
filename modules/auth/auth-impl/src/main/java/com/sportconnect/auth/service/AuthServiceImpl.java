package com.sportconnect.auth.service;

import com.sportconnect.auth.api.dto.AuthResponse;
import com.sportconnect.auth.api.service.AuthService;
import com.sportconnect.common.exception.ConflictException;
import com.sportconnect.common.exception.ServiceUnavailableException;
import com.sportconnect.common.exception.UnauthorizedException;
import com.sportconnect.user.api.dto.ExternalIdentity;
import com.sportconnect.user.api.dto.ProvisionedUser;
import com.sportconnect.user.api.dto.UserAccessState;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Auth service implementation (A26, A28): every session is a Keycloak session. Depends on user-impl only through
 * user-api.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AuthServiceImpl implements AuthService {

    private final UserService userService;
    private final KeycloakTokenClient keycloak;
    private final JwtDecoder jwtDecoder;
    private final ReactivationTicketStore reactivationTickets;
    private final WelcomeEmailService welcomeEmails;

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
        boolean created;
        try {
            Jwt jwt = verify(tokens.accessToken());
            UUID userId = subjectOf(jwt);
            boolean social = jwt.getClaimAsString("identity_provider") != null;
            ProvisionedUser provisioned = provision(identityOf(jwt, userId));
            user = provisioned.user();
            created = provisioned.created();
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
        if (created) {
            // A28: once per account. Provisioning has committed by now; a sign-in that only re-read the row, including
            // the loser of a first-sign-in race, reports created = false and sends nothing.
            welcomeEmails.sendTo(user);
        }
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
                .countryId(longClaim(jwt, "country_id"))
                .regionId(longClaim(jwt, "region_id"))
                .latitude(doubleClaim(jwt, "latitude"))
                .longitude(doubleClaim(jwt, "longitude"))
                .build();
    }

    /**
     * A32: an optional numeric claim. Keycloak's attribute mapper emits strings, so a string or a number is accepted;
     * anything that does not parse is absent (the register-page values are untrusted input and must never fail a sign-in).
     */
    private static Long longClaim(Jwt jwt, String name) {
        Object value = jwt.getClaim(name);
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text && !text.isBlank()) {
            try {
                return Long.parseLong(text.trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return null;
    }

    /** A32: as {@link #longClaim}, for a decimal; NaN and infinity are absent. */
    private static Double doubleClaim(Jwt jwt, String name) {
        Object value = jwt.getClaim(name);
        Double parsed = null;
        if (value instanceof Number number) {
            parsed = number.doubleValue();
        } else if (value instanceof String text && !text.isBlank()) {
            try {
                parsed = Double.parseDouble(text.trim());
            } catch (NumberFormatException e) {
                return null;
            }
        }
        return parsed != null && Double.isFinite(parsed) ? parsed : null;
    }

    /**
     * Provisioning in its own transaction (inside {@code UserService}). Two first sign-ins for one subject can race; the
     * loser fails on the primary key, or on the winner's email or phone (the same person, so those surface as a 409
     * here), and a second call then simply finds the winner's row by id. A genuine clash (another account holds the
     * email or phone) fails the same way again and is rethrown by that second call.
     */
    private ProvisionedUser provision(ExternalIdentity identity) {
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
