package com.sportconnect.session.stats;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface UserSportStatsRepository extends JpaRepository<UserSportStats, UserSportStats.Key> {

    /** Which of these users already have a row for the sport (no lock). */
    @Query("SELECT s.userId FROM UserSportStats s WHERE s.sportId = :sportId AND s.userId IN :userIds")
    List<UUID> findExistingUserIds(@Param("sportId") Long sportId, @Param("userIds") Collection<UUID> userIds);

    /**
     * The users' rows under a write lock, in one statement ordered by user id. Every transaction that takes several of these
     * rows takes them through this one query, so they are always locked in the same order and two sessions that share
     * players wait for each other instead of deadlocking.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM UserSportStats s WHERE s.sportId = :sportId AND s.userId IN :userIds ORDER BY s.userId")
    List<UserSportStats> lockAll(@Param("sportId") Long sportId, @Param("userIds") Collection<UUID> userIds);
}
