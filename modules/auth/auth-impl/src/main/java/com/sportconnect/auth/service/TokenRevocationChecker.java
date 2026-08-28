package com.sportconnect.auth.service;

import com.sportconnect.auth.config.JwtProperties;
import com.sportconnect.auth.repository.RefreshTokenRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;

/**
 * U12: answers "has this user's access token been revoked?" for {@code JwtAuthenticationFilter} —
 * the piece that lets an already-issued access token stop authenticating before it naturally
 * expires (a plain JWT has no way to be told "revoke me" after issuance; this is the external
 * state that supplies that).
 *
 * <p>Cache-aside, not write-through: this class never writes a revocation event on its own.
 * {@code AuthService.logout(userId)} (called by both a plain user-initiated logout and
 * {@code UserServiceImpl.deleteUser()}'s deactivation path) already durably stamps every one of a
 * user's {@code refresh_tokens} rows with the same {@code revokedAt} in one statement
 * ({@code RefreshTokenRepository.revokeAllUserTokens}) — that's the real source of truth. Redis
 * here is purely a read-through cache in front of it: a cache hit avoids a DB round trip on the
 * hot path (every authenticated request), and a cache miss — including Redis having lost its data
 * entirely — falls back to {@link RefreshTokenRepository#findLatestRevocationTimestamp}, which is
 * still correct because the durable write already happened before this class is ever consulted.
 */
@Component
@RequiredArgsConstructor
public class TokenRevocationChecker {

    private static final String REDIS_KEY_PREFIX = "auth:revoked-before:";
    // Redis values are plain strings; this sentinel distinguishes "cached: never revoked" from
    // "not cached at all" so a never-revoked user's requests still hit the cache instead of
    // Postgres every time.
    private static final String NEVER_REVOKED_SENTINEL = "";

    private final StringRedisTemplate stringRedisTemplate;
    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtProperties jwtProperties;

    /**
     * True if {@code issuedAt} is at or before the user's revocation watermark — i.e. the token
     * was minted before their most recent logout/deactivation and should no longer authenticate,
     * even though its signature and {@code exp} are both still valid.
     */
    public boolean isRevoked(UUID userId, Instant issuedAt) {
        Instant revokedAt = revocationWatermark(userId);
        return revokedAt != null && !issuedAt.isAfter(revokedAt);
    }

    private Instant revocationWatermark(UUID userId) {
        String key = REDIS_KEY_PREFIX + userId;
        String cached = stringRedisTemplate.opsForValue().get(key);
        if (cached != null) {
            return cached.isEmpty() ? null : Instant.ofEpochMilli(Long.parseLong(cached));
        }

        LocalDateTime latestRevokedAt = refreshTokenRepository.findLatestRevocationTimestamp(userId);
        Instant revokedAt = latestRevokedAt != null
                ? latestRevokedAt.atZone(ZoneId.systemDefault()).toInstant()
                : null;

        // TTL matches the access-token lifetime: past that window every pre-revocation token has
        // expired naturally anyway, so the cache entry can safely disappear rather than grow
        // unbounded.
        stringRedisTemplate.opsForValue().set(
                key,
                revokedAt != null ? String.valueOf(revokedAt.toEpochMilli()) : NEVER_REVOKED_SENTINEL,
                Duration.ofMillis(jwtProperties.getExpiration()));
        return revokedAt;
    }
}
