package com.sportconnect.integration;

import com.sportconnect.common.attributes.AttributeDefinitionType;
import com.sportconnect.common.attributes.AttributeFieldLayout;
import com.sportconnect.common.attributes.AttributeGroup;
import com.sportconnect.common.attributes.AttributeLayout;
import com.sportconnect.common.attributes.AttributeSchema;
import com.sportconnect.common.attributes.Cardinality;
import com.sportconnect.common.attributes.field.StringField;
import com.sportconnect.common.attributes.node.BooleanAttribute;
import com.sportconnect.common.attributes.node.DefinitionAttribute;
import com.sportconnect.common.attributes.node.NumberAttribute;
import com.sportconnect.common.attributes.node.RefAttribute;
import com.sportconnect.common.attributes.node.StringAttribute;
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
    private AttributeSchema profileSchema() {
        return AttributeSchema.builder()
                .defaultLocale("en")
                .groups(List.of(AttributeGroup.builder()
                        .key("gear").label(Map.of("en", "Gear")).isAvailable(true)
                        .attributes(List.of(StringAttribute.builder()
                                .key("shoeSize").label(Map.of("en", "Shoe size"))
                                .isAvailable(true).build()))
                        .groups(List.of(AttributeGroup.builder()
                                .key("rackets").label(Map.of("en", "Rackets")).isAvailable(true)
                                .attributes(List.of(NumberAttribute.builder()
                                        .key("tension").label(Map.of("en", "Tension", "vi", "Độ căng"))
                                        .min(15.0).max(35.0)
                                        .isAvailable(true).build()))
                                .build()))
                        .build()))
                .build();
    }

    /** setup -> (own BOOLEAN ballsProvided) + (#ref gear/rackets/tension, SINGLE). */
    private AttributeSchema sessionSchema() {
        return AttributeSchema.builder()
                .defaultLocale("en")
                .groups(List.of(AttributeGroup.builder()
                        .key("setup").label(Map.of("en", "Setup", "vi", "Chuẩn bị")).isAvailable(true)
                        .attributes(List.of(
                                BooleanAttribute.builder()
                                        .key("ballsProvided").label(Map.of("en", "Balls provided?")).build(),
                                RefAttribute.builder().key("tension").ref("gear/rackets/tension")
                                        .cardinality(Cardinality.SINGLE).build()))
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
    void adminPut_thenMemberGet_stampsC11FieldsFromTheRefOntoTheResolvedNode() throws Exception {
        putProfileSchema();

        AttributeSchema session = AttributeSchema.builder()
                .defaultLocale("en")
                .groups(List.of(AttributeGroup.builder()
                        .key("setup").label(Map.of("en", "Setup")).isAvailable(true)
                        .attributes(List.of(RefAttribute.builder()
                                .key("tension").ref("gear/rackets/tension").cardinality(Cardinality.SINGLE)
                                .layout(AttributeLayout.builder().id("slider").icon("ruler")
                                        .format(Map.of("en", "0.0")).build())
                                .hidden(true)
                                .fieldLayouts(Map.of(
                                        "value", AttributeFieldLayout.builder().id("input").build(),
                                        "bogusKey", AttributeFieldLayout.builder().hidden(true).build()))
                                .build()))
                        .build()))
                .build();

        authenticateAs(UUID.randomUUID(), "ADMIN");
        mockMvc.perform(put("/api/sports/{sportId}/session-attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(session)))
                .andExpect(status().isOk());
        evictSportCache();

        // Member GET: the #ref's own layout / hidden / fieldLayouts are stamped onto the resolved
        // (expanded) node — the inlined concrete node never carries them.
        mockMvc.perform(get("/api/sports/{sportId}/session-attribute-schema", sportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.groups[0].attributes[0].key").value("tension"))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].type").value("NUMBER"))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].prefillable").value(true))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].layout.id").value("slider"))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].layout.format.en").value("0.0"))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].hidden").value(true))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].fieldLayouts.value.id").value("input"))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].fieldLayouts.bogusKey.hidden").value(true));
    }

    @Test
    void adminPut_rejectsAHiddenAndRequiredSessionDefinitionField_withBadRequest() throws Exception {
        putProfileSchema();

        AttributeSchema session = AttributeSchema.builder()
                .defaultLocale("en")
                .definitions(List.of(AttributeDefinitionType.builder()
                        .name("Note")
                        .fields(List.of(StringField.builder()
                                .key("text").label(Map.of("en", "Text"))
                                .isRequired(true).hidden(true).build()))
                        .build()))
                .groups(List.of(AttributeGroup.builder()
                        .key("setup").label(Map.of("en", "Setup")).isAvailable(true)
                        .attributes(List.of(DefinitionAttribute.builder()
                                .key("note").label(Map.of("en", "Note"))
                                .isAvailable(true).definitionRef("Note").build()))
                        .build()))
                .build();

        authenticateAs(UUID.randomUUID(), "ADMIN");
        mockMvc.perform(put("/api/sports/{sportId}/session-attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(session)))
                .andExpect(status().isBadRequest());
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
                // Since A23 the raw #ref node carries its wire discriminator "REF" and its cardinality;
                // it is still unexpanded (no inherited NUMBER type, no min).
                .andExpect(jsonPath("$.data.groups[0].attributes[1].type").value("REF"))
                .andExpect(jsonPath("$.data.groups[0].attributes[1].cardinality").value("SINGLE"))
                .andExpect(jsonPath("$.data.groups[0].attributes[1].min").doesNotExist());
    }

    @Test
    void adminPut_rejectsADanglingRef_atomically() throws Exception {
        putProfileSchema();
        authenticateAs(UUID.randomUUID(), "ADMIN");

        AttributeSchema bad = AttributeSchema.builder()
                .defaultLocale("en")
                .groups(List.of(AttributeGroup.builder()
                        .key("setup").label(Map.of("en", "Setup")).isAvailable(true)
                        .attributes(List.of(RefAttribute.builder().key("nope").ref("gear/rackets/nope")
                                .cardinality(Cardinality.SINGLE).build()))
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
