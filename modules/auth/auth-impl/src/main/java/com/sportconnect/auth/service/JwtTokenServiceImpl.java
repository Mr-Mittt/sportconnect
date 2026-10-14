package com.sportconnect.auth.service;

import com.sportconnect.auth.api.service.JwtTokenService;
import com.sportconnect.auth.config.JwtProperties;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.Collection;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Two halves that no longer match (A25):
 * <ul>
 *   <li><b>Reading</b> a token ({@code validateToken}, {@code getUserIdFromToken}, ...) verifies a <em>Keycloak</em>
 *       access token through the {@link JwtDecoder} (RS256, JWKS, issuer, audience). {@code StompAuthChannelInterceptor}
 *       reads tokens through this interface, so the WebSocket handshake accepts exactly what REST accepts.</li>
 *   <li><b>Minting</b> ({@code generate*}) is the legacy HS256 token the old login still returns. Nothing accepts it
 *       any more; it stays only until A26 (the Keycloak callback) replaces login and A28 deletes it.</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class JwtTokenServiceImpl implements JwtTokenService {

    private final JwtProperties jwtProperties;
    private final JwtDecoder jwtDecoder;

    @Override
    public String generateAccessToken(Object userObj) {
        Map<String, Object> userData = extractUserData(userObj);
        return generateToken(userData, jwtProperties.getExpiration());
    }

    @Override
    public String generateRefreshToken(Object userObj) {
        Map<String, Object> userData = extractUserData(userObj);
        return generateToken(userData, jwtProperties.getRefreshExpiration());
    }

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

    @Override
    public Long getRefreshExpiration() {
        return jwtProperties.getRefreshExpiration();
    }

    // jti is required, not decorative: iat/exp are second-precision in the JWT
    // spec, and every other claim here is deterministic per user. Without a
    // random id, two tokens generated for the same user within the same
    // second are byte-identical strings — refresh_tokens.token is UNIQUE, so
    // that collision throws a DataIntegrityViolationException (500) instead
    // of just minting a second valid token. Found via AUTH-3 (client), which
    // made this reachable in practice: an app-load session-bootstrap refresh
    // firing within a second of the login/register call that preceded it
    // (e.g. opening a second tab right after signing up).
    private String generateToken(Map<String, Object> userData, Long expiration) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + expiration);

        return Jwts.builder()
                .setId(UUID.randomUUID().toString())
                .setSubject(userData.get("id").toString())
                .claim("email", userData.get("email"))
                .claim("username", userData.get("username"))
                .claim("roles", userData.get("roles"))
                .setIssuedAt(now)
                .setExpiration(expiryDate)
                .signWith(getSigningKey())
                .compact();
    }

    private SecretKey getSigningKey() {
        byte[] keyBytes = jwtProperties.getSecret().getBytes(StandardCharsets.UTF_8);
        return Keys.hmacShaKeyFor(keyBytes);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> extractUserData(Object userObj) {
        if (userObj instanceof Map) {
            return (Map<String, Object>) userObj;
        }

        // If it's a User entity, extract fields via reflection or casting
        Map<String, Object> userData = new HashMap<>();
        try {
            Class<?> userClass = userObj.getClass();
            userData.put("id", userClass.getMethod("getId").invoke(userObj));
            userData.put("email", userClass.getMethod("getEmail").invoke(userObj));
            userData.put("username", userClass.getMethod("getUsername").invoke(userObj));

            Object roles = userClass.getMethod("getRoles").invoke(userObj);
            if (roles instanceof Collection) {
                List<String> roleNames = ((Collection<?>) roles).stream()
                        .map(role -> {
                            try {
                                return role.getClass().getMethod("getName").invoke(role).toString();
                            } catch (Exception e) {
                                return "USER";
                            }
                        })
                        .collect(Collectors.toList());
                userData.put("roles", roleNames);
            } else {
                userData.put("roles", Collections.singletonList("USER"));
            }
        } catch (Exception e) {
            log.error("Error extracting user data: {}", e.getMessage());
            throw new RuntimeException("Failed to extract user data for token generation");
        }

        return userData;
    }
}
