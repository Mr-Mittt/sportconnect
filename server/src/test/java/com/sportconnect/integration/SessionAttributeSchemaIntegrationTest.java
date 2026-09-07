package com.sportconnect.integration;

import com.sportconnect.sport.api.dto.SessionAttributeGroup;
import com.sportconnect.sport.api.dto.SessionAttributeNode;
import com.sportconnect.sport.api.dto.SessionAttributeSchema;
import com.sportconnect.sport.api.dto.SportAttributeDefinition;
import com.sportconnect.sport.api.dto.SportAttributeGroup;
import com.sportconnect.sport.api.dto.SportAttributeSchema;
import com.sportconnect.sport.api.dto.SportAttributeType;
import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.repository.SportRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.http.MediaType;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A17 end-to-end coverage for the session-attribute-schema endpoints — an authorization boundary
 * (both admin writes and the active-only member GET), so they need a real request through real
 * Spring wiring rather than a mocked unit check (root {@code CLAUDE.md}, testing rules).
 *
 * <p>What only a real request proves here: the {@code @PreAuthorize} annotations actually fire
 * against {@code SecurityConfig}'s blanket {@code permitAll} on {@code /api/sports/**}; a session
 * document with a polymorphic {@code #ref}/own node list survives the JSON column round trip; and a
 * {@code #ref} resolves against the sport's stored <em>profile</em> schema through the real service
 * wiring, inheriting its type and gaining the {@code prefillable}/{@code prefillKey} markers.
 */
class SessionAttributeSchemaIntegrationTest extends BaseIT {

    @Autowired
    private SportRepository sportRepository;

    @Autowired
    private CacheManager cacheManager;

    private Long sportId;

    @BeforeEach
    void setUpFixtures() {
        sportRepository.deleteAll();
        sportId = sportRepository.save(Sport.builder()
                .name("A17 Badminton")
                .description("A17 session attribute schema fixture")
                .isActive(true)
                .build()).getId();
        evictSportCache();
    }

    @AfterEach
    void tearDownFixtures() {
        sportRepository.deleteAll();
        evictSportCache();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    /** gear -> rackets -> tension (NUMBER, 15..35), plus a loose gear/shoeSize. */
    private SportAttributeSchema profileSchema() {
        return SportAttributeSchema.builder()
                .defaultLocale("en")
                .groups(List.of(SportAttributeGroup.builder()
                        .key("gear").label(Map.of("en", "Gear")).isAvailable(true)
                        .attributes(List.of(SportAttributeDefinition.builder()
                                .key("shoeSize").label(Map.of("en", "Shoe size")).type(SportAttributeType.STRING)
                                .isAvailable(true).build()))
                        .groups(List.of(SportAttributeGroup.builder()
                                .key("rackets").label(Map.of("en", "Rackets")).isAvailable(true)
                                .attributes(List.of(SportAttributeDefinition.builder()
                                        .key("tension").label(Map.of("en", "Tension", "vi", "Độ căng"))
                                        .type(SportAttributeType.NUMBER).min(15.0).max(35.0)
                                        .isAvailable(true).build()))
                                .build()))
                        .build()))
                .build();
    }

    /** setup -> (own BOOLEAN ballsProvided) + (#ref gear/rackets/tension). */
    private SessionAttributeSchema sessionSchema() {
        return SessionAttributeSchema.builder()
                .defaultLocale("en")
                .groups(List.of(SessionAttributeGroup.builder()
                        .key("setup").label(Map.of("en", "Setup", "vi", "Chuẩn bị")).isAvailable(true)
                        .attributes(List.of(
                                SessionAttributeNode.builder()
                                        .key("ballsProvided").label(Map.of("en", "Balls provided?"))
                                        .type(SportAttributeType.BOOLEAN).build(),
                                SessionAttributeNode.builder().ref("gear/rackets/tension").build()))
                        .build()))
                .build();
    }

    private void putProfileSchema() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");
        mockMvc.perform(put("/api/sports/{sportId}/attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(profileSchema())))
                .andExpect(status().isOk());
        evictSportCache();
    }

    // ---- authorization boundary ----

    @Test
    void put_rejectsNonAdmin_withForbidden() throws Exception {
        authenticateAs(UUID.randomUUID());
        mockMvc.perform(put("/api/sports/{sportId}/session-attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(sessionSchema())))
                .andExpect(status().isForbidden());
    }

    @Test
    void put_rejectsAnonymous_withForbidden() throws Exception {
        mockMvc.perform(put("/api/sports/{sportId}/session-attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(sessionSchema())))
                .andExpect(status().isForbidden());
    }

    @Test
    void memberGet_rejectsAnonymous_withForbidden() throws Exception {
        mockMvc.perform(get("/api/sports/{sportId}/session-attribute-schema", sportId))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminGetAll_rejectsNonAdmin_withForbidden() throws Exception {
        authenticateAs(UUID.randomUUID());
        mockMvc.perform(get("/api/sports/all/{sportId}/session-attribute-schema", sportId))
                .andExpect(status().isForbidden());
    }

    // ---- behaviour ----

    @Test
    void adminPut_thenMemberGet_roundTripsAndResolvesTheRef() throws Exception {
        putProfileSchema();

        authenticateAs(UUID.randomUUID(), "ADMIN");
        mockMvc.perform(put("/api/sports/{sportId}/session-attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(sessionSchema())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.groups[0].attributes[1].['#ref']").value("gear/rackets/tension"));
        evictSportCache();

        // Member GET: #ref expanded (keyed by last segment), type inherited from the profile
        // attribute, prefill markers set, labels resolved for Accept-Language: vi.
        mockMvc.perform(get("/api/sports/{sportId}/session-attribute-schema", sportId)
                        .header("Accept-Language", "vi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.groups[0].label").value("Chuẩn bị"))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].key").value("ballsProvided"))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].prefillable").doesNotExist())
                .andExpect(jsonPath("$.data.groups[0].attributes[1].key").value("tension"))
                .andExpect(jsonPath("$.data.groups[0].attributes[1].type").value("NUMBER"))
                .andExpect(jsonPath("$.data.groups[0].attributes[1].min").value(15.0))
                .andExpect(jsonPath("$.data.groups[0].attributes[1].label").value("Độ căng"))
                .andExpect(jsonPath("$.data.groups[0].attributes[1].prefillable").value(true))
                .andExpect(jsonPath("$.data.groups[0].attributes[1].prefillKey").value("gear/rackets/tension"));
    }

    @Test
    void adminGetAll_returnsTheRawUnexpandedDocument() throws Exception {
        putProfileSchema();
        authenticateAs(UUID.randomUUID(), "ADMIN");
        mockMvc.perform(put("/api/sports/{sportId}/session-attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(sessionSchema())))
                .andExpect(status().isOk());
        evictSportCache();

        mockMvc.perform(get("/api/sports/all/{sportId}/session-attribute-schema", sportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.groups[0].attributes[1].['#ref']").value("gear/rackets/tension"))
                .andExpect(jsonPath("$.data.groups[0].attributes[1].type").doesNotExist());
    }

    @Test
    void adminPut_rejectsADanglingRef_atomically() throws Exception {
        putProfileSchema();
        authenticateAs(UUID.randomUUID(), "ADMIN");

        SessionAttributeSchema bad = SessionAttributeSchema.builder()
                .defaultLocale("en")
                .groups(List.of(SessionAttributeGroup.builder()
                        .key("setup").label(Map.of("en", "Setup")).isAvailable(true)
                        .attributes(List.of(SessionAttributeNode.builder().ref("gear/rackets/nope").build()))
                        .build()))
                .build();

        mockMvc.perform(put("/api/sports/{sportId}/session-attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(bad)))
                .andExpect(status().isBadRequest());
        evictSportCache();

        // nothing was written
        mockMvc.perform(get("/api/sports/{sportId}/session-attribute-schema", sportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    @Test
    void memberGet_treatsDeactivatedSportAsNotFound() throws Exception {
        putProfileSchema();
        authenticateAs(UUID.randomUUID(), "ADMIN");
        mockMvc.perform(put("/api/sports/{sportId}/session-attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(sessionSchema())))
                .andExpect(status().isOk());

        Sport sport = sportRepository.findById(sportId).orElseThrow();
        sport.setIsActive(false);
        sportRepository.save(sport);
        evictSportCache();

        authenticateAs(UUID.randomUUID());
        mockMvc.perform(get("/api/sports/{sportId}/session-attribute-schema", sportId))
                .andExpect(status().isNotFound());
    }

    @Test
    void memberGet_returnsNullDataWhenTheSessionSchemaIsUnset() throws Exception {
        authenticateAs(UUID.randomUUID());
        mockMvc.perform(get("/api/sports/{sportId}/session-attribute-schema", sportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").doesNotExist());
    }
}
