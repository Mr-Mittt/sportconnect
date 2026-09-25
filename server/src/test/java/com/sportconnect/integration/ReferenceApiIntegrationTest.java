package com.sportconnect.integration;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.reference.api.dto.RegionResponse;
import com.sportconnect.reference.api.service.ReferenceService;
import com.sportconnect.reference.entity.Country;
import com.sportconnect.reference.api.dto.GeoMatch;
import com.sportconnect.reference.entity.Region;
import com.sportconnect.reference.repository.CountryRepository;
import com.sportconnect.reference.repository.LanguageRepository;
import com.sportconnect.reference.repository.RegionRepository;
import com.sportconnect.reference.service.GeoBoundaryResolver;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.web.servlet.ResultActions;

import javax.sql.DataSource;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * REF-1 end-to-end coverage of the public reference-data reads, through the real request pipeline:
 * real {@code SecurityConfig} filter chain, real {@code ReferenceController} / {@code ReferenceServiceImpl}
 * / repositories, real H2 round trips, and {@code GlobalExceptionHandler}'s exception-to-status mapping.
 *
 * <p>The seed is the <strong>real</strong> {@code V073__seed_reference_data.sql} followed by {@code V074} (default
 * language per country), executed against H2 in
 * {@link #setUp()} — the H2 {@code schema.sql} mirror deliberately carries no seed rows, so the assertions
 * about "what the migration seeds" are about the actual migration file, not a copy that could drift. (H2
 * does not run Liquibase; that the same SQL applies on real Postgres is checked separately by running the
 * app against the dev database.)
 *
 * <p>Every request is made with {@code anonymous()} on purpose: the point of REF-1's security change is
 * that a caller with no identity can read these, and that nothing else under the path becomes public.
 */
class ReferenceApiIntegrationTest extends BaseIT {

    private static final String SEED = "db/changelog/changes/V073__seed_reference_data.sql";
    /** REF-1 scope change 2: {@code ADD COLUMN IF NOT EXISTS} + the Vietnam {@code UPDATE}; run after the seed. */
    private static final String DEFAULT_LANGUAGE = "db/changelog/changes/V074__add_default_language_to_countries.sql";
    private static final int VIETNAM_REGION_COUNT = 63;

    @Autowired
    private DataSource dataSource;

    @Autowired
    private LanguageRepository languageRepository;

    @Autowired
    private CountryRepository countryRepository;

    @Autowired
    private RegionRepository regionRepository;

    @Autowired
    private ReferenceService referenceService;

    @Autowired
    private GeoBoundaryResolver geoBoundaryResolver;

    private Long vietnamId;

    @BeforeEach
    void setUp() {
        clearAll();
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator(new ClassPathResource(SEED), new ClassPathResource(DEFAULT_LANGUAGE));
        populator.setSqlScriptEncoding("UTF-8");
        populator.execute(dataSource);
        vietnamId = countryRepository.findAll().stream()
                .filter(c -> "VN".equals(c.getIso2())).findFirst().orElseThrow().getId();
    }

    @AfterEach
    void tearDown() {
        clearAll();
    }

    /** Children first: regions.country_id is a real FK. */
    private void clearAll() {
        regionRepository.deleteAllInBatch();
        countryRepository.deleteAllInBatch();
        languageRepository.deleteAllInBatch();
    }

    // ---------- the seed itself ----------

    @Test
    void seed_isVietnamOnlyWithSixtyThreeRegionsAndEnViLanguages() {
        assertThat(languageRepository.findAll()).extracting("code").containsExactlyInAnyOrder("en", "vi");

        List<Country> countries = countryRepository.findAll();
        assertThat(countries).hasSize(1);
        assertThat(countries.get(0).getIso2()).isEqualTo("VN");
        assertThat(countries.get(0).getIso3()).isEqualTo("VNM");
        assertThat(countries.get(0).getName()).isEqualTo("Vietnam");
        assertThat(countries.get(0).getDefaultLanguageCode()).isEqualTo("vi");

        List<Region> regions = regionRepository.findAll();
        assertThat(regions).hasSize(VIETNAM_REGION_COUNT);
        assertThat(regions).allSatisfy(r -> {
            assertThat(r.getCountryId()).isEqualTo(vietnamId);
            assertThat(r.getIsoCode()).startsWith("VN-");
            assertThat(r.getIsActive()).isTrue();
        });
        assertThat(regions.stream().map(Region::getIsoCode).collect(Collectors.toSet()))
                .hasSize(VIETNAM_REGION_COUNT);
        assertThat(regions).filteredOn(r -> "VN-SG".equals(r.getIsoCode()))
                .singleElement()
                .satisfies(r -> {
                    assertThat(r.getName()).isEqualTo("Ho Chi Minh");
                    assertThat(r.getNativeName()).isEqualTo("Hồ Chí Minh");
                });
    }

    // ---------- public reads through the real security chain ----------

    @Test
    void getLanguages_anonymous_returnsActiveLanguagesInSortOrder() throws Exception {
        mockMvc.perform(get("/api/reference/languages").with(anonymous()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(2)))
                .andExpect(jsonPath("$.data[0].code").value("en"))
                .andExpect(jsonPath("$.data[1].code").value("vi"))
                .andExpect(jsonPath("$.data[1].nativeName").value("Tiếng Việt"))
                .andExpect(jsonPath("$.data[0].isActive").doesNotExist());
    }

    @Test
    void getCountries_anonymous_returnsActiveCountries() throws Exception {
        mockMvc.perform(get("/api/reference/countries").with(anonymous()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].id").value(vietnamId.intValue()))
                .andExpect(jsonPath("$.data[0].iso2").value("VN"))
                .andExpect(jsonPath("$.data[0].iso3").value("VNM"))
                .andExpect(jsonPath("$.data[0].name").value("Vietnam"))
                .andExpect(jsonPath("$.data[0].defaultLanguageCode").value("vi"));
    }

    /** A country without a default language serializes {@code null}, not a missing field or an error. */
    @Test
    void getCountries_countryWithoutDefaultLanguage_hasNullDefaultLanguageCode() throws Exception {
        countryRepository.save(Country.builder().iso2("XC").iso3("XXC").name("Nodefaultland").build());

        mockMvc.perform(get("/api/reference/countries").with(anonymous()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[?(@.iso2 == 'XC')].defaultLanguageCode").value((Object) null));
    }

    @Test
    void getRegions_anonymous_returnsVietnamRegions() throws Exception {
        mockMvc.perform(get("/api/reference/countries/{countryId}/regions", vietnamId).with(anonymous()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(VIETNAM_REGION_COUNT)))
                .andExpect(jsonPath("$.data[0].countryId").value(vietnamId.intValue()))
                .andExpect(jsonPath("$.data[?(@.isoCode == 'VN-HN')].nativeName").value("Hà Nội"));
    }

    @Test
    void getRegions_countryWithNoRegions_returnsEmptyList() throws Exception {
        Long noRegionsId = countryRepository.save(Country.builder()
                .iso2("XA").iso3("XXA").name("Testland").build()).getId();

        mockMvc.perform(get("/api/reference/countries/{countryId}/regions", noRegionsId).with(anonymous()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));
    }

    @Test
    void getRegions_unknownCountry_returnsNotFound() throws Exception {
        mockMvc.perform(get("/api/reference/countries/{countryId}/regions", 999_999L).with(anonymous()))
                .andExpect(status().isNotFound());
    }

    @Test
    void getRegions_inactiveCountry_returnsNotFound() throws Exception {
        Country vietnam = countryRepository.findById(vietnamId).orElseThrow();
        vietnam.setIsActive(false);
        countryRepository.save(vietnam);

        mockMvc.perform(get("/api/reference/countries/{countryId}/regions", vietnamId).with(anonymous()))
                .andExpect(status().isNotFound());
        mockMvc.perform(get("/api/reference/countries").with(anonymous()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(0)));
    }

    @Test
    void getRegions_excludesInactiveRegions() throws Exception {
        Region hanoi = regionRepository.findAll().stream()
                .filter(r -> "VN-HN".equals(r.getIsoCode())).findFirst().orElseThrow();
        hanoi.setIsActive(false);
        regionRepository.save(hanoi);

        mockMvc.perform(get("/api/reference/countries/{countryId}/regions", vietnamId).with(anonymous()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(VIETNAM_REGION_COUNT - 1)))
                .andExpect(jsonPath("$.data[?(@.isoCode == 'VN-HN')]", hasSize(0)));
    }

    /** Only GET is public: nothing else under the path is opened up by the permit rule. */
    @Test
    void nonGetUnderReferencePath_anonymous_isRejectedByTheSecurityChain() throws Exception {
        mockMvc.perform(post("/api/reference/countries").with(anonymous()))
                .andExpect(status().isUnauthorized());
    }

    // ---------- the -api contract other domains will call, against real rows ----------

    @Test
    void batchLookups_includeDeactivatedRows_andOmitUnknownIds() {
        Region hanoi = regionRepository.findAll().stream()
                .filter(r -> "VN-HN".equals(r.getIsoCode())).findFirst().orElseThrow();
        hanoi.setIsActive(false);
        regionRepository.save(hanoi);

        Map<Long, RegionResponse> regions = referenceService.getRegionsByIds(List.of(hanoi.getId(), 999_999L));

        assertThat(regions.keySet()).containsExactly(hanoi.getId());
        assertThat(regions.get(hanoi.getId()).getNativeName()).isEqualTo("Hà Nội");
        assertThat(referenceService.getCountriesByIds(Set.of(vietnamId, 999_999L)).keySet())
                .containsExactly(vietnamId);
    }

    @Test
    void requireValidSelection_againstRealRows() {
        Long otherCountryId = countryRepository.save(Country.builder()
                .iso2("XB").iso3("XXB").name("Otherland").build()).getId();
        Long saigonId = regionRepository.findAll().stream()
                .filter(r -> "VN-SG".equals(r.getIsoCode())).findFirst().orElseThrow().getId();

        referenceService.requireValidSelection(null, null);
        referenceService.requireValidSelection(vietnamId, null);
        referenceService.requireValidSelection(vietnamId, saigonId);

        assertThatThrownBy(() -> referenceService.requireValidSelection(null, saigonId))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> referenceService.requireValidSelection(otherCountryId, saigonId))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> referenceService.requireValidSelection(999_999L, null))
                .isInstanceOf(BadRequestException.class);
    }

    /** The column is a real FK to languages(code): a default language that does not exist is rejected by the database. */
    @Test
    void defaultLanguageCode_mustReferenceAnExistingLanguage() {
        assertThatThrownBy(() -> countryRepository.saveAndFlush(Country.builder()
                .iso2("XD").iso3("XXD").name("Badlangland").defaultLanguageCode("zz").build()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void isActiveLanguage_againstRealRows() {
        assertThat(referenceService.isActiveLanguage("vi")).isTrue();
        assertThat(referenceService.isActiveLanguage("fr")).isFalse();
        assertThat(referenceService.isActiveLanguage(null)).isFalse();
    }

    // ---------- REF-2: POST /api/reference/resolve ----------
    //
    // The first request in this class that reaches GeoBoundaryResolver builds the real in-memory index inside a
    // real Spring context, so a green run is also the proof that the lazy initialisation neither breaks context
    // startup nor runs out of memory (LOC-4's failure mode, which is why the resolver uses a self-managed lazy field
    // rather than @Lazy).

    private static final String RESOLVE = "/api/reference/resolve";

    /** Anonymous POST of a raw JSON body — the caller of this endpoint has no identity by design. */
    private ResultActions resolve(String json) throws Exception {
        return mockMvc.perform(post(RESOLVE).with(anonymous()).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    @Test
    void resolve_anonymousWithHoChiMinhCityCoordinates_returnsTheSeededRegionCountryAndLocaleLanguage() throws Exception {
        resolve("""
                {"locales": ["en-US"], "latitude": 10.7769, "longitude": 106.7009}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.source").value("COORDINATES"))
                .andExpect(jsonPath("$.data.country.id").value(vietnamId.intValue()))
                .andExpect(jsonPath("$.data.country.iso2").value("VN"))
                .andExpect(jsonPath("$.data.region.isoCode").value("VN-SG"))
                .andExpect(jsonPath("$.data.region.countryId").value(vietnamId.intValue()))
                .andExpect(jsonPath("$.data.language.code").value("en"));
    }

    /** {@code Asia/Saigon} is a link zone {@code zone1970.tab} omits; browsers report it. No locale, so the country default decides the language. */
    @Test
    void resolve_legacyTimezoneAlias_resolvesVietnamAndItsDefaultLanguageWithoutARegion() throws Exception {
        resolve("""
                {"timeZoneId": "Asia/Saigon"}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.source").value("TIMEZONE"))
                .andExpect(jsonPath("$.data.country.iso2").value("VN"))
                .andExpect(jsonPath("$.data.language.code").value("vi"))
                .andExpect(jsonPath("$.data.region").isEmpty());
    }

    @Test
    void resolve_localeOnly_usesTheLocaleRegionAndLanguage() throws Exception {
        resolve("""
                {"locales": ["vi-VN", "en-US"]}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.source").value("LOCALE"))
                .andExpect(jsonPath("$.data.country.iso2").value("VN"))
                .andExpect(jsonPath("$.data.language.code").value("vi"));
    }

    /**
     * Only Vietnam is seeded (REF-4 seeds the rest), so a Paris coordinate has a polygon but no row: the result is
     * all-null, a plain 200. REF-4 flips this fixture to France once FR is seeded.
     */
    @Test
    void resolve_coordinatesInAnUnseededCountry_isAnAllNullOkNotAnError() throws Exception {
        resolve("""
                {"latitude": 48.8566, "longitude": 2.3522}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.country").isEmpty())
                .andExpect(jsonPath("$.data.region").isEmpty())
                .andExpect(jsonPath("$.data.language").isEmpty())
                .andExpect(jsonPath("$.data.source").isEmpty());
    }

    @Test
    void resolve_emptyBodyAndOpenOcean_areAllNullOk() throws Exception {
        resolve("{}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.country").isEmpty())
                .andExpect(jsonPath("$.data.source").isEmpty());
        resolve("""
                {"latitude": 0.0, "longitude": -140.0}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.country").isEmpty());
    }

    /** A signal for a country that exists but is deactivated must not pre-fill a dropdown that no longer lists it. */
    @Test
    void resolve_inactiveCountryAndRegion_areNotReturned() throws Exception {
        Region saigon = regionRepository.findAll().stream()
                .filter(r -> "VN-SG".equals(r.getIsoCode())).findFirst().orElseThrow();
        saigon.setIsActive(false);
        regionRepository.save(saigon);

        resolve("""
                {"latitude": 10.7769, "longitude": 106.7009}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.country.iso2").value("VN"))
                .andExpect(jsonPath("$.data.region").isEmpty());

        Country vietnam = countryRepository.findById(vietnamId).orElseThrow();
        vietnam.setIsActive(false);
        countryRepository.save(vietnam);

        resolve("""
                {"latitude": 10.7769, "longitude": 106.7009, "timeZoneId": "Asia/Saigon", "locales": ["vi-VN"]}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.country").isEmpty())
                .andExpect(jsonPath("$.data.source").isEmpty());
    }

    @Test
    void resolve_sizeAndRangeViolations_areBadRequests() throws Exception {
        String elevenLocales = "[" + "\"en\",".repeat(10) + "\"en\"]";
        String longLocale = "\"" + "x".repeat(36) + "\"";
        String longZone = "\"" + "z".repeat(65) + "\"";

        for (String body : List.of(
                "{\"latitude\": 10.7}",                                   // latitude without longitude
                "{\"longitude\": 106.7}",                                 // longitude without latitude
                "{\"locales\": " + elevenLocales + "}",                   // 11 locales
                "{\"locales\": [" + longLocale + "]}",                    // a locale over 35 characters
                "{\"timeZoneId\": " + longZone + "}",                     // a zone id over 64 characters
                "{\"latitude\": 91.0, \"longitude\": 0.0}",               // latitude out of range
                "{\"latitude\": -90.5, \"longitude\": 0.0}",
                "{\"latitude\": 0.0, \"longitude\": 181.0}",              // longitude out of range
                "{\"latitude\": 0.0, \"longitude\": -180.5}")) {
            resolve(body).andExpect(status().isBadRequest());
        }
    }

    /** The boundary values themselves are valid, and exactly ten locales are accepted. */
    @Test
    void resolve_boundaryValues_areAccepted() throws Exception {
        resolve("{\"latitude\": 90.0, \"longitude\": 180.0}").andExpect(status().isOk());
        resolve("{\"latitude\": -90.0, \"longitude\": -180.0}").andExpect(status().isOk());
        resolve("{\"locales\": [" + "\"en\",".repeat(9) + "\"en\"]}").andExpect(status().isOk());
    }

    /** Malformed locales and unknown zones are ignored (a pre-fill must not fail a sign-up), not rejected. */
    @Test
    void resolve_junkLocalesAndUnknownTimezone_areIgnored() throws Exception {
        resolve("""
                {"locales": ["", "!!!", "es-419"], "timeZoneId": "Not/AZone"}""")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.country").isEmpty())
                .andExpect(jsonPath("$.data.language").isEmpty());
    }

    /** Only the one exact POST path was opened up; the permit rule must not spread to other methods or paths. */
    @Test
    void resolve_permitRuleIsNotBroaderThanThePostResolvePath() throws Exception {
        mockMvc.perform(put(RESOLVE).with(anonymous()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/reference/languages").with(anonymous()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post(RESOLVE + "/anything").with(anonymous()).contentType(MediaType.APPLICATION_JSON).content("{}"))
                .andExpect(status().isUnauthorized());
    }

    /**
     * The invariant that keeps the seed and the bundled data honest, checked against the real seed migration:
     * every seeded region code has a polygon and every polygon has a seeded row (a mismatch would let detection
     * name a region the dropdown does not have, or leave a listed region undetectable); every seeded country has a
     * polygon (one-directional — the bundle holds all countries, only Vietnam is seeded until REF-4).
     */
    @Test
    void boundaryData_matchesTheSeededRowsOneToOne() {
        Set<String> seededRegions = regionRepository.findAll().stream().map(Region::getIsoCode).collect(Collectors.toSet());
        Set<String> seededCountries = countryRepository.findAll().stream().map(Country::getIso2).collect(Collectors.toSet());

        assertThat(geoBoundaryResolver.regionCodes()).isEqualTo(seededRegions);
        assertThat(geoBoundaryResolver.countryCodes()).containsAll(seededCountries);
    }

    @Test
    void resolveByCoordinates_throughTheServiceContract_returnsIdsForOtherDomains() {
        Optional<GeoMatch> match = referenceService.resolveByCoordinates(10.7769, 106.7009);

        assertThat(match).isPresent();
        assertThat(match.get().getCountry().getId()).isEqualTo(vietnamId);
        assertThat(match.get().getRegion().getIsoCode()).isEqualTo("VN-SG");
        assertThat(referenceService.resolveByCoordinates(48.8566, 2.3522)).isEmpty();
        assertThat(referenceService.resolveByCoordinates(0.0, -140.0)).isEmpty();
        assertThat(referenceService.resolveByCoordinates(200.0, 0.0)).isEmpty();
    }
}
