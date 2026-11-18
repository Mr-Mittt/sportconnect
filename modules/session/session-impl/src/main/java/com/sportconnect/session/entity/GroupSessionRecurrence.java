package com.sportconnect.session.entity;

import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.GroupAudience;
import com.sportconnect.session.api.dto.RecurrenceMode;
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
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.annotations.UpdateTimestamp;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.Map;

/**
 * SESSION-GROUP-4 — one recurrence configuration of a group: a wall-clock slot (a day and a local start time) and what the
 * session generated from it carries. {@code groupId} and {@code locationId} are cross-domain ids: no FK. {@code draft} is
 * computed by the service on every save; a draft is never generated (SESSION-GROUP-5).
 */
@Entity
@Table(name = "group_session_recurrences")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class GroupSessionRecurrence {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "group_id", nullable = false)
    private Long groupId;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private RecurrenceMode mode;

    /** 1 to 7 (Monday first) in WEEKLY mode, 1 to 31 in MONTHLY mode. */
    @Column(name = "day_key", nullable = false)
    private Integer dayKey;

    /** A local wall-clock time; read in the location's timezone when a session is generated. */
    @Column(name = "start_time", nullable = false)
    private LocalTime startTime;

    @Column(name = "duration_minutes")
    private Integer durationMinutes;

    @Column(name = "location_id")
    private Long locationId;

    @Column(name = "location_note", length = 500)
    private String locationNote;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private GroupAudience audience = GroupAudience.ALL_MEMBERS;

    @Enumerated(EnumType.STRING)
    @Column(name = "fee_type", length = 10)
    private FeeType feeType;

    @Column(name = "fee_amount_vnd")
    private Long feeAmountVnd;

    @Column(name = "fee_note", length = 300)
    private String feeNote;

    @Column(name = "game_mood", nullable = false)
    @Builder.Default
    private Integer gameMood = 5;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "attributes", columnDefinition = "jsonb")
    private Map<String, Object> attributes;

    @Column(name = "is_draft", nullable = false)
    private boolean draft;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
