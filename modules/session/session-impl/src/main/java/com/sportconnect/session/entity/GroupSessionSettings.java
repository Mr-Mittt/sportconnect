package com.sportconnect.session.entity;

import com.sportconnect.session.api.dto.RecurrenceMode;
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
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.Map;

/** SESSION-GROUP-4 — a group's regular-session settings. No row means OFF and WEEKLY (and, SESSION-78, statistics off). {@code groupId} is cross-domain: no FK. */
@Entity
@Table(name = "group_session_settings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GroupSessionSettings {

    @Id
    @Column(name = "group_id")
    private Long groupId;

    @Column(nullable = false)
    @Builder.Default
    private boolean enabled = false;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    @Builder.Default
    private RecurrenceMode mode = RecurrenceMode.WEEKLY;

    /**
     * SESSION-78 — the group's switch for its member statistics, head-to-head and leaderboard (V106). Off by default; the
     * statistics engine reads it when it counts a group session, and an owner or admin changes it with the settings.
     */
    @Column(name = "statistics_enabled", nullable = false)
    @Builder.Default
    private boolean statisticsEnabled = false;

    /**
     * SESSION-83 (V109) - the group's own config of the statistics it counts for its member row and board, keyed by stat
     * ({@code {"sessions": {"enabled": false, "when": ["joined"]}}}); {@code null} means the sport's config. Validated and
     * read by {@code StatsConfigs}; an owner or admin changes it with the settings.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "stats_config", columnDefinition = "jsonb")
    private Map<String, Object> statsConfig;

    @UpdateTimestamp
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;
}
