package com.sportconnect.group.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.DayOfWeek;
import java.time.LocalTime;

/** Partial update — only non-null fields are applied, same convention as UpdateGroupRequest. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateGroupRecurrenceRequest {

    private DayOfWeek recurrenceDayOfWeek;

    private LocalTime recurrenceTime;

    private Integer recurrenceDurationMinutes;

    private Long recurrenceLocationId;

    private String recurrenceLocationNote;
}
