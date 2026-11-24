package com.sportconnect.session.stats;

import jakarta.persistence.LockModeType;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface SessionStatsJobRepository extends JpaRepository<SessionStatsJob, Long> {

    /**
     * Completed sessions whose 24-hour guard has passed and that have no job row yet, oldest guard first. The guard is the
     * session's end (its start when it has no end), compared with a cutoff the caller computes in Java, so the query is the
     * same on PostgreSQL and H2.
     */
    @Query("SELECT s.id FROM Session s WHERE s.status = com.sportconnect.session.api.dto.SessionStatus.COMPLETED "
            + "AND COALESCE(s.scheduledEndAt, s.scheduledStart) <= :cutoff "
            + "AND NOT EXISTS (SELECT 1 FROM SessionStatsJob j WHERE j.sessionId = s.id) "
            + "ORDER BY COALESCE(s.scheduledEndAt, s.scheduledStart) ASC, s.id ASC")
    List<Long> findNewSessionIds(@Param("cutoff") Instant cutoff, Pageable page);

    /**
     * Job rows that are due again: a {@code RETRY} or {@code FAILED} row whose time has come, or a {@code RUNNING} claim older
     * than {@code staleBefore} (a worker that died). Oldest first.
     */
    @Query("SELECT j.sessionId FROM SessionStatsJob j WHERE "
            + "((j.status = com.sportconnect.session.stats.SessionStatsJob$Status.RETRY "
            + "OR j.status = com.sportconnect.session.stats.SessionStatsJob$Status.FAILED) AND j.nextAttemptAt <= :now) "
            + "OR (j.status = com.sportconnect.session.stats.SessionStatsJob$Status.RUNNING AND j.claimedAt <= :staleBefore) "
            + "ORDER BY COALESCE(j.nextAttemptAt, j.claimedAt) ASC, j.sessionId ASC")
    List<Long> findDueSessionIds(@Param("now") Instant now, @Param("staleBefore") Instant staleBefore, Pageable page);

    /**
     * Takes a due row by compare-and-set: it matches only while the row is still due, so of two workers racing for it exactly
     * one gets {@code 1}.
     *
     * @return 1 if this call claimed the row, 0 if it is not due any more or another worker has it
     */
    @Modifying
    @Query("UPDATE SessionStatsJob j SET j.status = com.sportconnect.session.stats.SessionStatsJob$Status.RUNNING, "
            + "j.claimedAt = :now, j.attempts = j.attempts + 1, j.updatedAt = :now WHERE j.sessionId = :id AND "
            + "(((j.status = com.sportconnect.session.stats.SessionStatsJob$Status.RETRY "
            + "OR j.status = com.sportconnect.session.stats.SessionStatsJob$Status.FAILED) AND j.nextAttemptAt <= :now) "
            + "OR (j.status = com.sportconnect.session.stats.SessionStatsJob$Status.RUNNING AND j.claimedAt <= :staleBefore))")
    int claimDue(@Param("id") Long id, @Param("now") Instant now, @Param("staleBefore") Instant staleBefore);

    /**
     * Records a failed attempt, only while this attempt still owns the row (it is {@code RUNNING} with the claim time this
     * attempt took); a worker whose claim was taken over changes nothing.
     */
    @Modifying
    @Query("UPDATE SessionStatsJob j SET j.status = :status, j.nextAttemptAt = :next, j.lastError = :error, "
            + "j.updatedAt = :now WHERE j.sessionId = :id "
            + "AND j.status = com.sportconnect.session.stats.SessionStatsJob$Status.RUNNING AND j.claimedAt = :claimedAt")
    int recordFailure(@Param("id") Long id, @Param("claimedAt") Instant claimedAt,
                      @Param("status") SessionStatsJob.Status status, @Param("next") Instant next,
                      @Param("error") String error, @Param("now") Instant now);

    /**
     * Claims a session that has no job row: a plain {@code INSERT}, so the primary key makes the loser of a race fail with a
     * {@link org.springframework.dao.DataIntegrityViolationException}. Not {@code save}: for an entity with an assigned id,
     * {@code save} merges, and merging onto an existing row would silently overwrite the winner's claim.
     */
    @Modifying
    @Query(value = "INSERT INTO session_stats_jobs (session_id, status, attempts, claimed_at, counted, ignored, created_at, "
            + "updated_at) VALUES (:id, 'RUNNING', 1, :now, 0, 0, :now, :now)", nativeQuery = true)
    int insertClaim(@Param("id") Long id, @Param("now") Instant now);

    /** The row under a lock held until the transaction ends: a takeover (a compare-and-set) waits for it. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT j FROM SessionStatsJob j WHERE j.sessionId = :id")
    Optional<SessionStatsJob> findForUpdate(@Param("id") Long id);
}
