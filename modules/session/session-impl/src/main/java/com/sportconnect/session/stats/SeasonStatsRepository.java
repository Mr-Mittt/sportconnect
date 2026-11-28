package com.sportconnect.session.stats;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Optional;

/** SESSION-55: the season's head-to-head row. */
public interface SeasonStatsRepository extends JpaRepository<SeasonStats, Long> {

    /** The season's head-to-head row under a write lock: the last lock a counting transaction takes. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT s FROM SeasonStats s WHERE s.seasonId = :seasonId")
    Optional<SeasonStats> lockOne(@Param("seasonId") Long seasonId);
}
