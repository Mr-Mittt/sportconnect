package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.List;

/**
 * SESSION-GROUP-12 — response body for {@code GET /api/sessions/group/{groupId}/history/dates}: the distinct end dates (in the
 * viewer's zone) of a group's finished sessions inside one window of calendar days, newest first, each with its count.
 *
 * <p>Unlike {@link SessionHistoryDatesResponse} (a number of dates, paged by the last date), the page is a fixed window of
 * days, so it can hold no date at all while older sessions exist: {@code hasMore} is what tells the client to offer the next
 * window. {@code nextBefore} is the window's first day; the next call passes it as {@code before}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GroupSessionHistoryDatesResponse {

    private List<SessionHistoryDateCount> dates;

    /** A session matching the status filter ends before this window. */
    private boolean hasMore;

    /** The first day of this window; pass it as {@code before} to get the window before it. */
    private LocalDate nextBefore;
}
