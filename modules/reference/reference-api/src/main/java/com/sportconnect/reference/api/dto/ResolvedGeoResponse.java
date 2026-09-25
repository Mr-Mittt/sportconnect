package com.sportconnect.reference.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * The reference rows a {@link ResolveGeoRequest} matched. Every part is nullable and an unresolved request is a
 * normal, all-null result rather than an error — the client leaves the corresponding fields blank.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResolvedGeoResponse {

    /** Active language matched from the locales, else the resolved country's default language when that is active. */
    private LanguageResponse language;

    /** Active country matched by coordinates, then timezone, then locale region — {@code null} if none is seeded. */
    private CountryResponse country;

    /** Active region of {@link #country}; only ever set when {@link #source} is {@link GeoSource#COORDINATES}. */
    private RegionResponse region;

    /** Which signal produced {@link #country}; {@code null} exactly when {@code country} is {@code null}. */
    private GeoSource source;
}
