package com.sportconnect.session.stats;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import lombok.AllArgsConstructor;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;
import java.time.Instant;

/**
 * SESSION-53: one tiny row per board (sport, scope type, scope id). The statistics job sets {@code dirty} when it changes an
 * entry of the board; the ranking job (SESSION-54) claims dirty boards, builds them and clears the flag.
 *
 * <p>SESSION-54 (V108) adds {@code countryId} (a region board's country, so the job works a country at a time; a country
 * board's own id; none for a group), {@code rulesVersion} (the version of the sort rule the board was last built with),
 * {@code fullRebuild} (set when a rule changed: the board is rebuilt whole from the players' blobs), {@code lastError} and
 * {@code nextAttemptAt} (when a failed board is tried again). {@code status} is {@code IDLE}, {@code RUNNING} (claimed; a
 * claim older than the stale limit is taken over) or {@code FAILED} (the last build failed; the retry tick takes it).
 */
@Entity
@Table(name = "stat_board_runs")
@IdClass(StatBoardRun.Key.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class StatBoardRun {

    public static final String IDLE = "IDLE";
    public static final String RUNNING = "RUNNING";
    public static final String FAILED = "FAILED";

    @Id
    @Column(name = "sport_id", nullable = false)
    private Long sportId;

    @Id
    @Column(name = "scope_type", nullable = false, length = 10)
    private String scopeType;

    @Id
    @Column(name = "scope_id", nullable = false)
    private Long scopeId;

    @Column(name = "dirty", nullable = false)
    private Boolean dirty = false;

    @Column(name = "dirty_at")
    private Instant dirtyAt;

    @Column(name = "status", nullable = false, length = 10)
    private String status = IDLE;

    @Column(name = "claimed_at")
    private Instant claimedAt;

    @Column(name = "computed_at")
    private Instant computedAt;

    @Column(name = "country_id")
    private Long countryId;

    @Column(name = "rules_version", nullable = false)
    private Integer rulesVersion = 0;

    @Column(name = "full_rebuild", nullable = false)
    private Boolean fullRebuild = false;

    @Column(name = "last_error", length = 500)
    private String lastError;

    @Column(name = "next_attempt_at")
    private Instant nextAttemptAt;

    public StatBoardRun(Long sportId, String scopeType, Long scopeId) {
        this.sportId = sportId;
        this.scopeType = scopeType;
        this.scopeId = scopeId;
    }

    public StatBoardRun(Long sportId, String scopeType, Long scopeId, Long countryId) {
        this(sportId, scopeType, scopeId);
        this.countryId = countryId;
    }

    /** The composite primary key. */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        private Long sportId;
        private String scopeType;
        private Long scopeId;
    }
}
