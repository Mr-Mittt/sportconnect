package com.sportconnect.auth.repository;

import com.sportconnect.auth.entity.RefreshToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {

    Optional<RefreshToken> findByToken(String token);

    @Query("SELECT rt FROM RefreshToken rt WHERE rt.userId = :userId AND rt.revokedAt IS NULL AND rt.expiresAt > :now")
    Optional<RefreshToken> findValidTokenByUserId(@Param("userId") UUID userId, @Param("now") LocalDateTime now);

    @Modifying
    @Query("UPDATE RefreshToken rt SET rt.revokedAt = :now WHERE rt.userId = :userId AND rt.revokedAt IS NULL")
    void revokeAllUserTokens(@Param("userId") UUID userId, @Param("now") LocalDateTime now);

    /**
     * U12: the durable source of truth behind the access-token deny-list cache
     * ({@code TokenRevocationChecker}). {@code revokeAllUserTokens} already stamps every row it
     * touches with the same {@code revokedAt} in one statement (deactivation or plain logout, both
     * go through {@code AuthService.logout()}), so the most recent value across all of a user's
     * rows is exactly the "reject any access token issued at or before this instant" watermark.
     * {@code null} means the user has never been revoked. Index-scoped via {@code idx_refresh_tokens_user_id}.
     */
    @Query("SELECT MAX(rt.revokedAt) FROM RefreshToken rt WHERE rt.userId = :userId")
    LocalDateTime findLatestRevocationTimestamp(@Param("userId") UUID userId);

    @Modifying
    @Query("DELETE FROM RefreshToken rt WHERE rt.expiresAt < :now")
    void deleteExpiredTokens(@Param("now") LocalDateTime now);
}
