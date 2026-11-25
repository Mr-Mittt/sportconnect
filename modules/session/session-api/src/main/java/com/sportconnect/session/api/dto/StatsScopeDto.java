package com.sportconnect.session.api.dto;

import java.util.Map;

/**
 * SESSION-73: a player's ranking games at one place. {@code scope} is {@code REGION} or {@code COUNTRY}; the place is the
 * venue's (where the games were played), ids only (the client resolves names from {@code /api/reference}); {@code regionId}
 * is {@code null} for a {@code COUNTRY} entry. {@code values} is by column key, ranking games only.
 */
public record StatsScopeDto(String scope, Long countryId, Long regionId, Map<String, Double> values) {
}
