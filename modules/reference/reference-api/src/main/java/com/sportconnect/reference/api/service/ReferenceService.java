package com.sportconnect.reference.api.service;

import com.sportconnect.reference.api.dto.CountryResponse;
import com.sportconnect.reference.api.dto.LanguageResponse;
import com.sportconnect.reference.api.dto.RegionResponse;

import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * Read contract for the reference data every other domain links to: languages, countries and regions.
 *
 * <p>The list methods are <strong>active-only</strong> — they feed the selection dropdowns. The batch
 * lookups deliberately are <strong>not</strong>: a user or venue that already references a
 * since-deactivated country or region must still resolve its name (rows are deactivated, never
 * deleted). Other domains store ids only, so callers resolve display data through the batch methods —
 * collect the ids first and call once, never once per item.
 *
 * <p>The boundary resolver and {@code resolve(...)} are added by REF-2.
 */
public interface ReferenceService {

    /** Active languages ordered by {@code sort_order}, then code. */
    List<LanguageResponse> getActiveLanguages();

    /** Active countries ordered by English name. */
    List<CountryResponse> getActiveCountries();

    /**
     * Active regions of a country, ordered by English name. An active country with no seeded regions
     * yields an empty list, not an error.
     *
     * @throws com.sportconnect.common.exception.ResourceNotFoundException for an unknown or inactive country
     */
    List<RegionResponse> getActiveRegions(Long countryId);

    /**
     * Batch lookup by id — <strong>includes inactive rows</strong>. Unknown ids are absent from the map;
     * a {@code null} or empty collection yields an empty map. One query regardless of size.
     */
    Map<Long, CountryResponse> getCountriesByIds(Collection<Long> ids);

    /** Batch lookup by id — <strong>includes inactive rows</strong>; same contract as {@link #getCountriesByIds}. */
    Map<Long, RegionResponse> getRegionsByIds(Collection<Long> ids);

    /** Whether {@code code} is an active language's code. {@code null} or blank is {@code false}. */
    boolean isActiveLanguage(String code);

    /**
     * Validates a country/region selection. Valid: both {@code null}; a country alone; a country plus a
     * region that is active and belongs to that country.
     *
     * @throws com.sportconnect.common.exception.BadRequestException for a region without a country, an
     *         unknown or inactive country, or an unknown, inactive or foreign region
     */
    void requireValidSelection(Long countryId, Long regionId);
}
