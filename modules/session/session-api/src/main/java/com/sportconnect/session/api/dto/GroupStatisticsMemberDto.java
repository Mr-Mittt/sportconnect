package com.sportconnect.session.api.dto;

import java.util.Map;

/** SESSION-73: one member's row in a group's statistics list: the member and the value of every column over all the group's games (totals only). */
public record GroupStatisticsMemberDto(StatsPlayerDto member, Map<String, Double> values) {
}
