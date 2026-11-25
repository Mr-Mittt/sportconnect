package com.sportconnect.session.api.dto;

import org.springframework.data.domain.Page;

import java.time.Instant;
import java.util.List;

/**
 * SESSION-73: a group's member statistics for one sport ({@code GET /api/sessions/group/{groupId}/stats}).
 *
 * @param members the current, active members who have a counted game, most games first, one page
 * @param asOf    the newest update among all those members' rows (not only the page), {@code null} when none
 */
public record GroupStatisticsResponse(Long sportId, List<String> columns, Page<GroupStatisticsMemberDto> members,
                                      Instant asOf) {
}
