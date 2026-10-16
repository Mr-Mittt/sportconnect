package com.sportconnect.auth.api.service;

import com.sportconnect.auth.api.dto.AuthResponse;

/**
 * Authentication service interface.
 *
 * <p>Every session is a Keycloak session (A26): {@link #callback}, {@link #reactivate}, {@link #refreshToken} and
 * {@link #endSession} proxy the realm. Registration, password login, password reset and email verification are
 * Keycloak's own pages and messages (A28); this service no longer mints or stores tokens.
 */
public interface AuthService {

    /**
     * A26: completes the Authorization Code + PKCE sign-in the client started at Keycloak. Exchanges the code, provisions
     * the {@code users} row on first sight ({@code users.id} = the token's {@code sub}), and applies the deactivation
     * rules: an active user gets the session; a deactivated user who signed in through a social provider is re-activated
     * and gets it; a deactivated user who signed in with a password gets {@code ACCOUNT_DEACTIVATED} and a ticket.
     *
     * @return the access token (body) and the refresh token (for the httpOnly cookie), as {@link AuthResponse}
     * @throws com.sportconnect.common.exception.UnauthorizedException {@code AUTH_CODE_INVALID} for a bad, used or
     *         expired code or a wrong verifier; {@code ACCOUNT_DEACTIVATED} with {@code errorParams.reactivationTicket}
     *         for a deactivated password user (no cookie)
     * @throws com.sportconnect.common.exception.BadRequestException {@code IDENTIFIER_REQUIRED} (no email and no usable phone)
     * @throws com.sportconnect.common.exception.ConflictException {@code PHONE_ALREADY_USED}, {@code EMAIL_ALREADY_REGISTERED}
     * @throws com.sportconnect.common.exception.ServiceUnavailableException Keycloak (or the ticket store) is not answering
     */
    AuthResponse callback(String code, String codeVerifier);

    /**
     * A26: the user confirmed the re-activation offered by {@link #callback}. Consumes the ticket (single use),
     * re-activates the account and releases the parked Keycloak session. Replaces the credentials version (A9).
     *
     * @throws com.sportconnect.common.exception.UnauthorizedException {@code REACTIVATION_TICKET_INVALID} for an unknown,
     *         expired or already used ticket, or one whose Keycloak session has ended meanwhile
     * @throws com.sportconnect.common.exception.ServiceUnavailableException Keycloak or the ticket store is not answering
     */
    AuthResponse reactivate(String ticket);

    /**
     * A26: the user declined the re-activation. Drops the ticket and ends the parked Keycloak session (otherwise the next
     * sign-in would silently land on the same dialog). Never fails because a ticket is unknown, so it cannot be used to
     * probe tickets.
     */
    void cancelReactivation(String ticket);

    /**
     * Rotates the Keycloak refresh token and applies the per-request gate to the new access token.
     *
     * @throws com.sportconnect.common.exception.UnauthorizedException {@code REFRESH_TOKEN_EXPIRED_OR_REVOKED} when
     *         Keycloak no longer honours the token, or the user is gone or deactivated (the session is then ended)
     * @throws com.sportconnect.common.exception.ServiceUnavailableException Keycloak is not answering
     */
    AuthResponse refreshToken(String refreshToken);

    /**
     * A26: logs out by ending the Keycloak SSO session the refresh token belongs to. A token Keycloak no longer knows
     * counts as already logged out.
     *
     * @throws com.sportconnect.common.exception.ServiceUnavailableException Keycloak is not answering, so the session may
     *         still be alive and the caller must not say it is over
     */
    void endSession(String refreshToken);
}
