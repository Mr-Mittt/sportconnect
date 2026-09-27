package com.sportconnect.integration;

import com.sportconnect.auth.repository.RefreshTokenRepository;
import com.sportconnect.user.entity.Role;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.entity.UserPreference;
import com.sportconnect.user.repository.RoleRepository;
import com.sportconnect.user.repository.UserPreferenceRepository;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

import javax.sql.DataSource;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * U16 — optional country / region / language / coordinates at sign-up, through the real request pipeline:
 * the real anonymous {@code POST /api/auth/register}, {@code RegisterRequest} bean validation, {@code AuthServiceImpl},
 * the new {@code user-impl → reference-api} bean edge, real H2 round trips, and {@code GlobalExceptionHandler}'s
 * exception-to-status mapping.
 *
 * <p>What a mocked Spock spec cannot prove and this does: that the new cross-domain wiring starts (a bad cycle only
 * breaks at real {@code ApplicationContext} startup), that a rejected request <strong>persists nothing</strong> (the
 * user and its preference row live in one transaction with the validation), and that a saved point really round-trips
 * with X = longitude. The reference data is the real {@code V073}/{@code V074} seed, not a copy.
 */
class RegistrationGeoIntegrationTest extends BaseIT {

    private static final String REGISTER = "/api/auth/register";
    private static final String SAIGON_LAT_LON = "\"latitude\": 10.7769, \"longitude\": 106.7009";

    @Autowired
    private DataSource dataSource;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserPreferenceRepository userPreferenceRepository;
    @Autowired
    private RefreshTokenRepository refreshTokenRepository;
    @Autowired
    private RoleRepository roleRepository;

    private Long vietnamId;
    private Long saigonId;

    @BeforeEach
    void setUp() {
        clearUsers();
        ReferenceTestData.reseed(dataSource);
        // createUser requires the default USER role; the H2 schema mirror carries no seed rows.
        if (roleRepository.findByName(Role.USER).isEmpty()) {
            roleRepository.save(Role.builder().name(Role.USER).description("test").build());
        }
        vietnamId = jdbc.queryForObject("SELECT id FROM countries WHERE iso2 = 'VN'", Long.class);
        saigonId = jdbc.queryForObject("SELECT id FROM regions WHERE iso_code = 'VN-SG'", Long.class);
    }

    @AfterEach
    void tearDown() {
        clearUsers();
        ReferenceTestData.clear(dataSource);
    }

    private void clearUsers() {
        refreshTokenRepository.deleteAll();
        userPreferenceRepository.deleteAll();
        userRepository.deleteAll();
    }

