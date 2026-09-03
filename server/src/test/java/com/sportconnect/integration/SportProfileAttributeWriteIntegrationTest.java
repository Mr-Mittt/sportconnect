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

    /** A minimal stored schema document — one group, each named key a live {@code STRING} attribute. */
    private static Map<String, Object> schemaWith(String... keys) {
        List<Map<String, Object>> attributes = new ArrayList<>();
        int order = 1;
        for (String key : keys) {
            attributes.add(Map.of(
                    "key", key, "label", Map.of("en", key), "type", "STRING",
                    "isAvailable", true, "order", order++));
        }
        return Map.of(
                "defaultLocale", "en",
                "groups", List.of(Map.of(
                        "key", "gear", "label", Map.of("en", "Gear"),
                        "isAvailable", true, "order", 1, "attributes", attributes)));
    }

    private Long storedProfileWith(Map<String, Object> attributes) {
        return profileRepository.save(UserSportProfile.builder()
                .userId(userId).sportId(sportId).skillLevel("Intermediate").isActive(true)
                .attributes(new HashMap<>(attributes))
                .build()).getId();
    }

    @Test
    void put_withAttributeSetToJsonNull_removesThatStoredKey() throws Exception {
        Long profileId = storedProfileWith(Map.of("racket", "Yonex", "grip", "wet"));
        authenticateAs(userId);

        mockMvc.perform(put("/api/sports/profiles/{id}", profileId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sportId\":" + sportId + ",\"skillLevel\":\"Advanced\","
                                + "\"attributes\":{\"racket\":null}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attributes.grip").value("wet"))
                .andExpect(jsonPath("$.data.attributes.racket").doesNotExist());

        // Same result after a real re-read through the JSON column.
        mockMvc.perform(get("/api/sports/profiles/{id}", profileId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attributes.grip").value("wet"))
                .andExpect(jsonPath("$.data.attributes.racket").doesNotExist());
    }

    @Test
    void put_withEmptyString_storesItRatherThanDeleting() throws Exception {
        Long profileId = storedProfileWith(Map.of("racket", "Yonex"));
        authenticateAs(userId);

        mockMvc.perform(put("/api/sports/profiles/{id}", profileId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sportId\":" + sportId + ",\"skillLevel\":\"Advanced\","
                                + "\"attributes\":{\"racket\":\"\"}}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attributes.racket").value(""));
    }

    @Test
    void put_prunesAStoredKeyTheSchemaNoLongerDefines_evenWithNoAttributesInTheBody() throws Exception {
        // legacyKey is not in schemaWith("racket", "grip") — an orphan from a since-deleted definition.
        Long profileId = storedProfileWith(Map.of("racket", "Yonex", "legacyKey", "orphan"));
        authenticateAs(userId);

        mockMvc.perform(put("/api/sports/profiles/{id}", profileId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"sportId\":" + sportId + ",\"skillLevel\":\"Advanced\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attributes.racket").value("Yonex"))
                .andExpect(jsonPath("$.data.attributes.legacyKey").doesNotExist());
    }
}
