package com.sportconnect.session.stats;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface StatBoardRunRepository extends JpaRepository<StatBoardRun, StatBoardRun.Key> {

    /**
     * Marks a board dirty with one atomic update (no read-modify-write), so two sessions touching the same board at once
     * both leave it dirty and neither overwrites the other.
     *
     * @return 1 if the board's row exists (the caller ensures it first), 0 otherwise
     */
    @Modifying
    @Query("UPDATE StatBoardRun r SET r.dirty = true, r.dirtyAt = :now "
            + "WHERE r.sportId = :sportId AND r.scopeType = :scopeType AND r.scopeId = :scopeId")
    int markDirty(@Param("sportId") Long sportId, @Param("scopeType") String scopeType,
                  @Param("scopeId") Long scopeId, @Param("now") Instant now);

    /** SESSION-54: records the country of a board whose row was made before it was known (never overwrites one). */
    @Modifying
    @Query("UPDATE StatBoardRun r SET r.countryId = :countryId WHERE r.sportId = :sportId AND r.scopeType = :scopeType "
            + "AND r.scopeId = :scopeId AND r.countryId IS NULL")
    int fillCountry(@Param("sportId") Long sportId, @Param("scopeType") String scopeType,
                    @Param("scopeId") Long scopeId, @Param("countryId") Long countryId);

    /**
     * SESSION-54: the dirty boards a ranking pass may take now: not waiting for a retry time, and not claimed (or claimed longer
     * ago than the stale limit, which means the claiming worker is gone).
     */
    @Query("SELECT r FROM StatBoardRun r WHERE r.dirty = true AND (r.nextAttemptAt IS NULL OR r.nextAttemptAt <= :now) "
            + "AND (r.status <> 'RUNNING' OR r.claimedAt IS NULL OR r.claimedAt < :staleBefore)")
    List<StatBoardRun> findRunnable(@Param("now") Instant now, @Param("staleBefore") Instant staleBefore);

    /** SESSION-54: the boards of a country (its regions, and the country board itself) for one sport. */
    @Query("SELECT r FROM StatBoardRun r WHERE r.sportId = :sportId AND r.countryId = :countryId")
    List<StatBoardRun> findOfCountry(@Param("sportId") Long sportId, @Param("countryId") Long countryId);

    /**
     * SESSION-54: claims a board for a ranking run by compare-and-set: 1 for exactly one worker, 0 for one that lost the race or
     * found it claimed. A claim older than the stale limit is taken over.
     */
    @Modifying
    @Query("UPDATE StatBoardRun r SET r.status = 'RUNNING', r.claimedAt = :now WHERE r.sportId = :sportId "
            + "AND r.scopeType = :scopeType AND r.scopeId = :scopeId "
            + "AND (r.status <> 'RUNNING' OR r.claimedAt IS NULL OR r.claimedAt < :staleBefore)")
    int claim(@Param("sportId") Long sportId, @Param("scopeType") String scopeType, @Param("scopeId") Long scopeId,
              @Param("now") Instant now, @Param("staleBefore") Instant staleBefore);

    /**
     * SESSION-54: ends a successful run, only if this run still owns the claim: the board is idle, built, and clean <b>unless a
     * game was counted since the run read it</b> ({@code dirtyAt} changed), in which case it stays dirty for the next run.
     */
    @Modifying
    @Query("UPDATE StatBoardRun r SET r.status = 'IDLE', r.claimedAt = NULL, r.computedAt = :now, r.lastError = NULL, "
            + "r.nextAttemptAt = NULL, r.fullRebuild = false, r.rulesVersion = :rulesVersion, "
            + "r.dirty = CASE WHEN r.dirtyAt = :dirtyAt THEN false ELSE r.dirty END "
            + "WHERE r.sportId = :sportId AND r.scopeType = :scopeType AND r.scopeId = :scopeId AND r.claimedAt = :claimedAt")
    int finish(@Param("sportId") Long sportId, @Param("scopeType") String scopeType, @Param("scopeId") Long scopeId,
               @Param("claimedAt") Instant claimedAt, @Param("dirtyAt") Instant dirtyAt, @Param("now") Instant now,
               @Param("rulesVersion") Integer rulesVersion);

    /** SESSION-54: records a failed run (only by the run that owns the claim): the board stays dirty and is tried again at {@code nextAttemptAt}. */
    @Modifying
    @Query("UPDATE StatBoardRun r SET r.status = 'FAILED', r.claimedAt = NULL, r.lastError = :error, r.nextAttemptAt = :next "
            + "WHERE r.sportId = :sportId AND r.scopeType = :scopeType AND r.scopeId = :scopeId AND r.claimedAt = :claimedAt")
    int fail(@Param("sportId") Long sportId, @Param("scopeType") String scopeType, @Param("scopeId") Long scopeId,
             @Param("claimedAt") Instant claimedAt, @Param("error") String error, @Param("next") Instant next);

    /** SESSION-54: after a sport-wide rule changed, every board of the sport rebuilds whole at the next run (dirty and flagged). */
    @Modifying
    @Query("UPDATE StatBoardRun r SET r.fullRebuild = true, r.dirty = true, r.dirtyAt = :now WHERE r.sportId = :sportId")
    int markFullRebuildOfSport(@Param("sportId") Long sportId, @Param("now") Instant now);

    /** SESSION-54: after a country's rule changed: its region boards and its country board. */
    @Modifying
    @Query("UPDATE StatBoardRun r SET r.fullRebuild = true, r.dirty = true, r.dirtyAt = :now WHERE r.sportId = :sportId AND r.countryId = :countryId")
    int markFullRebuildOfCountry(@Param("sportId") Long sportId, @Param("countryId") Long countryId, @Param("now") Instant now);

    /** SESSION-54: after a group's own rule changed: that group's board. */
    @Modifying
    @Query("UPDATE StatBoardRun r SET r.fullRebuild = true, r.dirty = true, r.dirtyAt = :now WHERE r.sportId = :sportId AND r.scopeType = 'GROUP' AND r.scopeId = :groupId")
    int markFullRebuildOfGroup(@Param("sportId") Long sportId, @Param("groupId") Long groupId, @Param("now") Instant now);
}
