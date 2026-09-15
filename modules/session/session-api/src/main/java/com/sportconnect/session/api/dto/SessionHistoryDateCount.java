package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/**
 * SESSION-27 — one entry of {@link SessionHistoryDatesResponse#getDates()}: a calendar date on
 * which the caller has at least one {@code CANCELLED}/{@code COMPLETED} session they were
 * {@code JOINED} to, and how many.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionHistoryDateCount {

    private LocalDate date;

    private long count;
}
