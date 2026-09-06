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

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A10 end-to-end: the two things {@code UserSportProfileServiceImplSpec} (which builds the request
 * object directly) cannot prove — that a JSON {@code null} in the attributes map survives
 * {@code @RequestBody} binding into a {@code Map} and reaches the Part 1 delete path, and that the
 * Part 2 stored-map prune runs through the real request pipeline and a real JSON column round trip
 * even when the request body carries no {@code attributes} at all.
 *
 * <p>{@link #cacheManager} is cleared per test — {@code SportLookupCache} holds the sport map (and
 * therefore each sport's schema) with no TTL.
 */
class SportProfileAttributeWriteIntegrationTest extends BaseIT {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SportRepository sportRepository;

    @Autowired
    private UserSportProfileRepository profileRepository;

    @Autowired
    private CacheManager cacheManager;

    private UUID userId;
    private Long sportId;

    @BeforeEach
    void setUp() {
        clearAll();
        userId = userRepository.save(User.builder()
                .email("a10@example.com").passwordHash("hash").firstName("A10").lastName("Tester")
                .username("a10tester").isActive(true).build()).getId();
        sportId = sportRepository.save(Sport.builder()
                .name("A10 Badminton").isActive(true)
                .attributesSchema(schemaWith("racket", "grip"))
                .build()).getId();
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

    /**
     * A minimal stored schema document — one group {@code gear}, each named key a live {@code STRING}
     * attribute under it. v3/A19: the stored profile map is keyed by the full path, so a key
     * {@code "racket"} here is written and read as {@code "gear/racket"}.
     */
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

    private Long storedProfileWith(Map<String, Object> attributes) {
        return profileRepository.save(UserSportProfile.builder()
                .userId(userId).sportId(sportId).skillLevel("Intermediate").isActive(true)
                .attributes(new HashMap<>(attributes))
                .build()).getId();
    }

    @Test
    void put_withAttributeSetToJsonNull_removesThatStoredKey() throws Exception {
        Long profileId = storedProfileWith(Map.of("gear/racket", "Yonex", "gear/grip", "wet"));
        authenticateAs(userId);

        mockMvc.perform(put("/api/sports/profiles/{id}", profileId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sportId\":" + sportId + ",\"skillLevel\":\"Advanced\","
                                + "\"attributes\":{\"gear/racket\":null}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attributes['gear/grip']").value("wet"))
                .andExpect(jsonPath("$.data.attributes['gear/racket']").doesNotExist());

        // Same result after a real re-read through the JSON column.
        mockMvc.perform(get("/api/sports/profiles/{id}", profileId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attributes['gear/grip']").value("wet"))
                .andExpect(jsonPath("$.data.attributes['gear/racket']").doesNotExist());
    }

    @Test
    void put_withEmptyString_storesItRatherThanDeleting() throws Exception {
        Long profileId = storedProfileWith(Map.of("gear/racket", "Yonex"));
        authenticateAs(userId);

        mockMvc.perform(put("/api/sports/profiles/{id}", profileId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sportId\":" + sportId + ",\"skillLevel\":\"Advanced\","
                                + "\"attributes\":{\"gear/racket\":\"\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attributes['gear/racket']").value(""));
    }

    @Test
    void put_prunesAStoredKeyTheSchemaNoLongerDefines_evenWithNoAttributesInTheBody() throws Exception {
        // gear/legacyKey is not in schemaWith("racket", "grip") — an orphan from a since-deleted definition.
        Long profileId = storedProfileWith(Map.of("gear/racket", "Yonex", "gear/legacyKey", "orphan"));
        authenticateAs(userId);

        mockMvc.perform(put("/api/sports/profiles/{id}", profileId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sportId\":" + sportId + ",\"skillLevel\":\"Advanced\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attributes['gear/racket']").value("Yonex"))
                .andExpect(jsonPath("$.data.attributes['gear/legacyKey']").doesNotExist());
    }

    @Test
    void put_thenGet_roundTripsAValueAtANestedGroupPath() throws Exception {
        // gear -> sub-group rackets -> attribute tension (STRING). Stored key is the full path.
        sportRepository.save(Sport.builder().id(sportId).name("Padel").isActive(true)
                .attributesSchema(Map.of(
                        "defaultLocale", "en",
                        "groups", List.of(Map.of(
                                "key", "gear", "label", Map.of("en", "Gear"), "isAvailable", true,
                                "groups", List.of(Map.of(
                                        "key", "rackets", "label", Map.of("en", "Rackets"), "isAvailable", true,
                                        "attributes", List.of(Map.of(
                                                "key", "tension", "label", Map.of("en", "Tension"),
                                                "type", "STRING", "isAvailable", true))))))))
                .build());
        evictSportCache();
        Long profileId = storedProfileWith(Map.of());
        authenticateAs(userId);

        mockMvc.perform(put("/api/sports/profiles/{id}", profileId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sportId\":" + sportId + ",\"skillLevel\":\"Advanced\","
                                + "\"attributes\":{\"gear/rackets/tension\":\"27\",\"gear/rackets/unknown\":\"x\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attributes['gear/rackets/tension']").value("27"))
                .andExpect(jsonPath("$.data.attributes['gear/rackets/unknown']").doesNotExist());

        mockMvc.perform(get("/api/sports/profiles/{id}", profileId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attributes['gear/rackets/tension']").value("27"));
    }
}
