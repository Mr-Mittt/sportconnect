package com.sportconnect.session.stats;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

/** SESSION-55: the season's member rows. */
public interface SeasonMemberStatsRepository extends JpaRepository<SeasonMemberStats, SeasonMemberStats.Key> {

    /** Every member row of the season, for the statistics list and the board (no lock; primary key prefix {@code season_id}). */
    List<SeasonMemberStats> findBySeasonId(Long seasonId);

    /** Which of these users already have a row in the season (no lock). */
    @Query("SELECT s.userId FROM SeasonMemberStats s WHERE s.seasonId = :seasonId AND s.userId IN :userIds")
    List<UUID> findExistingUserIds(@Param("seasonId") Long seasonId, @Param("userIds") Collection<UUID> userIds);

    /** The members' rows under a write lock, ordered by user id (the one lock order, see {@code UserSportStatsRepository}). */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM SeasonMemberStats s WHERE s.seasonId = :seasonId AND s.userId IN :userIds ORDER BY s.userId")
    List<SeasonMemberStats> lockAll(@Param("seasonId") Long seasonId, @Param("userIds") Collection<UUID> userIds);
}
