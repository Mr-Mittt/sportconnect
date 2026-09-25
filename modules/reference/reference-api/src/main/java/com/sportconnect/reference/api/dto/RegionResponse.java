package com.sportconnect.reference.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A region — the state / province level below a country (the "zone" of the Language / Country / Zone
 * feature; not a timezone).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RegionResponse {

    /** Generated id — what other domains store. */
    private Long id;

    /** The owning country's id. */
    private Long countryId;

    /** ISO 3166-2 code, e.g. {@code VN-SG}. */
    private String isoCode;

    /** English / romanized name. */
    private String name;

    /** Name in the country's own language, e.g. {@code Hồ Chí Minh}. */
    private String nativeName;
}
