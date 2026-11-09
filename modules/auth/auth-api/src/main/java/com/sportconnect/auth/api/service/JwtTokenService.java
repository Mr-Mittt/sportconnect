package com.sportconnect.auth.api.service;

import java.time.Instant;
import java.util.List;

/**
 * JWT token service interface.
 *
 * <p>A25: the <em>reading</em> methods verify a Keycloak access token (RS256, JWKS, issuer, audience); {@code sub} is
 * the user id, roles are in {@code realm_access.roles} (A37) and the email may be
 * missing. There is no token minting here any more: Keycloak issues every token (A28 removed the HS256 mint).
 */
public interface JwtTokenService {

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
     * The application roles ({@code USER}, {@code ADMIN}) in the token's {@code realm_access.roles} (A37), without the {@code ROLE_} prefix
     */
    List<String> getAuthoritiesFromToken(String token);

    /**
     * The token's {@code iat} claim, as the instant it was issued.
     */
    Instant getIssuedAtFromToken(String token);
}
