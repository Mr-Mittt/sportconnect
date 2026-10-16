package com.sportconnect.auth.api.service;

import java.time.Instant;
import java.util.List;

/**
 * JWT token service interface.
 *
 * <p>A25: the <em>reading</em> methods verify a Keycloak access token (RS256, JWKS, issuer, audience); {@code sub} is
 * the user id, there are no role claims (roles come from {@code UserService.getAccessState}) and the email may be
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
     * Extract authorities/roles from token
     */
    List<String> getAuthoritiesFromToken(String token);

    /**
     * The token's {@code iat} claim, as the instant it was issued.
     */
    Instant getIssuedAtFromToken(String token);
}
