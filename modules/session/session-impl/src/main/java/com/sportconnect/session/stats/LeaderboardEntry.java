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
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * SESSION-54 (V108, owner 2026-11-26): <b>one row per board</b>. {@code scopeType} is {@code GROUP}, {@code REGION} or
 * {@code COUNTRY} ({@code scopeId} the group, region or country id) and {@code kind} is {@code SINGLE} (a player) or
 * {@code PARTNER} (a pair). {@code tree} is the whole ranked board, a tree keyed by the sport's sort values whose rank is
 * derived from it, read and written by {@link com.sportconnect.session.ranking.BoardTree}; nothing else touches it.
 * {@code entries} is how many subjects it holds, {@code rulesVersion} the version of the sort rule it was built with (a
 * board whose version is not the rule's current one is rebuilt whole), {@code computedAt} when it was published.
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
    @Column(name = "sport_id", nullable = false)
    private Long sportId;

    @Id
    @Column(name = "scope_type", nullable = false, length = 10)
    private String scopeType;

    @Id
    @Column(name = "scope_id", nullable = false)
    private Long scopeId;

    @Id
    @Column(name = "kind", nullable = false, length = 10)
    private String kind;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "tree", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> tree = new LinkedHashMap<>();

    @Column(name = "entries", nullable = false)
    private Integer entries = 0;

    @Column(name = "rules_version", nullable = false)
    private Integer rulesVersion = 0;

    @Column(name = "computed_at", nullable = false)
    private Instant computedAt = Instant.now();

    public LeaderboardEntry(Long sportId, String scopeType, Long scopeId, String kind) {
        this.sportId = sportId;
        this.scopeType = scopeType;
        this.scopeId = scopeId;
        this.kind = kind;
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
        private String kind;
    }
}
