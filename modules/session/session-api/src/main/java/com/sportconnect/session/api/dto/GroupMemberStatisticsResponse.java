package com.sportconnect.session.api.dto;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * SESSION-73: one member's statistics in one group ({@code GET /api/sessions/group/{groupId}/stats/members/{userId}}).
 *
 * <p>A sport has one grouping only, so exactly one of {@code pairs} and {@code partners} is filled (both are empty for a sport
 * with no {@code groupBy}): {@code partners} for a sport grouped by {@code PARTNER} (badminton), {@code pairs} for one grouped
 * by {@code TEAM} (football).
 *
 * @param member        the member, shown even if they have left the group or been deactivated (this is group history)
 * @param totals        the value of every column over all the group's games; zeros for a member with none
 * @param pairs         results per team of the sport's {@code TEAM} size, most games first, one page; a group has no ranking
 *                      split, so each entry has the one map of values
 * @param pairsTotal    how many pairs the member has in all (the list is one page of them)
 * @param partners      results per teammate, most games first, one page
 * @param partnersTotal how many partners the member has in all
 */
public record GroupMemberStatisticsResponse(Long sportId, List<String> columns, StatsPlayerDto member,
                                            Map<String, Double> totals, List<GroupEntryDto> pairs, int pairsTotal,
                                            List<GroupEntryDto> partners, int partnersTotal, Instant asOf) {

    /** One pair, or one partner, of the member in the group: its players and its values by column key. */
    public record GroupEntryDto(List<StatsPlayerDto> players, Map<String, Double> values) {
    }
}
