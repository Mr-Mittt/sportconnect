package com.sportconnect.session.api.dto;

import java.util.List;

/**
 * SESSION-73: the counters of one group of players: a partner ({@code players} has the one teammate) or a pair or team
 * ({@code players} are its members, the asking player included).
 */
public record StatsGroupDto(List<StatsPlayerDto> players, StatsSplitDto values) {
}