    private ResultActions register(String email, String extras) throws Exception {
        String body = "{\"email\": \"" + email + "\", \"password\": \"password123\", \"fullName\": \"Geo Tester\""
                + (extras.isEmpty() ? "" : ", " + extras) + "}";
        return mockMvc.perform(post(REGISTER).with(anonymous()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    // ---------- happy paths ----------

    @Test
    void register_withLanguageCountryRegionAndCoordinates_persistsAllOfItAndReturnsTokens() throws Exception {
        register("u16-full@example.com", "\"languageCode\": \"vi\", \"countryId\": " + vietnamId
                + ", \"regionId\": " + saigonId + ", " + SAIGON_LAT_LON)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accessToken").isNotEmpty());

        User saved = userRepository.findByEmail("u16-full@example.com").orElseThrow();
        assertThat(saved.getCountryId()).isEqualTo(vietnamId);
        assertThat(saved.getRegionId()).isEqualTo(saigonId);
        // X = longitude, Y = latitude — the repo-wide point convention, checked through a real save/load.
        assertThat(saved.getLocation()).isNotNull();
        assertThat(saved.getLocation().getX()).isEqualTo(106.7009);
        assertThat(saved.getLocation().getY()).isEqualTo(10.7769);
        assertThat(saved.getLocation().getSRID()).isEqualTo(4326);

        Optional<UserPreference> preference = userPreferenceRepository.findByUserId(saved.getId());
        assertThat(preference).isPresent();
        assertThat(preference.get().getLanguage()).isEqualTo("vi");
    }

    /** The old client sends none of the new fields: same behavior as before U16 — no link, no point, no preference row. */
    @Test
    void register_withoutAnyExtras_behavesExactlyAsBefore() throws Exception {
        register("u16-plain@example.com", "")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accessToken").isNotEmpty());

        User saved = userRepository.findByEmail("u16-plain@example.com").orElseThrow();
        assertThat(saved.getCountryId()).isNull();
        assertThat(saved.getRegionId()).isNull();
        assertThat(saved.getLocation()).isNull();
        assertThat(userPreferenceRepository.findByUserId(saved.getId())).isEmpty();
    }

    @Test
    void register_countryAloneWithoutRegionOrLanguage_isValid() throws Exception {
        register("u16-country@example.com", "\"countryId\": " + vietnamId).andExpect(status().isOk());

        User saved = userRepository.findByEmail("u16-country@example.com").orElseThrow();
        assertThat(saved.getCountryId()).isEqualTo(vietnamId);
        assertThat(saved.getRegionId()).isNull();
        assertThat(userPreferenceRepository.findByUserId(saved.getId())).isEmpty();
    }

    /** A traveller signing up abroad: coordinates that disagree with the chosen country are tolerated, the dropdown wins. */
    @Test
    void register_coordinatesOutsideTheChosenCountry_areTolerated() throws Exception {
        register("u16-travel@example.com", "\"countryId\": " + vietnamId + ", \"latitude\": 48.8566, \"longitude\": 2.3522")
                .andExpect(status().isOk());

        User saved = userRepository.findByEmail("u16-travel@example.com").orElseThrow();
        assertThat(saved.getCountryId()).isEqualTo(vietnamId);
        assertThat(saved.getLocation().getX()).isEqualTo(2.3522);
    }

    // ---------- rejections: a 400 must create nothing ----------

    @Test
    void register_regionOfAnotherCountry_isBadRequestAndCreatesNothing() throws Exception {
        Long otherCountryId = insertCountry("XA", "XXA", "Otherland");

        register("u16-mismatch@example.com", "\"countryId\": " + otherCountryId + ", \"regionId\": " + saigonId
                + ", \"languageCode\": \"vi\"")
                .andExpect(status().isBadRequest());

        assertNothingCreated("u16-mismatch@example.com");
    }

    @Test
    void register_regionWithoutCountry_isBadRequestAndCreatesNothing() throws Exception {
        register("u16-noctry@example.com", "\"regionId\": " + saigonId).andExpect(status().isBadRequest());

        assertNothingCreated("u16-noctry@example.com");
    }

    @Test
    void register_unknownOrInactiveCountry_isBadRequestAndCreatesNothing() throws Exception {
        register("u16-unk-country@example.com", "\"countryId\": 999999").andExpect(status().isBadRequest());
        assertNothingCreated("u16-unk-country@example.com");

        jdbc.update("UPDATE countries SET is_active = FALSE WHERE id = ?", vietnamId);
        register("u16-off-country@example.com", "\"countryId\": " + vietnamId).andExpect(status().isBadRequest());
        assertNothingCreated("u16-off-country@example.com");
    }

    @Test
    void register_unknownOrInactiveLanguage_isBadRequestAndCreatesNothing() throws Exception {
        register("u16-unk-lang@example.com", "\"languageCode\": \"zz\"").andExpect(status().isBadRequest());
        assertNothingCreated("u16-unk-lang@example.com");

        jdbc.update("UPDATE languages SET is_active = FALSE WHERE code = 'vi'");
        register("u16-off-lang@example.com", "\"languageCode\": \"vi\"").andExpect(status().isBadRequest());
        assertNothingCreated("u16-off-lang@example.com");
    }

    @Test
    void register_badCoordinates_areBadRequestsAndCreateNothing() throws Exception {
        List<String> bodies = List.of(
                "\"latitude\": 10.7",                                  // latitude without longitude
                "\"longitude\": 106.7",                                // longitude without latitude
                "\"latitude\": 91.0, \"longitude\": 0.0",              // out of range
                "\"latitude\": 0.0, \"longitude\": -180.5");
        int n = 0;
        for (String extras : bodies) {
            String email = "u16-coord-" + (n++) + "@example.com";
            register(email, extras).andExpect(status().isBadRequest());
            assertNothingCreated(email);
        }
    }

    @Test
    void register_overlongLanguageCode_isBadRequest() throws Exception {
        register("u16-longlang@example.com", "\"languageCode\": \"" + "x".repeat(36) + "\"").andExpect(status().isBadRequest());
        assertNothingCreated("u16-longlang@example.com");
    }

    private void assertNothingCreated(String email) {
        assertThat(userRepository.findByEmail(email)).as("no user row for %s", email).isEmpty();
        assertThat(userPreferenceRepository.count()).as("no preference row").isZero();
    }

    private Long insertCountry(String iso2, String iso3, String name) {
        jdbc.update("INSERT INTO countries (iso2, iso3, name, is_active) VALUES (?, ?, ?, TRUE)", iso2, iso3, name);
        return jdbc.queryForObject("SELECT id FROM countries WHERE iso2 = ?", Long.class, iso2);
    }
}
