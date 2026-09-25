package com.sportconnect.reference.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A country. {@code name} is the English name; localized display is done by the client with
 * {@code Intl.DisplayNames}, keyed by {@code iso2}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CountryResponse {

    /** Generated id — what other domains store. Never assume a particular country's id; look it up by {@code iso2}. */
    private Long id;

    /** ISO 3166-1 alpha-2, e.g. {@code VN}. */
    private String iso2;

    /** ISO 3166-1 alpha-3, e.g. {@code VNM}. */
    private String iso3;

    /** English name. */
    private String name;

    /**
     * BCP 47 code of this country's default language (e.g. {@code vi} for Vietnam), or {@code null} when it has none.
     * Returned as stored: it may name a language that is not currently active, so a caller pre-filling a language
     * field must check it against the active language list.
     */
    private String defaultLanguageCode;
}
