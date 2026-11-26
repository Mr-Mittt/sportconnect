package com.sportconnect.session.api.dto;

import java.util.List;

/**
 * SESSION-54 slice B: one place on a board. {@code rank} is the competition rank (equal entries share it, so ranks can skip),
 * {@code prevRank} the rank in the build before ({@code null} when it was not listed then). {@code players} is one player for a
 * {@code SINGLE} board and the two players of a pair for a {@code PARTNER} board. {@code values} are the sort values of the
 * board's sort list, in its order ({@code null} where the player has no value).
 */
public record LeaderboardEntryDto(int rank, Integer prevRank, List<StatsPlayerDto> players, List<Double> values) {
}
