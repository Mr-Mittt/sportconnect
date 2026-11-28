package com.sportconnect.session.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.Map;

/**
 * SESSION-55: creates a group season. Dates are local dates in the group's timezone; {@code startDate} is today or later, the
 * season lasts at most 31 days. {@code statsConfig} and {@code rankingRule} are optional: left out, the group's effective ones
 * (what {@code GET .../seasons/defaults} shows) are copied; sent, they are checked like the group's own (a pre-fill the owner
 * edited). {@code rankingRule} is {@code {"SINGLE": {"sort": [...], "require": [...]}, "PARTNER": {...}}}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateSeasonRequest {

    @NotBlank(message = "Season name is required")
    @Size(max = 100, message = "Season name must be at most 100 characters")
    private String name;

    @NotNull(message = "Start date is required")
    private LocalDate startDate;

    @NotNull(message = "End date is required")
    private LocalDate endDate;

    /** {@code AUTO} when omitted. */
    private SeasonCollectionMode collectionMode;

    /** Start from the group's current leaderboard ranks (the {@code initRank} of each player or pair); {@code false} when omitted. */
    private Boolean inheritRanks;

    private Map<String, Object> statsConfig;

    private Map<String, Object> rankingRule;
}
