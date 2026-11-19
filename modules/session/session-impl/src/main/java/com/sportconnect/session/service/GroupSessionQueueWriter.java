package com.sportconnect.session.service;

import com.sportconnect.session.entity.GroupSessionGenerationItem;
import com.sportconnect.session.repository.GroupSessionGenerationQueueRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

/**
 * SESSION-GROUP-5 review (owner, 2026-11-19) — the planner's writes to the generation queue, each its own small transaction
 * ({@code REQUIRES_NEW}: the planner is not transactional itself, and it is called after another transaction has committed, so
 * a plain {@code REQUIRED} here would join that finished transaction and never commit). Every method is one atomic statement, or
 * for {@link #insert} one insert whose unique-key violation (a concurrent planner queued the same slot) leaves only this tiny
 * transaction rolled back: the planner catches it outside the transaction and carries on, so one conflicting slot can never undo
 * the others.
 */
@Service
@RequiredArgsConstructor
public class GroupSessionQueueWriter {

    private static final List<GroupSessionGenerationItem.Status> REVIVABLE =
            List.of(GroupSessionGenerationItem.Status.FAILED, GroupSessionGenerationItem.Status.IGNORED);

    private final GroupSessionGenerationQueueRepository queueRepository;

    /**
     * The recurrence's authoritative slot is {@code keepDate}: its other {@code PENDING} slots are obsolete. One whose start has
     * passed is {@code OUTDATED}, one not started yet is {@code SUPERSEDED} (an edit moved the rule).
     *
     * @return how many slots were ignored
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int supersedeOthers(Long recurrenceId, LocalDate keepDate, Instant now) {
        LocalDateTime at = at(now);
        int outdated = queueRepository.ignoreStartedPendingOthers(recurrenceId, keepDate, now,
                GroupSessionGenerationItem.Status.PENDING, GroupSessionGenerationItem.Status.IGNORED,
                GroupSessionGenerationItem.IgnoredReason.OUTDATED, at);
        int superseded = queueRepository.ignorePendingOthers(recurrenceId, keepDate, GroupSessionGenerationItem.Status.PENDING,
                GroupSessionGenerationItem.Status.IGNORED, GroupSessionGenerationItem.IgnoredReason.SUPERSEDED, at);
        return outdated + superseded;
    }

    /** @return 1 if the slot was {@code PENDING} with another instant and now has {@code targetStart} (a same-day time edit), else 0 */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int refreshTarget(Long recurrenceId, LocalDate date, Instant targetStart, Instant now) {
        return queueRepository.refreshTargetStart(recurrenceId, date, targetStart, GroupSessionGenerationItem.Status.PENDING, at(now));
    }

    /** @return 1 if this call revived a {@code FAILED} or {@code IGNORED} slot, 0 if another planner already had (or it is not revivable) */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public int revive(Long recurrenceId, LocalDate date, Instant targetStart, Instant now) {
        return queueRepository.revive(recurrenceId, date, targetStart, now, GroupSessionGenerationItem.Status.PENDING, REVIVABLE, at(now));
    }

    /**
     * Queues a new slot. Throws {@link org.springframework.dao.DataIntegrityViolationException} (after rolling back this
     * transaction only) if a concurrent planner queued the same {@code (recurrence, date)} first.
     */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void insert(Long recurrenceId, LocalDate date, Instant targetStart, Instant now) {
        queueRepository.saveAndFlush(GroupSessionGenerationItem.builder()
                .recurrenceId(recurrenceId)
                .occurrenceDate(date)
                .targetStart(targetStart)
                .nextAttemptAt(now)
                .build());
    }

    private static LocalDateTime at(Instant now) {
        return LocalDateTime.ofInstant(now, ZoneId.systemDefault());
    }
}
