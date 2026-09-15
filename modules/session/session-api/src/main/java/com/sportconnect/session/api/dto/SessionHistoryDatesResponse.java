package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * SESSION-27 — response body for {@code GET /api/sessions/history?dateCount=<n>}: the caller's
 * last {@code dateCount} distinct history dates, most-recent-first, each with its own per-date
 * count. This is pagination over <em>distinct dates</em>, not over individual sessions — a given
 * date's own session list is fetched separately via {@code GET /api/sessions/history?date=<date>}.
 * {@code hasMore} signals whether a further, strictly-older distinct date exists past what's
 * returned here; paging further back passes the last returned date as {@code before}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionHistoryDatesResponse {

    private List<SessionHistoryDateCount> dates;

    private boolean hasMore;
}
