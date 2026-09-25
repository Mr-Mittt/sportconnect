package com.sportconnect.reference.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Where a coordinate falls, as seeded reference rows — what {@code ReferenceService#resolveByCoordinates}
 * returns to other domains (e.g. location-impl linking a venue to a country and region by id).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GeoMatch {

    /** The active country containing the point. Never {@code null} in a {@code GeoMatch}. */
    private CountryResponse country;

    /** The active region containing the point, or {@code null} (no seeded regions for the country, or none matched). */
    private RegionResponse region;
}
