package com.sportconnect.session.stats;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * SESSION-54: one row of the append-only change log of a board. The statistics engine inserts one per player and board when
 * it counts a game (in the counting transaction); the ranking job takes the board's highest {@code id} as its cutoff, rebuilds
 * the entries of those players and deletes the rows up to the cutoff, so a game counted while it runs keeps its rows for the
 * next run. A row says only <i>who</i> changed, never how: the job reads the player's counters.
 */
@Entity
@Table(name = "stat_board_changes")
@Getter
@Setter
@NoArgsConstructor
public class StatBoardChange {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "sport_id", nullable = false)
    private Long sportId;

    @Column(name = "scope_type", nullable = false, length = 10)
    private String scopeType;

    @Column(name = "scope_id", nullable = false)
    private Long scopeId;

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt = Instant.now();

    public StatBoardChange(Long sportId, String scopeType, Long scopeId, UUID userId) {
        this.sportId = sportId;
        this.scopeType = scopeType;
        this.scopeId = scopeId;
        this.userId = userId;
    }
}
