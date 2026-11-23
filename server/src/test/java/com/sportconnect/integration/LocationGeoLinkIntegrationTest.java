package com.sportconnect.integration;

import com.sportconnect.location.api.dto.LocationResponse;
import com.sportconnect.location.api.service.LocationService;
import com.sportconnect.location.entity.Location;
import com.sportconnect.location.repository.LocationRepository;
import com.sportconnect.location.service.LocationGeoBackfillRunner;
import com.sportconnect.location.service.LocationGeoResolver;
import com.sportconnect.location.service.LocationTimeZoneResolver;
import com.sportconnect.reference.entity.Region;
import com.sportconnect.reference.repository.CountryRepository;
import com.sportconnect.reference.repository.LanguageRepository;
import com.sportconnect.reference.repository.RegionRepository;
import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.repository.SportRepository;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.locationtech.jts.geom.Coordinate;
import org.locationtech.jts.geom.GeometryFactory;
import org.locationtech.jts.geom.PrecisionModel;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.context.ApplicationContext;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.util.ReflectionUtils;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import javax.sql.DataSource;
import java.util.List;
import java.time.ZoneId;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * LOC-5: a venue's country and region, derived from its coordinates, through the real request pipeline (MockMvc,
 * real Spring wiring including the new {@code location-impl} to {@code reference-api} edge, real H2 round trips,
 * the real boundary polygons and the real {@code V073}/{@code V074} seed, as in {@code ReferenceApiIntegrationTest}).
 *
 * <p>The forced failure is real, not a mock: the {@code countries} table is renamed for the length of one request, so
 * {@code ReferenceServiceImpl}'s own query throws inside its transactional proxy, exactly where a real failure would.
 * (A {@code @SpyBean} would also do it, but it makes Spring build one more application context, and {@code :server:test}
 * already runs close to its heap limit.)
 *
 * <p>The timezone engine is replaced by a stub for the length of each test ({@link #stubTimeZoneEngine}): building the
 * real one (LOC-4, polygons for the whole world) is the single biggest allocation in the application and no other
 * integration test in this JVM creates a venue with coordinates, so loading it here would push the rest of
 * {@code :server:test} out of heap (seen: {@code OutOfMemoryError} in the test executor). The engine itself is LOC-4's.
 *
 * <p>The start-up runner is off under the test profile, so it is built by hand here from the real beans.
 */
class LocationGeoLinkIntegrationTest extends BaseIT {

    private static final String SEED = "db/changelog/changes/V073__seed_reference_data.sql";
    private static final String DEFAULT_LANGUAGE = "db/changelog/changes/V074__add_default_language_to_countries.sql";

    /** Ho Chi Minh City, inside the {@code VN-SG} province polygon. */
    private static final double HCMC_LAT = 10.7769;
    private static final double HCMC_LNG = 106.7009;
    /** Open ocean: no country polygon. */
    private static final double OCEAN_LAT = 0.0;
    private static final double OCEAN_LNG = -140.0;
    /** Phnom Penh: a real country polygon, but Cambodia is not seeded (REF-1 seeds Vietnam only). */
    private static final double UNSEEDED_LAT = 11.5564;
    private static final double UNSEEDED_LNG = 104.9282;

    private final GeometryFactory geometryFactory = new GeometryFactory(new PrecisionModel(), 4326);

    @Autowired private DataSource dataSource;
    @Autowired private LocationRepository locationRepository;
    @Autowired private LocationService locationService;
    @Autowired private LocationGeoResolver locationGeoResolver;
    @Autowired private CountryRepository countryRepository;
    @Autowired private RegionRepository regionRepository;
    @Autowired private LanguageRepository languageRepository;
    @Autowired private SportRepository sportRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private CacheManager cacheManager;
    @Autowired private ApplicationContext applicationContext;
    @Autowired private LocationTimeZoneResolver locationTimeZoneResolver;

    private UUID userId;
    private Long sportId;
    private Long vietnamId;
    private Object originalTimeZoneEngine;

    @BeforeEach
    void setUp() {
        stubTimeZoneEngine();
        clearAll();
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator(
                new ClassPathResource(SEED), new ClassPathResource(DEFAULT_LANGUAGE));
        populator.setSqlScriptEncoding("UTF-8");
        populator.execute(dataSource);
        vietnamId = countryRepository.findAll().stream()
                .filter(c -> "VN".equals(c.getIso2())).findFirst().orElseThrow().getId();
        userId = userRepository.save(User.builder()
                .email("loc5-user@example.com").firstName("Loc5").lastName("User")
                .username("loc5user").isActive(true).build()).getId();
        sportId = sportRepository.save(Sport.builder().name("LOC5 Badminton").isActive(true).build()).getId();
        evictSportCache();
    }

    @AfterEach
    void tearDown() {
        ReflectionTestUtils.setField(locationTimeZoneResolver, "timeZoneEngine", originalTimeZoneEngine);
        clearAll();
        evictSportCache();
    }

    /** Every coordinate answers {@code Asia/Ho_Chi_Minh}; the original (usually still unbuilt) engine is put back afterwards. */
    private void stubTimeZoneEngine() {
        originalTimeZoneEngine = ReflectionTestUtils.getField(locationTimeZoneResolver, "timeZoneEngine");
        // The engine type is location-impl's private dependency (not on this module's compile classpath), so the stub is
        // built from the field's own type; every call answers a zone (query is the only one the resolver makes).
        Class<?> engineType = ReflectionUtils.findField(LocationTimeZoneResolver.class, "timeZoneEngine").getType();
        Object stub = Mockito.mock(engineType, invocation -> Optional.of(ZoneId.of("Asia/Ho_Chi_Minh")));
        ReflectionTestUtils.setField(locationTimeZoneResolver, "timeZoneEngine", stub);
    }

    private void clearAll() {
        locationRepository.deleteAll();
        sportRepository.deleteAll();
        userRepository.deleteAll();
        regionRepository.deleteAllInBatch();
        countryRepository.deleteAllInBatch();
        languageRepository.deleteAllInBatch();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    private String createBody(Double lat, Double lng) {
        return "{\"sportId\":" + sportId + ",\"name\":\"LOC5 Court\""
                + (lat == null ? "" : ",\"latitude\":" + lat + ",\"longitude\":" + lng) + "}";
    }

    private Long postAndGetId(String body) throws Exception {
        authenticateAs(userId);
        String json = mockMvc.perform(post("/api/locations")
                        .contentType(MediaType.APPLICATION_JSON).content(body))
                .andExpect(status().is2xxSuccessful())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(json).path("data").path("id").asLong();
    }

    private Location venueAt(double lat, double lng) {
        return locationRepository.save(Location.builder().sportId(sportId).name("Pre-existing")
                .createdBy(userId).location(geometryFactory.createPoint(new Coordinate(lng, lat))).build());
    }

    private LocationGeoBackfillRunner runner() {
        return new LocationGeoBackfillRunner(locationRepository, locationGeoResolver);
    }

    // ---- create ----------------------------------------------------------------------------

    @Test
    void create_atHoChiMinhCity_storesVietnamAndTheVnSgRegion_andTheResponseCarriesThem() throws Exception {
        authenticateAs(userId);

        String json = mockMvc.perform(post("/api/locations")
                        .contentType(MediaType.APPLICATION_JSON).content(createBody(HCMC_LAT, HCMC_LNG)))
                .andExpect(status().is2xxSuccessful())
                .andExpect(jsonPath("$.data.countryId").value(vietnamId))
                .andExpect(jsonPath("$.data.regionId").isNumber())
                .andReturn().getResponse().getContentAsString();

        Long id = objectMapper.readTree(json).path("data").path("id").asLong();
        Location stored = locationRepository.findById(id).orElseThrow();
        assertThat(stored.getCountryId()).isEqualTo(vietnamId);
        Region region = regionRepository.findById(stored.getRegionId()).orElseThrow();
        assertThat(region.getIsoCode()).isEqualTo("VN-SG");
        assertThat(region.getCountryId()).isEqualTo(vietnamId);
        assertThat(stored.getTimezone()).isEqualTo("Asia/Ho_Chi_Minh");

        Map<Long, LocationResponse> byIds = locationService.getLocationsByIds(List.of(id));
        assertThat(byIds.get(id).getCountryId()).isEqualTo(vietnamId);
        assertThat(byIds.get(id).getRegionId()).isEqualTo(stored.getRegionId());
    }

    @Test
    void create_atMidOceanCoordinates_savesWithNullCountryAndRegion() throws Exception {
        Long id = postAndGetId(createBody(OCEAN_LAT, OCEAN_LNG));

        Location stored = locationRepository.findById(id).orElseThrow();
        assertThat(stored.getCountryId()).isNull();
        assertThat(stored.getRegionId()).isNull();
    }

    @Test
    void create_inACountryThatIsNotSeeded_savesWithNullCountryAndRegion() throws Exception {
        Long id = postAndGetId(createBody(UNSEEDED_LAT, UNSEEDED_LNG));

        Location stored = locationRepository.findById(id).orElseThrow();
        assertThat(stored.getCountryId()).isNull();
        assertThat(stored.getRegionId()).isNull();
    }

    @Test
    void create_withoutCoordinates_savesWithNullCountryAndRegion() throws Exception {
        Long id = postAndGetId(createBody(null, null));

        Location stored = locationRepository.findById(id).orElseThrow();
        assertThat(stored.getCountryId()).isNull();
        assertThat(stored.getRegionId()).isNull();
    }

    @Test
    void create_whenTheReferenceLookupFails_theVenueIsStillSaved_withItsTimezone() throws Exception {
        // The failure passes through ReferenceServiceImpl's transactional proxy. Without LocationGeoResolver running outside the
        // caller's transaction it would mark createLocation's transaction rollback-only and the save would fail at commit.
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("ALTER TABLE regions RENAME TO regions_hidden");
        jdbc.execute("ALTER TABLE countries RENAME TO countries_hidden");
        Long id;
        try {
            id = postAndGetId(createBody(HCMC_LAT, HCMC_LNG));
        } finally {
            jdbc.execute("ALTER TABLE countries_hidden RENAME TO countries");
            jdbc.execute("ALTER TABLE regions_hidden RENAME TO regions");
        }

        Location stored = locationRepository.findById(id).orElseThrow();
        assertThat(stored.getCountryId()).isNull();
        assertThat(stored.getRegionId()).isNull();
        assertThat(stored.getTimezone()).isEqualTo("Asia/Ho_Chi_Minh");
    }

    // ---- the backfill runner ---------------------------------------------------------------

    @Test
    void backfill_linksARowThatPredatesTheColumns_andIsIdempotent() {
        Location hcmc = venueAt(HCMC_LAT, HCMC_LNG);
        Location ocean = venueAt(OCEAN_LAT, OCEAN_LNG);
        Location noCoordinates = locationRepository.save(Location.builder()
                .sportId(sportId).name("No coordinates").createdBy(userId).build());
        Location alreadyLinked = venueAt(HCMC_LAT, HCMC_LNG);
        alreadyLinked.setCountryId(999L);
        alreadyLinked.setRegionId(998L);
        locationRepository.save(alreadyLinked);

        LocationGeoBackfillRunner.Result first = runner().backfill();

        assertThat(first.examined()).isEqualTo(2);
        assertThat(first.linked()).isEqualTo(1);
        assertThat(first.unresolved()).isEqualTo(1);
        Location linked = locationRepository.findById(hcmc.getId()).orElseThrow();
        assertThat(linked.getCountryId()).isEqualTo(vietnamId);
        assertThat(regionRepository.findById(linked.getRegionId()).orElseThrow().getIsoCode()).isEqualTo("VN-SG");
        assertThat(locationRepository.findById(ocean.getId()).orElseThrow().getCountryId()).isNull();
        assertThat(locationRepository.findById(noCoordinates.getId()).orElseThrow().getCountryId()).isNull();
        Location untouched = locationRepository.findById(alreadyLinked.getId()).orElseThrow();
        assertThat(untouched.getCountryId()).isEqualTo(999L);
        assertThat(untouched.getRegionId()).isEqualTo(998L);

        LocationGeoBackfillRunner.Result second = runner().backfill();

        assertThat(second.examined()).isEqualTo(1);
        assertThat(second.linked()).isZero();
        assertThat(locationRepository.findById(hcmc.getId()).orElseThrow().getCountryId()).isEqualTo(vietnamId);
    }

    @Test
    void backfill_isOffUnderTheTestProfile_andTheRealContextStartedWithTheNewBeanEdge() {
        assertThat(applicationContext.getBeansOfType(LocationGeoBackfillRunner.class)).isEmpty();
        assertThat(applicationContext.getBeansOfType(LocationGeoResolver.class)).hasSize(1);
    }
}
