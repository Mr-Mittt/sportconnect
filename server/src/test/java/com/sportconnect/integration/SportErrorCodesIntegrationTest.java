package com.sportconnect.integration;

import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.entity.UserSportProfile;
import com.sportconnect.sport.repository.SportRepository;
import com.sportconnect.sport.repository.UserSportProfileRepository;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.http.MediaType;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A25: the sport module's user-reachable error codes through the real pipeline (MockMvc, real
 * Spring wiring, real H2 round-trip, real {@code GlobalExceptionHandler}). Each case asserts the HTTP
 * status, {@code errorCode} and {@code errorParams} beside the unchanged English {@code message}.
 * Admin-only sport/schema errors are deliberately not covered (they stay uncoded, see the ticket).
 *
 * <p>{@link #cacheManager} is cleared per test: {@code SportLookupCache} holds the sport map with no
 * TTL.
 */
class SportErrorCodesIntegrationTest extends BaseIT {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SportRepository sportRepository;

    @Autowired
    private UserSportProfileRepository profileRepository;

    @Autowired
    private CacheManager cacheManager;

    private UUID ownerId;
    private UUID otherUserId;
    private Long sportId;
    private Long inactiveSportId;

    @BeforeEach
    void setUp() {
        clearAll();
        ownerId = userRepository.save(User.builder()
                .email("a25-owner@example.com").passwordHash("hash").firstName("A25").lastName("Owner")
                .username("a25owner").isActive(true).build()).getId();
        otherUserId = userRepository.save(User.builder()
                .email("a25-other@example.com").passwordHash("hash").firstName("A25").lastName("Other")
                .username("a25other").isActive(true).build()).getId();
        sportId = sportRepository.save(Sport.builder()
                .name("A25 Badminton").isActive(true)
                .attributesSchema(schemaWith("one", "two", "three"))
                .build()).getId();
        inactiveSportId = sportRepository.save(Sport.builder()
                .name("A25 Curling").isActive(false).build()).getId();
        evictSportCache();
    }

    @AfterEach
    void tearDown() {
        clearAll();
        evictSportCache();
    }

    private void clearAll() {
        profileRepository.deleteAll();
        sportRepository.deleteAll();
        userRepository.deleteAll();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    private static Map<String, Object> schemaWith(String... keys) {
        List<Map<String, Object>> attributes = new ArrayList<>();
        for (String key : keys) {
            attributes.add(Map.of(
                    "key", key, "label", Map.of("en", key), "type", "STRING",
                    "isAvailable", true));
        }
        return Map.of(
                "defaultLocale", "en",
                "groups", List.of(Map.of(
                        "key", "gear", "label", Map.of("en", "Gear"),
                        "isAvailable", true, "attributes", attributes)));
    }

    private Long storedProfile(UUID userId, Long sport, boolean active) {
        return profileRepository.save(UserSportProfile.builder()
                .userId(userId).sportId(sport).skillLevel("Advanced").bio("bio")
                .yearsOfExperience(4).isActive(active)
                .attributes(new HashMap<>())
                .build()).getId();
    }

    private static String createJson(Long sport) {
        return "{\"sportId\":" + sport + ",\"skillLevel\":\"Beginner\"}";
    }

    // ---- 409 duplicate profile -------------------------------------------------------------

    @Test
    void create_whenAnActiveProfileExists_is409WithTheSportName() throws Exception {
        storedProfile(ownerId, sportId, true);
        authenticateAs(ownerId);

        mockMvc.perform(post("/api/sports/profiles")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createJson(sportId)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SPORT_PROFILE_ALREADY_EXISTS"))
                .andExpect(jsonPath("$.errorParams.sportName").value("A25 Badminton"))
                .andExpect(jsonPath("$.message").value("User already has a profile for sport: A25 Badminton"));
    }

    @Test
    void resume_whenTheProfileIsStillActive_is409WithTheSameCode() throws Exception {
        storedProfile(ownerId, sportId, true);
        authenticateAs(ownerId);

        mockMvc.perform(post("/api/sports/profiles")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sportId\":" + sportId + ",\"isResume\":true}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SPORT_PROFILE_ALREADY_EXISTS"));
    }

    // ---- 400 resume / attributes -----------------------------------------------------------

    @Test
    void resume_withNothingToResume_is400() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(post("/api/sports/profiles")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sportId\":" + sportId + ",\"isResume\":true}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("PROFILE_NOT_RESUMABLE"))
                .andExpect(jsonPath("$.errorParams.sportName").value("A25 Badminton"));
    }

    @Test
    void create_withOversizedAttributes_is400WithTheLimit() throws Exception {
        authenticateAs(ownerId);
        String big = "x".repeat(1500);

        mockMvc.perform(post("/api/sports/profiles")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sportId\":" + sportId + ",\"skillLevel\":\"Beginner\",\"attributes\":{"
                                + "\"gear/one\":\"" + big + "\",\"gear/two\":\"" + big
                                + "\",\"gear/three\":\"" + big + "\"}}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("PROFILE_ATTRIBUTES_TOO_LARGE"))
                .andExpect(jsonPath("$.errorParams.maxBytes").value(4096));
    }

    // ---- 403 ownership ---------------------------------------------------------------------

    @Test
    void update_anotherUsersProfile_is403() throws Exception {
        Long profileId = storedProfile(ownerId, sportId, true);
        authenticateAs(otherUserId);

        mockMvc.perform(put("/api/sports/profiles/{id}", profileId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sportId\":" + sportId + ",\"skillLevel\":\"Beginner\",\"bio\":\"mine now\"}"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SPORT_PROFILE_NOT_OWNED"))
                .andExpect(jsonPath("$.message").value("You can only update your own sport profile"));
    }

    @Test
    void delete_anotherUsersProfile_is403() throws Exception {
        Long profileId = storedProfile(ownerId, sportId, true);
        authenticateAs(otherUserId);

        mockMvc.perform(delete("/api/sports/profiles/{id}", profileId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SPORT_PROFILE_NOT_OWNED"))
                .andExpect(jsonPath("$.message").value("You can only delete your own sport profile"));
    }

    @Test
    void view_anotherUsersProfile_is403() throws Exception {
        Long profileId = storedProfile(ownerId, sportId, true);
        authenticateAs(otherUserId);

        mockMvc.perform(get("/api/sports/profiles/{id}", profileId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SPORT_PROFILE_NOT_OWNED"))
                .andExpect(jsonPath("$.message").value("You can only view your own sport profile"));
    }

    // ---- 404 -------------------------------------------------------------------------------

    @Test
    void view_aMissingProfile_is404() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(get("/api/sports/profiles/{id}", 987654L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SPORT_PROFILE_NOT_FOUND"));
    }

    @Test
    void getMyProfileForASportWithNone_is404() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(get("/api/sports/profiles/sport/{sportId}", sportId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SPORT_PROFILE_NOT_FOUND"));
    }

    @Test
    void update_aMissingProfile_is404() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(put("/api/sports/profiles/{id}", 987654L)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sportId\":" + sportId + ",\"skillLevel\":\"Beginner\",\"bio\":\"x\"}"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SPORT_PROFILE_NOT_FOUND"));
    }

    @Test
    void create_forAnInactiveSport_is404() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(post("/api/sports/profiles")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createJson(inactiveSportId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SPORT_NOT_FOUND"));
    }

    @Test
    void getAnInactiveSport_is404() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(get("/api/sports/{id}", inactiveSportId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SPORT_NOT_FOUND"));
    }
}
