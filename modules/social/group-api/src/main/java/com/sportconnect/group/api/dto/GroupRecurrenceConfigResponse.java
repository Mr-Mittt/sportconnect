package com.sportconnect.group.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.UUID;

/**
 * Used exclusively by the session domain's scheduled generation job
 * ({@code getGroupsWithAutoGenerateSessionsEnabled}) — never call this per-row in a loop from
 * elsewhere; it already does its own batch resolution internally.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GroupRecurrenceConfigResponse {

    private Long groupId;

    private Long sportId;

    private UUID ownerId;

    private DayOfWeek recurrenceDayOfWeek;

    private LocalTime recurrenceTime;

    private Integer recurrenceDurationMinutes;

    private Long recurrenceLocationId;

    private String recurrenceLocationNote;
}
