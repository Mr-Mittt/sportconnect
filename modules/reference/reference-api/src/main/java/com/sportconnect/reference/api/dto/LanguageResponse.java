package com.sportconnect.reference.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A language the app supports, identified by its BCP 47 {@code code} ({@code en}, {@code vi}) — the same
 * value {@code UserPreference.language} stores and the client's i18n bundles are keyed by.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class LanguageResponse {

    /** BCP 47 language tag; the stable identifier other domains and the client use. */
    private String code;

    /** English name, e.g. {@code Vietnamese}. */
    private String name;

    /** The language's own name, e.g. {@code Tiếng Việt}. */
    private String nativeName;
}
