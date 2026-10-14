package com.sportconnect.auth.api.service;

import java.time.Instant;
import java.util.List;

/**
 * JWT token service interface.
 *
 * <p>A25: the <em>reading</em> methods verify a Keycloak access token (RS256, JWKS, issuer, audience); {@code sub} is
 * the user id, there are no role claims (roles come from {@code UserService.getAccessState}) and the email may be
 * missing. The {@code generate*} methods are the legacy HS256 mint, kept only until A26 and A28 retire the old login.
 */
public interface JwtTokenService {

    /**
     * Generate access token for user
     */
    String generateAccessToken(Object user);

    /**
     * Generate refresh token for user
     */
    String generateRefreshToken(Object user);

    /**
     * Validate JWT token
     */
    boolean validateToken(String token);

    /**
     * Check if token is expired
     */
    boolean isTokenExpired(String token);

    /**
     * Extract user ID from token
     */
    String getUserIdFromToken(String token);

    /**
     * Extract email from token
     */
    String getEmailFromToken(String token);

    /**
     * Extract authorities/roles from token
     */
    List<String> getAuthoritiesFromToken(String token);

    /**
     * The token's {@code iat} claim, as the instant it was issued.
     */
    Instant getIssuedAtFromToken(String token);

    /**
     * Get refresh token expiration time
     */
    Long getRefreshExpiration();
}
