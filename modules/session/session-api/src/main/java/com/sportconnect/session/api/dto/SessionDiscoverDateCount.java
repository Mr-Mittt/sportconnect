package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;

/**
 * SESSION-39 — one entry of {@link SessionDiscoverDateCountsResponse#getCounts()}: a calendar date
 * within {@code GET /api/sessions/discover/counts}'s effective window/list, and how many
 * discoverable sessions (same gating as {@code /discover} itself) fall on it. Always present for
 * every date in the effective window, even a date with zero matching sessions.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionDiscoverDateCount {

    private LocalDate date;

    private long count;
}
