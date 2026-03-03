package com.sportconnect.auth.api.service;

import java.util.List;

/**
 * JWT token service interface
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
     * Get refresh token expiration time
     */
    Long getRefreshExpiration();
}
