package com.sportconnect.session.api.dto;

import java.util.List;

/** SESSION-73: one side of a counted game: its players and its score, one entry per score slot (an empty slot is {@code null}). */
public record StatsGameTeamDto(List<StatsPlayerDto> players, List<Integer> scores) {
}
