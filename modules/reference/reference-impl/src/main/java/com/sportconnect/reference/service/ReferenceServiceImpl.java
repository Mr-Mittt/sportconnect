package com.sportconnect.reference.service;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.reference.api.dto.CountryResponse;
import com.sportconnect.reference.api.dto.GeoMatch;
import com.sportconnect.reference.api.dto.GeoSource;
import com.sportconnect.reference.api.dto.LanguageResponse;
import com.sportconnect.reference.api.dto.RegionResponse;
import com.sportconnect.reference.api.dto.ResolveGeoRequest;
import com.sportconnect.reference.api.dto.ResolvedGeoResponse;
import com.sportconnect.reference.api.service.ReferenceService;
import com.sportconnect.reference.entity.Country;
import com.sportconnect.reference.entity.Language;
import com.sportconnect.reference.entity.Region;
import com.sportconnect.reference.repository.CountryRepository;
import com.sportconnect.reference.repository.LanguageRepository;
import com.sportconnect.reference.repository.RegionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ReferenceServiceImpl implements ReferenceService {

    private final LanguageRepository languageRepository;
    private final CountryRepository countryRepository;
    private final RegionRepository regionRepository;
    private final GeoBoundaryResolver geoBoundaryResolver;

    @Override
    public List<LanguageResponse> getActiveLanguages() {
        return languageRepository.findByIsActiveTrueOrderBySortOrderAscCodeAsc().stream()
                .map(this::toLanguageResponse)
                .toList();
    }

    @Override
    public List<CountryResponse> getActiveCountries() {
        return countryRepository.findByIsActiveTrueOrderByNameAsc().stream()
                .map(this::toCountryResponse)
                .toList();
    }

    /**
     * {@inheritDoc}
     *
     * <p>The country check comes first so an unknown or inactive country is a {@code 404} rather than
     * being indistinguishable from an active country that simply has no regions (an empty list).
     */
    @Override
    public List<RegionResponse> getActiveRegions(Long countryId) {
        if (countryId == null || !countryRepository.existsByIdAndIsActiveTrue(countryId)) {
            throw new ResourceNotFoundException("Country", "id", countryId);
        }
        return regionRepository.findByCountryIdAndIsActiveTrueOrderByNameAsc(countryId).stream()
                .map(this::toRegionResponse)
                .toList();
    }

    /**
     * {@inheritDoc}
     *
     * <p>{@code findAllById} — one {@code IN} query — and deliberately no {@code is_active} filter (see
     * the interface contract).
     */
    @Override
    public Map<Long, CountryResponse> getCountriesByIds(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return Map.of();
        }
        return countryRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(Country::getId, this::toCountryResponse));
    }

    /** {@inheritDoc} */
    @Override
    public Map<Long, RegionResponse> getRegionsByIds(Collection<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return Map.of();
        }
        return regionRepository.findAllById(ids).stream()
                .collect(Collectors.toMap(Region::getId, this::toRegionResponse));
    }

    @Override
    public boolean isActiveLanguage(String code) {
        return code != null && !code.isBlank() && languageRepository.existsByCodeAndIsActiveTrue(code);
    }

    /**
     * {@inheritDoc}
     *
     * <p>Order matters: a region without a country is rejected before any lookup, then the country,
     * then the region against that country ({@code existsByIdAndCountryIdAndIsActiveTrue} covers
     * unknown, inactive and foreign in one query).
     */
    @Override
    public void requireValidSelection(Long countryId, Long regionId) {
        if (countryId == null) {
            if (regionId != null) {
                throw new BadRequestException("A region cannot be selected without a country");
            }
            return;
        }
        if (!countryRepository.existsByIdAndIsActiveTrue(countryId)) {
            throw new BadRequestException("Unknown or inactive country: " + countryId);
        }
        if (regionId != null && !regionRepository.existsByIdAndCountryIdAndIsActiveTrue(regionId, countryId)) {
            throw new BadRequestException("Region " + regionId + " is unknown, inactive, or not in country " + countryId);
        }
    }

    /**
     * {@inheritDoc}
     *
     * <p>Flow: locate the point in the bundled polygons, load the active country for its ISO code, then (if the
     * hit was inside a region polygon) the active region — which must belong to that country.
     */
    @Override
    public Optional<GeoMatch> resolveByCoordinates(double latitude, double longitude) {
        return geoBoundaryResolver.locate(latitude, longitude).flatMap(hit ->
                activeCountriesByIso2(List.of(hit.countryIso2())).values().stream().findFirst()
                        .map(country -> GeoMatch.builder()
                                .country(toCountryResponse(country))
                                .region(activeRegionOf(country, hit.regionIsoCode()).map(this::toRegionResponse).orElse(null))
                                .build()));
    }

    /**
     * {@inheritDoc}
     *
     * <p>Flow — at most four queries and none inside a loop: (1) collect the candidate country codes in
     * priority order (coordinates, timezone, each locale region) and load the active ones with a single {@code IN}
     * query, taking the first candidate that is seeded; (2) load the active languages for all locale primary
     * subtags with one query and take the first in browser order; (3) only if no locale matched and a country was
     * resolved, look up that country's default language; (4) the region, only when coordinates won.
     */
    @Override
    public ResolvedGeoResponse resolve(ResolveGeoRequest request) {
        if (request == null) {
            return ResolvedGeoResponse.builder().build();
        }
        List<String> locales = request.getLocales() == null ? List.of() : request.getLocales();

        // Country candidates, highest priority first. A candidate is only a code until it is matched to a row.
        List<CountryCandidate> candidates = new ArrayList<>();
        Optional<GeoBoundaryResolver.Hit> coordinateHit = (request.getLatitude() != null && request.getLongitude() != null)
                ? geoBoundaryResolver.locate(request.getLatitude(), request.getLongitude())
                : Optional.empty();
        coordinateHit.ifPresent(hit -> candidates.add(new CountryCandidate(hit.countryIso2(), GeoSource.COORDINATES)));
        geoBoundaryResolver.countryForTimeZone(request.getTimeZoneId())
                .ifPresent(iso2 -> candidates.add(new CountryCandidate(iso2, GeoSource.TIMEZONE)));
        for (String tag : locales) {
            Locale locale = parseLocale(tag);
            // Two letters only: Locale reports a numeric UN M.49 region (es-419) as its "country" too.
            if (locale != null && locale.getCountry().length() == 2) {
                candidates.add(new CountryCandidate(locale.getCountry(), GeoSource.LOCALE));
            }
        }

        Map<String, Country> seeded = activeCountriesByIso2(
                candidates.stream().map(CountryCandidate::iso2).collect(Collectors.toCollection(LinkedHashSet::new)));
        CountryCandidate winner = candidates.stream().filter(c -> seeded.containsKey(c.iso2())).findFirst().orElse(null);
        Country country = winner == null ? null : seeded.get(winner.iso2());

        Region region = null;
        if (country != null && winner.source() == GeoSource.COORDINATES) {
            region = activeRegionOf(country, coordinateHit.map(GeoBoundaryResolver.Hit::regionIsoCode).orElse(null)).orElse(null);
        }

        return ResolvedGeoResponse.builder()
                .language(resolveLanguage(locales, country))
                .country(country == null ? null : toCountryResponse(country))
                .region(region == null ? null : toRegionResponse(region))
                .source(winner == null ? null : winner.source())
                .build();
    }

    /** One {@code IN} query for the active countries among the given ISO codes, keyed by code. */
    private Map<String, Country> activeCountriesByIso2(Collection<String> iso2Codes) {
        if (iso2Codes.isEmpty()) {
            return Map.of();
        }
        return countryRepository.findByIso2InAndIsActiveTrue(iso2Codes).stream()
                .collect(Collectors.toMap(Country::getIso2, Function.identity()));
    }

    /** The active region with this code — only if it belongs to {@code country} (a code prefix is not proof of it). */
    private Optional<Region> activeRegionOf(Country country, String regionIsoCode) {
        if (regionIsoCode == null) {
            return Optional.empty();
        }
        return regionRepository.findByIsoCodeAndIsActiveTrue(regionIsoCode)
                .filter(region -> country.getId().equals(region.getCountryId()));
    }

    /**
     * First locale whose primary subtag is an active language, else the resolved country's default language when
     * it is active, else {@code null}. The browser list wins over the country default (REF-1 scope change 2).
     */
    private LanguageResponse resolveLanguage(List<String> locales, Country country) {
        Set<String> primarySubtags = new LinkedHashSet<>();
        for (String tag : locales) {
            Locale locale = parseLocale(tag);
            if (locale != null && !locale.getLanguage().isEmpty()) {
                primarySubtags.add(locale.getLanguage());
            }
        }
        if (!primarySubtags.isEmpty()) {
            Map<String, Language> active = languageRepository.findByCodeInAndIsActiveTrue(primarySubtags).stream()
                    .collect(Collectors.toMap(Language::getCode, Function.identity()));
            for (String subtag : primarySubtags) {
                Language match = active.get(subtag);
                if (match != null) {
                    return toLanguageResponse(match);
                }
            }
        }
        if (country != null && country.getDefaultLanguageCode() != null) {
            return languageRepository.findByCodeAndIsActiveTrue(country.getDefaultLanguageCode())
                    .map(this::toLanguageResponse)
                    .orElse(null);
        }
        return null;
    }

    /** Lenient BCP 47 parse ({@code vi-VN}, also {@code vi_VN}); {@code null} for a null, blank or unparseable tag. */
    private static Locale parseLocale(String tag) {
        if (tag == null || tag.isBlank()) {
            return null;
        }
        Locale locale = Locale.forLanguageTag(tag.trim().replace('_', '-'));
        return locale.getLanguage().isEmpty() && locale.getCountry().isEmpty() ? null : locale;
    }

    /** A country code proposed by one signal, before it is matched against the seeded rows. */
    private record CountryCandidate(String iso2, GeoSource source) {
    }

    private LanguageResponse toLanguageResponse(Language language) {
        return LanguageResponse.builder()
                .code(language.getCode())
                .name(language.getName())
                .nativeName(language.getNativeName())
                .build();
    }

    private CountryResponse toCountryResponse(Country country) {
        return CountryResponse.builder()
                .id(country.getId())
                .iso2(country.getIso2())
                .iso3(country.getIso3())
                .name(country.getName())
                .defaultLanguageCode(country.getDefaultLanguageCode())
                .build();
    }

    private RegionResponse toRegionResponse(Region region) {
        return RegionResponse.builder()
                .id(region.getId())
                .countryId(region.getCountryId())
                .isoCode(region.getIsoCode())
                .name(region.getName())
                .nativeName(region.getNativeName())
                .build();
    }
}
