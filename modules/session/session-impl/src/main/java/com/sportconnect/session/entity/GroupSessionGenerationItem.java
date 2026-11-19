package com.sportconnect.session.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * SESSION-GROUP-5 — one slot still to be generated: the (recurrence, local date) of a regular group session. {@code targetStart}
 * only orders the queue (the session is rebuilt from the recurrence as it is when the slot is generated, so an edit made in
 * between applies). A failure is retried with a backoff and ends {@code FAILED} after {@link #MAX_ATTEMPTS}.
 */
@Entity
@Table(name = "group_session_generation_queue", uniqueConstraints = {
        @UniqueConstraint(name = "unique_group_session_queue_item", columnNames = {"recurrence_id", "occurrence_date"})
})
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GroupSessionGenerationItem {

    public static final int MAX_ATTEMPTS = 5;

    /**
     * {@code PENDING} waits to be generated; {@code DONE} means a session exists for the slot; {@code FAILED} gave up after
     * {@link #MAX_ATTEMPTS}; {@code IGNORED} was skipped for an {@link IgnoredReason} and is revived if the slot is wanted again.
     */
    public enum Status { PENDING, DONE, FAILED, IGNORED }

    /** Why a slot was skipped: the slot has ended, the recurrence no longer has this date, or generation no longer applies. */
    public enum IgnoredReason { OUTDATED, SUPERSEDED, GENERATION_OFF, RECURRENCE_INACTIVE, GROUP_INACTIVE }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "recurrence_id", nullable = false)
    private Long recurrenceId;

    @Column(name = "occurrence_date", nullable = false)
    private LocalDate occurrenceDate;

    @Column(name = "target_start", nullable = false)
    private Instant targetStart;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    @Builder.Default
    private Status status = Status.PENDING;

    @Column(nullable = false)
    @Builder.Default
    private Integer attempts = 0;

    @Column(name = "next_attempt_at", nullable = false)
    private Instant nextAttemptAt;

    @Column(name = "last_error", length = 500)
    private String lastError;

    @Enumerated(EnumType.STRING)
    @Column(name = "ignored_reason", length = 30)
    private IgnoredReason ignoredReason;

    /** When the generator last tried this slot (set on a failed attempt). */
    @Column(name = "last_attempt_at")
    private Instant lastAttemptAt;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
