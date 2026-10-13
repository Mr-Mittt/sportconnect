package com.sportconnect.auth.repository;

import com.sportconnect.auth.entity.PasswordResetToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {
    
    Optional<PasswordResetToken> findByToken(String token);
    
    void deleteByUserId(UUID userId);

    /**
     * Atomically marks the token used, but only when it is still unused and unexpired (A21). One conditional
     * statement, so of two concurrent submits of the same token exactly one gets a row back.
     *
     * @return 1 when this call claimed the token, 0 when it does not exist, was already used, or has expired
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE PasswordResetToken t SET t.usedAt = :now "
            + "WHERE t.token = :token AND t.usedAt IS NULL AND t.expiresAt > :now")
    int claimUnusedToken(@Param("token") String token, @Param("now") LocalDateTime now);
}
