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
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * SESSION-54 (V108): the server-only ranking rule of a board, one row per sport, scope and kind. {@code scopeType} is
 * {@code SPORT} (the sport's default, {@code scopeId} 0), {@code COUNTRY} (every region board and the country board of that
 * country) or {@code GROUP} (one group's own); the board takes the most specific row that exists. {@code kind} is
 * {@code SINGLE} or {@code PARTNER}. {@code sort} is a {@link com.sportconnect.session.ranking.SortList}'s stored form,
 * {@code conditions} the preconditions a subject must meet to be listed ({@link com.sportconnect.session.ranking.RequireList}), {@code version} goes up by one on every change (a board built
 * with an older version is rebuilt whole). The client never sees it.
 */
@Entity
@Table(name = "sport_ranking_rules")
@IdClass(SportRankingRule.Key.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class SportRankingRule {

    public static final String SPORT = "SPORT";
    public static final String COUNTRY = "COUNTRY";
    public static final String GROUP = "GROUP";

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
    @Column(name = "sort", columnDefinition = "jsonb", nullable = false)
    private List<Object> sort = new ArrayList<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "conditions", columnDefinition = "jsonb", nullable = false)
    private List<Object> conditions = new ArrayList<>();

    @Column(name = "version", nullable = false)
    private Integer version = 1;

    @Column(name = "updated_by")
    private UUID updatedBy;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public SportRankingRule(Long sportId, String scopeType, Long scopeId, String kind) {
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
