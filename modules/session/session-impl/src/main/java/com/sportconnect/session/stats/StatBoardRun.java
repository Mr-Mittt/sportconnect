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
 * entry of the board; the ranking job (SESSION-54) claims dirty boards, ranks them and clears the flag.
 */
@Entity
@Table(name = "stat_board_runs")
@IdClass(StatBoardRun.Key.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class StatBoardRun {

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
    private String status = "IDLE";

    @Column(name = "claimed_at")
    private Instant claimedAt;

    @Column(name = "computed_at")
    private Instant computedAt;

    public StatBoardRun(Long sportId, String scopeType, Long scopeId) {
        this.sportId = sportId;
        this.scopeType = scopeType;
        this.scopeId = scopeId;
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
