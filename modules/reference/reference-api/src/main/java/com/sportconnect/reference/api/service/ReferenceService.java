package com.sportconnect.reference.api.service;

import com.sportconnect.reference.api.dto.CountryResponse;
import com.sportconnect.reference.api.dto.GeoMatch;
import com.sportconnect.reference.api.dto.LanguageResponse;
import com.sportconnect.reference.api.dto.RegionResponse;
import com.sportconnect.reference.api.dto.ResolveGeoRequest;
import com.sportconnect.reference.api.dto.ResolvedGeoResponse;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Read contract for the reference data every other domain links to: languages, countries and regions.
 *
 * <p>The list methods are <strong>active-only</strong> — they feed the selection dropdowns. The batch
 * lookups deliberately are <strong>not</strong>: a user or venue that already references a
 * since-deactivated country or region must still resolve its name (rows are deactivated, never
 * deleted). Other domains store ids only, so callers resolve display data through the batch methods —
 * collect the ids first and call once, never once per item.
 *
 * <p>{@link #resolveByCoordinates} and {@link #resolve} turn what a browser can tell us (coordinates, timezone,
 * locales) into reference rows using bundled boundary data — offline, no IP geolocation. Both resolve to
 * <strong>active, seeded</strong> rows only and never throw for input that merely fails to match.
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

    /**
     * Finds the active country — and, where regions are seeded, the active region — containing a coordinate.
     *
     * <p>Point-in-polygon against the bundled boundaries; empty when the point is in no country polygon (open
     * ocean), when its country is not seeded or is inactive, or when the coordinate is not a valid WGS 84
     * position (out of range or NaN). Never throws. Used by location-impl to link a venue by id.
     *
     * @param latitude  degrees, -90..90
     * @param longitude degrees, -180..180
     */
    Optional<GeoMatch> resolveByCoordinates(double latitude, double longitude);

    /**
     * Matches the signals in a {@link ResolveGeoRequest} to reference rows. Backs the public
     * {@code POST /api/reference/resolve}.
     *
     * <ul>
     *   <li><strong>Country:</strong> coordinates, then timezone, then the region subtag of the locales (first
     *       entry that resolves); a signal whose country is not seeded or is inactive falls through to the next.
     *       {@code source} names the winner and is {@code null} when there is no country.</li>
     *   <li><strong>Region:</strong> only when coordinates won, and always a region of the resolved country.</li>
     *   <li><strong>Language:</strong> the first locale whose primary subtag is an active language ({@code vi-VN}
     *       gives {@code vi}); otherwise the default language of the resolved country, when that is active.</li>
     * </ul>
     *
     * <p>Every part may be {@code null}; an unresolved request yields an all-null response, not an exception.
     * Malformed locale tags and unknown timezone ids are ignored. Size/range violations are rejected earlier, by
     * bean validation on the request.
     */
    ResolvedGeoResponse resolve(ResolveGeoRequest request);
}
