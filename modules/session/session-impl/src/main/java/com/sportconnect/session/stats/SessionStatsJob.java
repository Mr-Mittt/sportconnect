package com.sportconnect.session.stats;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Map;

/**
 * SESSION-53: the statistics queue and, once a session is counted, the permanent record of what it contributed. One row
 * per session, keyed by the session id (no foreign key, domain-scoped like {@code session_records}); the unique key is the
 * claim, so a session is worked by one thread at a time.
 *
 * <p>Statuses, each meaning one thing: {@code RUNNING} claimed and not finished (taken over after the stale limit),
 * {@code DONE} at least one game counted (final), {@code SKIPPED} nothing countable (final; the reasons are in
 * {@code result}), {@code RETRY} an attempt failed and {@code nextAttemptAt} says when it is due, {@code FAILED} the
 * attempts are used up (tried again after a long wait, one attempt each time).
 */
@Entity
@Table(name = "session_stats_jobs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SessionStatsJob {

    /** The state of one job row. */
    public enum Status {
        RUNNING, DONE, SKIPPED, RETRY, FAILED
    }

    @Id
    @Column(name = "session_id")
    private Long sessionId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Status status;

    @Column(nullable = false)
    private Integer attempts;

    @Column(name = "next_attempt_at")
    private Instant nextAttemptAt;

    /** When the current attempt was claimed; the claim's identity, compared when it finishes or fails. */
    @Column(name = "claimed_at")
    private Instant claimedAt;

    @Column(name = "last_error", length = 500)
    private String lastError;

    @Column(nullable = false)
    private Integer counted;

    @Column(nullable = false)
    private Integer ignored;

    /** {@code {counted: [recordId], ignored: [{recordId, reason}], notes: [token]}}. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    private Map<String, Object> result;

    @Column(name = "finished_at")
    private Instant finishedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
}
