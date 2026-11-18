package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * SESSION-GROUP-4 — one recurrence configuration. {@code draft} is computed by the server; {@code missing} names what is
 * still missing ({@code locationId}, {@code durationMinutes}, {@code feeAmountVnd}) and is empty for a complete one.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GroupSessionRecurrenceResponse {

    private Long id;
    private Long groupId;
    private RecurrenceMode mode;
    private Integer dayKey;
    private LocalTime startTime;
    private Integer durationMinutes;
    private Long locationId;
    private String locationNote;
    private GroupAudience audience;
    /** The chosen members of a {@code SPECIFIC} audience; empty otherwise. */
    private List<UUID> audienceUserIds;
    private FeeType feeType;
    private Long feeAmountVnd;
    private String feeNote;
    private Integer gameMood;
    private Map<String, Object> attributes;
    private boolean draft;
    private List<String> missing;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
