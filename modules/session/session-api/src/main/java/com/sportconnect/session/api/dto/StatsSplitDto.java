package com.sportconnect.session.api.dto;

import java.util.Map;

/**
 * SESSION-73: one subject's values for every column, split three ways. Each map is keyed by column key; a value is
 * {@code null} where there is none (a division by zero, or a {@code MAX} or {@code MIN} metric in {@code normal}).
 *
 * @param all    every counted game
 * @param ranked the ranking games among them (proposed and confirmed by every player)
 * @param normal {@code all} minus {@code ranked}: the four core counters and {@code SUM} metrics subtract, a
 *               {@code MAX} or {@code MIN} metric has no difference, and derived columns are computed on the difference
 */
public record StatsSplitDto(Map<String, Double> all, Map<String, Double> ranked, Map<String, Double> normal) {
}
