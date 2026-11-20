package com.sportconnect.session.api.dto;

import com.sportconnect.location.api.dto.LocationResponse;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;

/**
 * SESSION-GROUP-4 — one recurrence configuration. {@code draft} is computed by the server; {@code missing} names what is
 * still missing ({@code locationId}, {@code durationMinutes}, {@code feeAmountVnd}) and is empty for a complete one.
 * CLIENT-GROUP-SESSION-4 — {@code location} is the resolved location of {@code locationId} (the same shape a session response carries),
 * so a list can show its name without a lookup per row; null when the configuration has none or it is no longer available.
 * CLIENT-GROUP-SESSION-5 - {@code audienceMembers} replaces the bare member ids: the chosen members with their name and avatar (empty for
 * {@code ALL_MEMBERS}), resolved with one batch lookup per call, so the form can fill its member picker when it edits a configuration.
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
    private LocationResponse location;
    private String locationNote;
    private GroupAudience audience;
    /** The chosen members of a {@code SPECIFIC} audience, in the order they were picked; empty otherwise. */
    private List<GroupSessionAudienceMember> audienceMembers;
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
