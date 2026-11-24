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
 * SESSION-53: the flat ranking projection. One row per subject (a player, or a combo of players) per board, holding the
 * sport's three sort values computed once when the row is written ({@code k1..k3}, null when a key has no value) and the
 * number of games. {@code boardRank} and {@code rankedAt} are written only by the ranking job (SESSION-54).
 *
 * <p>{@code scopeType} is {@code GROUP}, {@code REGION} or {@code COUNTRY} ({@code scopeId} the group, region or country
 * id); {@code kind} is {@code SINGLE} or {@code COMBO}; {@code subjectKey} a user id, or the sorted ids of a combo joined by
 * commas.
 */
@Entity
@Table(name = "leaderboard_entry")
@IdClass(LeaderboardEntry.Key.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class LeaderboardEntry {

    @Id
    @Column(name = "scope_type", nullable = false, length = 10)
    private String scopeType;

    @Id
    @Column(name = "scope_id", nullable = false)
    private Long scopeId;

    @Id
    @Column(name = "sport_id", nullable = false)
    private Long sportId;

    @Id
    @Column(name = "kind", nullable = false, length = 10)
    private String kind;

    @Id
    @Column(name = "subject_key", nullable = false, length = 255)
    private String subjectKey;

    @Column(name = "k1")
    private Double k1;

    @Column(name = "k2")
    private Double k2;

    @Column(name = "k3")
    private Double k3;

    @Column(name = "games", nullable = false)
    private Integer games = 0;

    /** Set by the ranking job; null until the board is first ranked, or while the entry is below the minimum games. */
    @Column(name = "rank")
    private Integer boardRank;

    @Column(name = "ranked_at")
    private Instant rankedAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    /** The composite primary key. */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        private String scopeType;
        private Long scopeId;
        private Long sportId;
        private String kind;
        private String subjectKey;
    }
}
