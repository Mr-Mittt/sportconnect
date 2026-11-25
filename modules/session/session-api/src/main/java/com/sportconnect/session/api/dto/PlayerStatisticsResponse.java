package com.sportconnect.session.api.dto;

import java.time.Instant;
import java.util.List;

/**
 * SESSION-73: the caller's statistics in one sport ({@code GET /api/stats/me}). The jsonb these come from is described in
 * {@code documentation/md/STATISTICS_JSONB_REFERENCE.md}.
 *
 * @param columns       the catalog keys to show, in order (the sport's record.scoreboard.columns; empty when its statistics are off)
 * @param totals        all, ranking and normal games
 * @param pairs         results per team of the sport's {@code TEAM} size (badminton: the pair), most games first, one page
 * @param pairsTotal    how many pairs the player has in all (the list is one page of them)
 * @param partners      results per teammate, most games first, one page
 * @param partnersTotal how many partners the player has in all
 * @param scopes        ranking games per region and country of the venues
 * @param asOf          when these numbers were last updated, {@code null} for a player with no counted game yet
 */
public record PlayerStatisticsResponse(Long sportId, List<String> columns, StatsSplitDto totals,
                                       List<StatsGroupDto> pairs, int pairsTotal,
                                       List<StatsGroupDto> partners, int partnersTotal,
                                       List<StatsScopeDto> scopes, Instant asOf) {
}
