package com.sportconnect.session.season;

import com.sportconnect.session.api.dto.SeasonCollectionMode;
import com.sportconnect.session.api.dto.SeasonStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
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
import java.util.UUID;

/**
 * SESSION-55 (V111): a group's season. {@code groupId}, {@code sportId}, {@code postId} and {@code createdBy} are cross-domain ids
 * (no foreign key). The season is the half-open range {@code [startAt, endAt)} of UTC instants; no timezone is stored.
 * {@link #statsConfig} and {@link #rankingRule} are the season's own copies (a pre-fill from the group, never a live link).
 */
@Entity
@Table(name = "group_seasons")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GroupSeason {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "group_id", nullable = false)
    private Long groupId;

    @Column(name = "sport_id", nullable = false)
    private Long sportId;

    @Column(nullable = false, length = 100)
    private String name;

    /** The first instant of the season: the start of its first day in the group's timezone when it was saved. */
    @Column(name = "start_at", nullable = false)
    private Instant startAt;

    /** The first instant after the season (exclusive): the start of the day after its last day in the group's timezone when it was saved. */
    @Column(name = "end_at", nullable = false)
    private Instant endAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 12)
    private SeasonStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "collection_mode", nullable = false, length = 8)
    private SeasonCollectionMode collectionMode;

    @Column(name = "inherit_ranks", nullable = false)
    private boolean inheritRanks;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "stats_config", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> statsConfig;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "ranking_rule", columnDefinition = "jsonb", nullable = false)
    private Map<String, Object> rankingRule;

    @Column(name = "post_id", nullable = false)
    private Long postId;

    @Column(name = "created_by", nullable = false)
    private UUID createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @Column(name = "cancelled_by")
    private UUID cancelledBy;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "finalised_at")
    private Instant finalisedAt;

    @Column(name = "last_error", length = 500)
    private String lastError;
}
