package com.sportconnect.group.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.DayOfWeek;
import java.time.LocalTime;

/**
 * Owner-facing recurring-session schedule for a group. {@code recurrenceLocationId} is returned
 * as a bare id — the client resolves display details via a separate
 * {@code GET /api/locations/{id}} call rather than this response embedding them.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GroupRecurrenceResponse {

    private Long groupId;

    private DayOfWeek recurrenceDayOfWeek;

    private LocalTime recurrenceTime;

    private Integer recurrenceDurationMinutes;

    private Long recurrenceLocationId;

    private String recurrenceLocationNote;
}
