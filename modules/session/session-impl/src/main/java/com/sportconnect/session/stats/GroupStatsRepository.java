package com.sportconnect.session.stats;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

public interface GroupStatsRepository extends JpaRepository<GroupStats, GroupStats.Key> {

    /**
     * The group's row under a write lock held until the transaction ends. Taken after the user rows and the group-member
     * rows (the one lock order of the counting transaction), so two sessions of one group queue here and never deadlock.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT g FROM GroupStats g WHERE g.groupId = :groupId AND g.sportId = :sportId")
    Optional<GroupStats> lockOne(@Param("groupId") Long groupId, @Param("sportId") Long sportId);
}
