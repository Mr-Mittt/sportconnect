package com.sportconnect.user.repository;

import com.sportconnect.user.entity.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmail(String email);

    Optional<User> findByUsername(String username);

    boolean existsByEmail(String email);

    boolean existsByUsername(String username);

    Optional<User> findByIdAndIsActiveTrue(UUID id);

    /**
     * U12: exclusive row lock ({@code SELECT ... FOR UPDATE}), held for the caller's whole
     * transaction. Used by {@code deleteUser()} so a concurrent {@code findByIdAndIsActiveTrueForShare}
     * (from a racing {@code refreshToken()} call) blocks until deactivation fully commits, instead of
     * reading a stale {@code isActive = true} and minting a token that survives the account being
     * deactivated. See U12's implementation doc for the full race analysis.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT u FROM User u WHERE u.id = :id")
    Optional<User> findByIdForUpdate(@Param("id") UUID id);

    /**
     * U12: shared row lock ({@code SELECT ... FOR SHARE}) — multiple concurrent callers of this
     * method for the same user don't block each other, but a concurrent {@link #findByIdForUpdate}
     * (deactivation) does block this until it commits, and vice versa. Used by
     * {@code AuthServiceImpl.refreshToken()} in place of a plain {@code isActive} read.
     */
    @Lock(LockModeType.PESSIMISTIC_READ)
    @Query("SELECT u FROM User u WHERE u.id = :id AND u.isActive = true")
    Optional<User> findByIdAndIsActiveTrueForShare(@Param("id") UUID id);

    Optional<User> findByEmailAndIsActiveTrue(String email);

    Optional<User> findByUsernameAndIsActiveTrue(String username);

    // Keyset pagination for services/chat's cold-start bootstrap pull (see
    // services/chat/docs/SYNC_DESIGN.md) — ordered by id, not offset-paginated.
    List<User> findByIdGreaterThanAndIsActiveTrueOrderByIdAsc(UUID id, Pageable pageable);

    @Query("""
            SELECT u FROM User u
            WHERE u.isActive = true AND u.id <> :callerId
              AND (LOWER(u.firstName) LIKE LOWER(CONCAT('%', :keyword, '%'))
                OR LOWER(u.lastName) LIKE LOWER(CONCAT('%', :keyword, '%'))
                OR LOWER(u.username) LIKE LOWER(CONCAT('%', :keyword, '%')))
            """)
    Page<User> searchActiveUsers(@Param("callerId") UUID callerId, @Param("keyword") String keyword, Pageable pageable);
}
