package com.sportconnect.session.stats;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import jakarta.persistence.Version;
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
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * SESSION-55 (V112): one member's statistics over the games of one season, the same shape as {@link GroupMemberStats} (read and written by
 * {@link GroupStatsDoc}) keyed by season instead of group and sport. In-domain child of {@code group_seasons}.
 */
@Entity
@Table(name = "season_member_stats")
@IdClass(SeasonMemberStats.Key.class)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
public class SeasonMemberStats implements MemberStatsRow {

    @Id
    @Column(name = "season_id", nullable = false)
    private Long seasonId;

    @Id
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "stats", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> stats = new LinkedHashMap<>();

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "history", columnDefinition = "jsonb", nullable = false)
    private List<Object> history = new ArrayList<>();

    @Version
    @Column(name = "version")
    private Integer version;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    public SeasonMemberStats(Long seasonId, UUID userId) {
        this.seasonId = seasonId;
        this.userId = userId;
    }

    /** The composite primary key. */
    @Getter
    @Setter
    @NoArgsConstructor
    @AllArgsConstructor
    @EqualsAndHashCode
    public static class Key implements Serializable {
        private Long seasonId;
        private UUID userId;
    }
}
