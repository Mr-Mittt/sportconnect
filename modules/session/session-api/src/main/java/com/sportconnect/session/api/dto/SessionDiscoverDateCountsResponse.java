package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * SESSION-39 — response body for {@code GET /api/sessions/discover/counts}: per-date counts of
 * discoverable sessions across a small, capped set of dates (at most 8 — either the caller's
 * explicit {@code date} list or the default today+7-days window), the data a UI needs to render
 * Discover's date-section headers before drilling into one specific day via
 * {@code GET /api/sessions/discover}. Not paginated — {@code counts} always covers the whole
 * effective window/list in one response.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionDiscoverDateCountsResponse {

    private List<SessionDiscoverDateCount> counts;
}
