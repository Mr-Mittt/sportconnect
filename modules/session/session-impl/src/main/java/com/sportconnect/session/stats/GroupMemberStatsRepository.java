package com.sportconnect.session.stats;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

public interface GroupMemberStatsRepository extends JpaRepository<GroupMemberStats, GroupMemberStats.Key> {

    /** Which of these users already have a row for the group and sport (no lock). */
    @Query("SELECT s.userId FROM GroupMemberStats s WHERE s.groupId = :groupId AND s.sportId = :sportId "
            + "AND s.userId IN :userIds")
    List<UUID> findExistingUserIds(@Param("groupId") Long groupId, @Param("sportId") Long sportId,
                                   @Param("userIds") Collection<UUID> userIds);

    /** The members' rows under a write lock, ordered by user id (the one lock order, see {@link UserSportStatsRepository}). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM GroupMemberStats s WHERE s.groupId = :groupId AND s.sportId = :sportId "
            + "AND s.userId IN :userIds ORDER BY s.userId")
    List<GroupMemberStats> lockAll(@Param("groupId") Long groupId, @Param("sportId") Long sportId,
                                   @Param("userIds") Collection<UUID> userIds);
}
