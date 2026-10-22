package com.sportconnect.auth.service;

import com.sportconnect.auth.api.service.JwtTokenService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Collections;
import java.util.List;

/**
 * Reads a token by verifying a <em>Keycloak</em> access token through the {@link JwtDecoder} (RS256, JWKS, issuer,
 * audience; A25). {@code StompAuthChannelInterceptor} reads tokens through this interface, so the WebSocket handshake
 * accepts exactly what REST accepts. A28 removed the legacy HS256 mint ({@code generate*}) with the old login.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class JwtTokenServiceImpl implements JwtTokenService {

    private final JwtDecoder jwtDecoder;

    @Override
    public boolean validateToken(String token) {
        try {
            jwtDecoder.decode(token);
            return true;
        } catch (JwtException e) {
            log.debug("Invalid JWT token: {}", e.getMessage());
            return false;
        }
    }

    @Override
    public boolean isTokenExpired(String token) {
        try {
            Instant expiresAt = jwtDecoder.decode(token).getExpiresAt();
            return expiresAt == null || !expiresAt.isAfter(Instant.now());
        } catch (JwtException e) {
            return true;
        }
    }

    @Override
    public String getUserIdFromToken(String token) {
        return jwtDecoder.decode(token).getSubject();
    }

    /** The {@code email} claim, which Keycloak omits for an account that has no email (U23). */
    @Override
    public String getEmailFromToken(String token) {
        return jwtDecoder.decode(token).getClaimAsString("email");
    }

    @Override
    public Instant getIssuedAtFromToken(String token) {
        Jwt jwt = jwtDecoder.decode(token);
        return jwt.getIssuedAt();
    }

    /** Always empty: roles live in our database ({@code UserService.getAccessState}), never in the token. */
    @Override
    public List<String> getAuthoritiesFromToken(String token) {
        return Collections.emptyList();
    }
}
