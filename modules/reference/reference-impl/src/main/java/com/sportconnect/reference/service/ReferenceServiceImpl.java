package com.sportconnect.reference.service;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.reference.api.dto.CountryResponse;
import com.sportconnect.reference.api.dto.LanguageResponse;
import com.sportconnect.reference.api.dto.RegionResponse;
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

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ReferenceServiceImpl implements ReferenceService {

    private final LanguageRepository languageRepository;
    private final CountryRepository countryRepository;
    private final RegionRepository regionRepository;

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
