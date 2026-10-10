package com.sportconnect.auth.api.service;

import com.sportconnect.auth.api.dto.AuthResponse;
import com.sportconnect.auth.api.dto.LoginRequest;
import com.sportconnect.auth.api.dto.RegisterRequest;

import java.util.UUID;

/**
 * Authentication service interface
 */
public interface AuthService {

    /**
     * Register a new user
     */
    AuthResponse register(RegisterRequest request);

    /**
     * Authenticate user and generate tokens.
     *
     * @throws com.sportconnect.common.exception.UnauthorizedException {@code INVALID_CREDENTIALS} for an unknown
     *         email or wrong password; {@code ACCOUNT_DEACTIVATED} when the credentials are correct but the account
     *         is deactivated (A9) -- no tokens are issued, the caller may offer {@link #reactivate}
     */
    AuthResponse login(LoginRequest request);

    /**
     * A9: re-activates a deactivated account and logs the user in. Re-verifies the credentials, so it is only as
     * open as login itself. An already active account is simply logged in.
     *
     * @throws com.sportconnect.common.exception.UnauthorizedException {@code INVALID_CREDENTIALS} for an unknown
     *         email or wrong password (the account stays as it was)
     */
    AuthResponse reactivate(LoginRequest request);

    /**
     * Refresh access token using refresh token
     */
    AuthResponse refreshToken(String refreshToken);

    /**
     * Logs the user out everywhere: revokes all of their refresh tokens (one shared {@code revoked_at}, which is also
     * the watermark that rejects their earlier access tokens) and, once the transaction commits, evicts the cached
     * watermark so the revocation takes effect on the next request (A12). Also the deactivation path
     * ({@code UserService.deleteUser}). A Redis failure during eviction is logged and never fails the logout.
     */
    void logout(UUID userId);
}
