package com.sportconnect.session.api.dto;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDate;
import java.util.Map;

/**
 * SESSION-55: edits a season. Only a {@code SCHEDULED} season can be edited (409 {@code SESSION_SEASON_NOT_EDITABLE} otherwise,
 * checked before any field); a {@code null} field keeps its value. The dates are checked again as for a new season.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateSeasonRequest {

    @Size(min = 1, max = 100, message = "Season name must be between 1 and 100 characters")
    private String name;

    private LocalDate startDate;

    private LocalDate endDate;

    private SeasonCollectionMode collectionMode;

    private Boolean inheritRanks;

    private Map<String, Object> statsConfig;

    private Map<String, Object> rankingRule;
}
