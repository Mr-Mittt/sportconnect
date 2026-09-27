package com.sportconnect.integration;

import com.sportconnect.user.entity.User;
import com.sportconnect.user.entity.UserPreference;
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
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * U16 — country / region on the profile update, the validated preference language, and the deactivated-caller rules,
 * through the real request pipeline: real {@code SecurityConfig} + {@code @PreAuthorize}, {@code UserController} and
 * {@code UserPreferenceController}, the real {@code user-impl → reference-api} wiring, real H2 round trips, and
 * {@code GlobalExceptionHandler}'s exception-to-status mapping. Reference data is the real {@code V073}/{@code V074}
 * seed.
 *
 * <p>Two things only an IT can show: a deactivated caller is turned away by the <em>service</em> (the JWT filter does
 * not recheck {@code isActive} — U12's known gap — so the authenticated request reaches it), and an old client's
 * free-text {@code "country"} is silently dropped by the real Jackson binding rather than rejected.
 *
 * <p>Note {@link #authenticateAs} takes effect only before a test method's first request, so every case that needs a
 * different identity is its own method.
 */
class ProfileGeoUpdateIntegrationTest extends BaseIT {

    @Autowired
    private DataSource dataSource;
    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserPreferenceRepository userPreferenceRepository;

    private Long vietnamId;
    private Long saigonId;
    private Long hanoiId;
    private UUID userId;

    @BeforeEach
    void setUp() {
        clearUsers();
        ReferenceTestData.reseed(dataSource);
        vietnamId = jdbc.queryForObject("SELECT id FROM countries WHERE iso2 = 'VN'", Long.class);
        saigonId = jdbc.queryForObject("SELECT id FROM regions WHERE iso_code = 'VN-SG'", Long.class);
        hanoiId = jdbc.queryForObject("SELECT id FROM regions WHERE iso_code = 'VN-HN'", Long.class);
        userId = saveUser("u16-owner", true, null, null, null);
    }

    @AfterEach
    void tearDown() {
        clearUsers();
        ReferenceTestData.clear(dataSource);
    }

    private void clearUsers() {
        userPreferenceRepository.deleteAll();
        userRepository.deleteAll();
    }

    private UUID saveUser(String label, boolean active, Long countryId, Long regionId, String legacyCountry) {
        return userRepository.save(User.builder()
                .email(label + "@example.com").passwordHash("hash")
                .firstName("Geo").lastName(label).username(label)
                .countryId(countryId).regionId(regionId).country(legacyCountry)
                .isActive(active).build()).getId();
    }

    private ResultActions updateProfile(UUID target, String json) throws Exception {
        return mockMvc.perform(put("/api/users/{id}/profile", target).contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private ResultActions updatePreferences(String json) throws Exception {
        return mockMvc.perform(put("/api/users/me/preferences").contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private User reload(UUID id) {
        return userRepository.findById(id).orElseThrow();
    }

    // ---------- profile: country / region ----------

    @Test
    void updateProfile_countryAndRegion_arePersistedAndReturnedAsResolvedNames() throws Exception {
        authenticateAs(userId);

        updateProfile(userId, "{\"countryId\": " + vietnamId + ", \"regionId\": " + saigonId + "}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.countryId").value(vietnamId.intValue()))
                .andExpect(jsonPath("$.data.regionId").value(saigonId.intValue()))
                .andExpect(jsonPath("$.data.country").value("Vietnam"))
                .andExpect(jsonPath("$.data.regionName").value("Ho Chi Minh"));

        User saved = reload(userId);
        assertThat(saved.getCountryId()).isEqualTo(vietnamId);
        assertThat(saved.getRegionId()).isEqualTo(saigonId);
    }

    @Test
    void updateProfile_regionOfAnotherCountry_isBadRequestAndLeavesTheProfileUntouched() throws Exception {
        jdbc.update("INSERT INTO countries (iso2, iso3, name, is_active) VALUES ('XA', 'XXA', 'Otherland', TRUE)");
        Long otherId = jdbc.queryForObject("SELECT id FROM countries WHERE iso2 = 'XA'", Long.class);
        authenticateAs(userId);

        updateProfile(userId, "{\"countryId\": " + otherId + ", \"regionId\": " + saigonId + ", \"bio\": \"must not be saved\"}")
                .andExpect(status().isBadRequest());

        User unchanged = reload(userId);
        assertThat(unchanged.getCountryId()).isNull();
        assertThat(unchanged.getRegionId()).isNull();
        assertThat(unchanged.getBio()).as("no other field is applied when the selection is invalid").isNull();
    }

    @Test
    void updateProfile_regionWithoutAnyCountry_isBadRequest() throws Exception {
        authenticateAs(userId);

        updateProfile(userId, "{\"regionId\": " + saigonId + "}").andExpect(status().isBadRequest());

        assertThat(reload(userId).getRegionId()).isNull();
    }

    @Test
    void updateProfile_unknownAndInactiveCountryOrRegion_areBadRequests() throws Exception {
        authenticateAs(userId);

        updateProfile(userId, "{\"countryId\": 999999}").andExpect(status().isBadRequest());
        updateProfile(userId, "{\"countryId\": " + vietnamId + ", \"regionId\": 999999}").andExpect(status().isBadRequest());

        jdbc.update("UPDATE regions SET is_active = FALSE WHERE id = ?", saigonId);
        updateProfile(userId, "{\"countryId\": " + vietnamId + ", \"regionId\": " + saigonId + "}").andExpect(status().isBadRequest());

        jdbc.update("UPDATE countries SET is_active = FALSE WHERE id = ?", vietnamId);
        updateProfile(userId, "{\"countryId\": " + vietnamId + "}").andExpect(status().isBadRequest());
    }

    /** A lone regionId is checked against the country already on the profile, and an absent regionId clears it. */
    @Test
    void updateProfile_loneRegionUsesTheStoredCountry_andAnAbsentRegionClearsIt() throws Exception {
        UUID linked = saveUser("u16-linked", true, vietnamId, null, null);
        authenticateAs(linked);

        updateProfile(linked, "{\"regionId\": " + hanoiId + "}").andExpect(status().isOk());
        assertThat(reload(linked).getRegionId()).isEqualTo(hanoiId);

        updateProfile(linked, "{\"countryId\": " + vietnamId + "}").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.regionName").isEmpty());
        assertThat(reload(linked).getRegionId()).as("countryId present + regionId absent replaces the region with none").isNull();
        assertThat(reload(linked).getCountryId()).isEqualTo(vietnamId);
    }

    /**
     * The consequence the ticket accepts and CLIENT-REF-3 closes: an old client still sends free-text
     * {@code "country"}. It is dropped by the real Jackson binding — not rejected, not stored — and the rest of the
     * request still applies.
     */
    @Test
    void updateProfile_legacyFreeTextCountry_isSilentlyIgnored() throws Exception {
        UUID legacy = saveUser("u16-legacy", true, null, null, "Atlantis");
        authenticateAs(legacy);

        updateProfile(legacy, "{\"country\": \"Narnia\", \"bio\": \"still saved\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.bio").value("still saved"))
                .andExpect(jsonPath("$.data.country").value("Atlantis"));

        User saved = reload(legacy);
        assertThat(saved.getCountry()).isEqualTo("Atlantis");
        assertThat(saved.getCountryId()).isNull();
        assertThat(saved.getBio()).isEqualTo("still saved");
    }

    // ---------- reads: resolved names and the legacy fallback ----------

    @Test
    void getMe_returnsTheResolvedNamesAndIds_orTheLegacyTextForAnUnlinkedUser() throws Exception {
        UUID linked = saveUser("u16-me-linked", true, vietnamId, saigonId, "old text");
        authenticateAs(linked);

        mockMvc.perform(get("/api/users/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.country").value("Vietnam"))
                .andExpect(jsonPath("$.data.countryId").value(vietnamId.intValue()))
                .andExpect(jsonPath("$.data.regionName").value("Ho Chi Minh"));
    }

    @Test
    void getMe_unlinkedUserKeepsShowingTheirLegacyCountryText() throws Exception {
        UUID unlinked = saveUser("u16-me-legacy", true, null, null, "Viet Nam (typed)");
        authenticateAs(unlinked);

        mockMvc.perform(get("/api/users/me"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.country").value("Viet Nam (typed)"))
                .andExpect(jsonPath("$.data.countryId").isEmpty());
    }

    @Test
    void searchUsers_resolvesLinkedCountryNames_andFallsBackToLegacyText() throws Exception {
        saveUser("u16-srch-linked", true, vietnamId, null, null);
        saveUser("u16-srch-legacy", true, null, null, "Typed Land");
        saveUser("u16-srch-none", true, null, null, null);
        authenticateAs(userId);

        mockMvc.perform(get("/api/users/search").param("q", "u16-srch"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[?(@.username == 'u16-srch-linked')].country").value("Vietnam"))
                .andExpect(jsonPath("$.data.content[?(@.username == 'u16-srch-legacy')].country").value("Typed Land"))
                .andExpect(jsonPath("$.data.content[?(@.username == 'u16-srch-none')].country").value((Object) null));
    }

    // ---------- account lifecycle: a deactivated caller ----------

    @Test
    void updateProfile_deactivatedCaller_isRejectedAndNothingChanges() throws Exception {
        UUID deactivated = saveUser("u16-off-profile", false, null, null, null);
        authenticateAs(deactivated);

        updateProfile(deactivated, "{\"countryId\": " + vietnamId + "}").andExpect(status().isNotFound());

        assertThat(reload(deactivated).getCountryId()).isNull();
    }

    @Test
    void getPreferences_deactivatedCaller_isRejectedAndNoRowIsCreated() throws Exception {
        UUID deactivated = saveUser("u16-off-prefget", false, null, null, null);
        authenticateAs(deactivated);

        mockMvc.perform(get("/api/users/me/preferences")).andExpect(status().isNotFound());

        assertThat(userPreferenceRepository.findByUserId(deactivated)).isEmpty();
    }

    @Test
    void updatePreferences_deactivatedCaller_isRejectedAndNoRowIsCreated() throws Exception {
        UUID deactivated = saveUser("u16-off-prefput", false, null, null, null);
        authenticateAs(deactivated);

        updatePreferences("{\"language\": \"vi\"}").andExpect(status().isNotFound());

        assertThat(userPreferenceRepository.findByUserId(deactivated)).isEmpty();
    }

    // ---------- preferences: language is now validated ----------

    @Test
    void updatePreferences_activeLanguage_isStored() throws Exception {
        authenticateAs(userId);

        updatePreferences("{\"language\": \"vi\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.language").value("vi"));

        assertThat(userPreferenceRepository.findByUserId(userId).orElseThrow().getLanguage()).isEqualTo("vi");
    }

    @Test
    void updatePreferences_unknownLanguage_isBadRequestAndKeepsTheStoredValue() throws Exception {
        userPreferenceRepository.save(UserPreference.builder().userId(userId).language("vi").build());
        authenticateAs(userId);

        updatePreferences("{\"language\": \"zz\"}").andExpect(status().isBadRequest());

        assertThat(userPreferenceRepository.findByUserId(userId).orElseThrow().getLanguage()).isEqualTo("vi");
    }

    @Test
    void updatePreferences_inactiveLanguage_isBadRequest() throws Exception {
        jdbc.update("UPDATE languages SET is_active = FALSE WHERE code = 'vi'");
        authenticateAs(userId);

        updatePreferences("{\"language\": \"vi\"}").andExpect(status().isBadRequest());
    }

    /** No language in the request means no language check: the other preferences still save. */
    @Test
    void updatePreferences_withoutLanguage_stillSavesTheOtherFields() throws Exception {
        authenticateAs(userId);

        updatePreferences("{\"timezone\": \"Asia/Ho_Chi_Minh\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.timezone").value("Asia/Ho_Chi_Minh"));
    }
}
