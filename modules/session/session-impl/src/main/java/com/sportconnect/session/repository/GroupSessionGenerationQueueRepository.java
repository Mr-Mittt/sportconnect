package com.sportconnect.session.repository;

import com.sportconnect.session.entity.GroupSessionGenerationItem;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface GroupSessionGenerationQueueRepository extends JpaRepository<GroupSessionGenerationItem, Long> {

    /** The items in {@code status} that are due, soonest slot first (the queue order). Served by {@code idx_group_session_queue_due}. */
    @Query("SELECT i FROM GroupSessionGenerationItem i WHERE i.status = :status AND i.nextAttemptAt <= :now "
            + "ORDER BY i.targetStart ASC, i.id ASC")
    List<GroupSessionGenerationItem> findByStatusDue(@Param("status") GroupSessionGenerationItem.Status status,
                                                     @Param("now") Instant now, Pageable pageable);

    /** The {@code PENDING} items that are due: what the runner drains. */
    default List<GroupSessionGenerationItem> findDue(Instant now, Pageable pageable) {
        return findByStatusDue(GroupSessionGenerationItem.Status.PENDING, now, pageable);
    }

    /** Every queue row of these recurrences, in one query (the planner dedupes against it). */
    List<GroupSessionGenerationItem> findByRecurrenceIdIn(Collection<Long> recurrenceIds);

    /**
     * The slot, row-locked for the rest of the caller's transaction, or empty when the row is gone <b>or locked by another
     * runner</b> ({@code FOR UPDATE SKIP LOCKED}). The generating transaction takes it first, so two runners (two instances, or
     * two threads of one) never build the same slot: the second one skips it and takes another. The lock is released on commit
     * or rollback, and a dead connection releases it too, so a crash leaves the slot {@code PENDING} and nothing to recover.
     *
     * <p>A native query, on purpose: Hibernate's {@code H2Dialect} (6.3) drops the skip-locked hint and emits a plain
     * {@code FOR UPDATE} (found by the IT: the second runner waited and timed out), so a JPA lock hint would have been tested on
     * H2 as something other than what PostgreSQL runs. The SQL below is the same text on both. It must run inside a transaction
     * (a lock taken in autocommit is released at once); {@code generate} and {@code recordFailure} are {@code REQUIRES_NEW}.
     */
    @Query(value = "SELECT * FROM group_session_generation_queue WHERE id = :id FOR UPDATE SKIP LOCKED", nativeQuery = true)
    Optional<GroupSessionGenerationItem> findByIdForUpdateSkipLocked(@Param("id") Long id);

    // ---- the planner's writes: each one a single atomic statement, so two planners can race without losing an update ----------

    /**
     * The recurrence's other {@code PENDING} slots whose start has passed are obsolete: {@code IGNORED} as {@code OUTDATED}.
     * Run before {@link #ignorePendingOthers}, so the rest of them are the ones not started yet.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE GroupSessionGenerationItem i SET i.status = :ignored, i.ignoredReason = :reason, i.updatedAt = :at "
            + "WHERE i.recurrenceId = :recurrenceId AND i.status = :pending AND i.occurrenceDate <> :keepDate AND i.targetStart <= :now")
    int ignoreStartedPendingOthers(@Param("recurrenceId") Long recurrenceId, @Param("keepDate") LocalDate keepDate,
                                   @Param("now") Instant now, @Param("pending") GroupSessionGenerationItem.Status pending,
                                   @Param("ignored") GroupSessionGenerationItem.Status ignored,
                                   @Param("reason") GroupSessionGenerationItem.IgnoredReason reason, @Param("at") LocalDateTime at);

    /** The recurrence's other {@code PENDING} slots (not started yet) are superseded by {@code keepDate}: {@code IGNORED} as {@code SUPERSEDED}. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE GroupSessionGenerationItem i SET i.status = :ignored, i.ignoredReason = :reason, i.updatedAt = :at "
            + "WHERE i.recurrenceId = :recurrenceId AND i.status = :pending AND i.occurrenceDate <> :keepDate")
    int ignorePendingOthers(@Param("recurrenceId") Long recurrenceId, @Param("keepDate") LocalDate keepDate,
                            @Param("pending") GroupSessionGenerationItem.Status pending,
                            @Param("ignored") GroupSessionGenerationItem.Status ignored,
                            @Param("reason") GroupSessionGenerationItem.IgnoredReason reason, @Param("at") LocalDateTime at);

    /** A {@code PENDING} slot whose instant changed (the recurrence's time or its location's zone was edited): the order key is refreshed. */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE GroupSessionGenerationItem i SET i.targetStart = :target, i.updatedAt = :at "
            + "WHERE i.recurrenceId = :recurrenceId AND i.occurrenceDate = :date AND i.status = :pending AND i.targetStart <> :target")
    int refreshTargetStart(@Param("recurrenceId") Long recurrenceId, @Param("date") LocalDate date,
                           @Param("target") Instant target, @Param("pending") GroupSessionGenerationItem.Status pending,
                           @Param("at") LocalDateTime at);

    /**
     * Compare-and-set: a {@code FAILED} or {@code IGNORED} slot becomes {@code PENDING} again, due now, with the attempts and the
     * reason cleared. Only the caller whose update touches the row (returns 1) revived it.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE GroupSessionGenerationItem i SET i.status = :pending, i.attempts = 0, i.lastError = NULL, i.ignoredReason = NULL, "
            + "i.nextAttemptAt = :now, i.targetStart = :target, i.updatedAt = :at "
            + "WHERE i.recurrenceId = :recurrenceId AND i.occurrenceDate = :date AND i.status IN :revivable")
    int revive(@Param("recurrenceId") Long recurrenceId, @Param("date") LocalDate date, @Param("target") Instant target,
               @Param("now") Instant now, @Param("pending") GroupSessionGenerationItem.Status pending,
               @Param("revivable") Collection<GroupSessionGenerationItem.Status> revivable, @Param("at") LocalDateTime at);
}
