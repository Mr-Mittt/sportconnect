package com.sportconnect.session.api.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * SESSION-GROUP-4 — create ({@code POST}) or replace ({@code PUT}) one recurrence configuration of a group: a wall-clock slot
 * (a day and a local start time, read in the location's timezone when sessions are generated) and what the generated
 * session carries. The mode is not sent: a new configuration takes the group's current mode, and a mode never changes.
 *
 * <p>{@code dayKey} and {@code startTime} are required; a configuration that lacks a location or a duration (or a fixed fee's
 * amount) is saved as a <b>draft</b> and is never generated until it is completed.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GroupSessionRecurrenceRequest {

    /** 1 to 7 (Monday first) for a weekly group, 1 to 31 for a monthly one. */
    private Integer dayKey;

    /** The local start time, e.g. {@code "18:30"}. */
    private LocalTime startTime;

    @Min(value = 1, message = "durationMinutes must be >= 1")
    private Integer durationMinutes;

    private Long locationId;

    @Size(max = 500, message = "locationNote must not exceed 500 characters")
    private String locationNote;

    /** {@code ALL_MEMBERS} (default) or {@code SPECIFIC} with {@code audienceUserIds}: who is notified when a session is generated. */
    private GroupAudience audience;

    /** With {@code SPECIFIC}: at least one member of the group, no upper limit. Ignored for {@code ALL_MEMBERS}. */
    private List<UUID> audienceUserIds;

    /** Omitted = free. */
    private FeeType feeType;

    private Long feeAmountVnd;

    @Size(max = 300, message = "feeNote must not exceed 300 characters")
    private String feeNote;

    /** 1 (for fun) to 10 (competitive); omitted = 5. */
    @Min(value = 1, message = "gameMood must be between 1 and 10")
    @Max(value = 10, message = "gameMood must be between 1 and 10")
    private Integer gameMood;

    /** Filtered against the group's sport's session attribute schema, as on a session. */
    private Map<String, Object> attributes;
}
