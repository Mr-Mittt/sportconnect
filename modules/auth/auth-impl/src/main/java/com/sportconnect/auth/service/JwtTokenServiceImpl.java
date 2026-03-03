package com.sportconnect.auth.service;

import com.sportconnect.auth.api.service.JwtTokenService;
import com.sportconnect.auth.config.JwtProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Slf4j
public class JwtTokenServiceImpl implements JwtTokenService {

    private final JwtProperties jwtProperties;

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
            Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token);
            return true;
        } catch (Exception e) {
            log.error("Invalid JWT token: {}", e.getMessage());
            return false;
        }
    }

    @Override
    public boolean isTokenExpired(String token) {
        try {
            Claims claims = extractAllClaims(token);
            return claims.getExpiration().before(new Date());
        } catch (Exception e) {
            return true;
        }
    }

    @Override
    public String getUserIdFromToken(String token) {
        Claims claims = extractAllClaims(token);
        return claims.getSubject();
    }

    @Override
    public String getEmailFromToken(String token) {
        Claims claims = extractAllClaims(token);
        return claims.get("email", String.class);
    }

    @Override
    public List<String> getAuthoritiesFromToken(String token) {
        Claims claims = extractAllClaims(token);
        List<?> roles = claims.get("roles", List.class);
        if (roles == null) {
            return Collections.emptyList();
        }
        return roles.stream()
                .map(Object::toString)
                .collect(Collectors.toList());
    }

    @Override
    public Long getRefreshExpiration() {
        return jwtProperties.getRefreshExpiration();
    }

    private String generateToken(Map<String, Object> userData, Long expiration) {
        Date now = new Date();
        Date expiryDate = new Date(now.getTime() + expiration);

        return Jwts.builder()
                .setSubject(userData.get("id").toString())
                .claim("email", userData.get("email"))
                .claim("username", userData.get("username"))
                .claim("roles", userData.get("roles"))
                .setIssuedAt(now)
                .setExpiration(expiryDate)
                .signWith(getSigningKey())
                .compact();
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parser()
                .verifyWith(getSigningKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
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
