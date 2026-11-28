package com.sportconnect.session.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.Map;

/**
 * SESSION-55: what the create-season form pre-fills: the group's effective stat list and ranking rule (the client shows a tip that
 * they come from the group), the group's timezone and today's date in it, and the longest a season can be.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SeasonDefaultsResponse {

    /** {@code {columns, config}} as {@code StatsConfigs.effective} gives them for the group, without the {@code off} map. */
    private Map<String, Object> statsConfig;
    /** The rule the group's board uses today (group, then country, then sport), per kind; a kind without a rule is absent. */
    private Map<String, Object> rankingRule;
    private String timezone;
    private LocalDate today;
    private int maxDays;
}
