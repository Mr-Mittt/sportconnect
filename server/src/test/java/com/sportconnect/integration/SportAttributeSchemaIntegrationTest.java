package com.sportconnect.integration;

import com.sportconnect.common.attributes.AttributeDefinitionType;
import com.sportconnect.common.attributes.AttributeGroup;
import com.sportconnect.common.attributes.AttributeOption;
import com.sportconnect.common.attributes.AttributeSchema;
import com.sportconnect.common.attributes.field.DefinitionField;
import com.sportconnect.common.attributes.field.EnumField;
import com.sportconnect.common.attributes.field.StringField;
import com.sportconnect.common.attributes.node.BooleanAttribute;
import com.sportconnect.common.attributes.node.DefinitionAttribute;
import com.sportconnect.common.attributes.node.DefinitionListAttribute;
import com.sportconnect.common.attributes.node.EnumAttribute;
import com.sportconnect.common.attributes.node.NumberAttribute;
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
 * A9 end-to-end coverage for the attribute-schema endpoints, which are an authorization boundary
 * and so need a real request through real Spring wiring rather than a mocked unit check
 * (root {@code CLAUDE.md}, testing rules).
 *
 * <p>Two things here cannot be proved by {@code SportServiceImplSpec}, which mocks its
 * collaborators:
 *
 * <ul>
 *   <li><b>That the {@code @PreAuthorize} annotations actually fire.</b> Method security is
 *       AOP-proxy-based, so a spec calling the service directly never evaluates them. This matters
 *       more than usual for the {@code GET}: {@code SecurityConfig} declares
 *       {@code /api/sports/**} blanket-{@code permitAll}, so the endpoint is public unless
 *       {@code isAuthenticated()} is genuinely being applied. Only a real request can tell the
 *       difference between "annotated" and "enforced".</li>
 *   <li><b>That the document survives a real JSON column round trip.</b> The schema is stored as an
 *       untyped map and re-read as typed DTOs; a spec asserting on an in-memory object never
 *       exercises the serialise/deserialise step where a shape mismatch would actually surface.</li>
 * </ul>
 *
 * <p>Since A23 the DTO tree is the domain-neutral {@code com.sportconnect.common.attributes} sealed
 * model — each attribute node is its own subtype and carries no {@code type} field of its own
 * (Jackson owns {@code "type"} as the polymorphic discriminator), so the wire {@code "type"}
 * property is unchanged and every assertion below still reads it the same way.
 *
 * <p>{@link #cacheManager} is cleared per test because {@code SportLookupCache} holds the sport map
 * with no TTL, so a schema written by one test would otherwise stay visible to the next.
 */
class SportAttributeSchemaIntegrationTest extends BaseIT {

    @Autowired
    private SportRepository sportRepository;

    @Autowired
    private CacheManager cacheManager;

    private Long sportId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        sportId = sportRepository.save(Sport.builder()
                .name("A9 Badminton")
                .description("A9 attribute schema fixture")
                .isActive(true)
                .build()).getId();
        evictSportCache();
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
        evictSportCache();
    }

    private void clearAll() {
        sportRepository.deleteAll();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    private AttributeSchema validSchema() {
        return AttributeSchema.builder()
                .defaultLocale("en")
                .groups(List.of(AttributeGroup.builder()
                        .key("gear")
                        .label(Map.of("en", "Gear"))
                        .isAvailable(true)

                        .attributes(List.of(
                                StringAttribute.builder()
                                        .key("racket").label(Map.of("en", "Racket"))
                                        .isAvailable(true).build(),
                                EnumAttribute.builder()
                                        .key("shuttlecock").label(Map.of("en", "Shuttlecock"))
                                        .options(List.of(
                                                AttributeOption.builder().value("feather").label(Map.of("en", "Feather")).build(),
                                                AttributeOption.builder().value("nylon").label(Map.of("en", "Nylon")).build()))
                                        .isAvailable(true).defaultValue("nylon").build()))
                        .build()))
                .build();
    }

    @Test
    void put_rejectsNonAdmin_withForbidden() throws Exception {
        authenticateAs(UUID.randomUUID());

        mockMvc.perform(put("/api/sports/{sportId}/attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(validSchema())))
                .andExpect(status().isForbidden());
    }

    @Test
    void put_rejectsAnonymous_withForbidden() throws Exception {
        // No authenticateAs call: /api/sports/** is permitAll, so the request reaches method
        // security, which is what must reject it.
        mockMvc.perform(put("/api/sports/{sportId}/attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(validSchema())))
                .andExpect(status().isForbidden());
    }

    @Test
    void get_rejectsAnonymous_withForbidden() throws Exception {
        // The case the blanket permitAll makes easy to get wrong: without @PreAuthorize this would
        // be a 200, since the path itself is public.
        mockMvc.perform(get("/api/sports/{sportId}/attribute-schema", sportId))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminPut_thenAuthenticatedGet_roundTripsTheDocument() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");

        mockMvc.perform(put("/api/sports/{sportId}/attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(validSchema())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.groups[0].key").value("gear"))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].key").value("racket"))
                .andExpect(jsonPath("$.data.groups[0].attributes[1].type").value("ENUM"))
                .andExpect(jsonPath("$.data.groups[0].attributes[1].options[1].value").value("nylon"))
                .andExpect(jsonPath("$.data.groups[0].attributes[1].defaultValue").value("nylon"));

        evictSportCache();

        // Same identity: BaseIT.authenticateAs cannot switch principal mid-test, and an admin also
        // satisfies isAuthenticated(), which is exactly why the GET is gated that way rather than
        // on hasRole('USER') — client ADMIN-2 reads this endpoint too.
        mockMvc.perform(get("/api/sports/{sportId}/attribute-schema", sportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.groups[0].attributes[0].key").value("racket"));
    }

    @Test
    void adminPut_rejectsDuplicateSiblingKeysWithinOneGroup_withBadRequest() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");

        // v3/A19: the same key is legal under two different groups, but not among siblings of the
        // same parent. Here one group carries `racket` twice.
        AttributeGroup gear = AttributeGroup.builder()
                .key("gear").label(Map.of("en", "Gear")).isAvailable(true)
                .attributes(List.of(
                        StringAttribute.builder()
                                .key("racket").label(Map.of("en", "Racket"))
                                .isAvailable(true).build(),
                        StringAttribute.builder()
                                .key("racket").label(Map.of("en", "Racket again"))
                                .isAvailable(true).build()))
                .build();

        mockMvc.perform(put("/api/sports/{sportId}/attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(AttributeSchema.builder()
                                .defaultLocale("en")
                                .groups(List.of(gear)).build())))
                .andExpect(status().isBadRequest());

        evictSportCache();

        // Rejected atomically: nothing was written, so the sport still offers no attributes.
        mockMvc.perform(get("/api/sports/{sportId}/attribute-schema", sportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    @Test
    void adminPut_thenGet_roundTripsANestedGroupTree_andMemberGetResolvesIt() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");

        // gear -> (loose attribute shoeSize) + sub-group rackets -> attribute tension
        AttributeSchema nested = AttributeSchema.builder()
                .defaultLocale("en")
                .groups(List.of(AttributeGroup.builder()
                        .key("gear").label(Map.of("en", "Gear", "vi", "Đồ nghề")).isAvailable(true)
                        .attributes(List.of(StringAttribute.builder()
                                .key("shoeSize").label(Map.of("en", "Shoe size"))
                                .isAvailable(true).build()))
                        .groups(List.of(AttributeGroup.builder()
                                .key("rackets").label(Map.of("en", "Rackets", "vi", "Vợt")).isAvailable(true)
                                .attributes(List.of(NumberAttribute.builder()
                                        .key("tension").label(Map.of("en", "Tension", "vi", "Độ căng"))
                                        .min(15.0).max(35.0)
                                        .isAvailable(true).build()))
                                .build()))
                        .build()))
                .build();

        mockMvc.perform(put("/api/sports/{sportId}/attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(nested)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.groups[0].groups[0].key").value("rackets"))
                .andExpect(jsonPath("$.data.groups[0].groups[0].attributes[0].key").value("tension"));

        evictSportCache();

        mockMvc.perform(get("/api/sports/{sportId}/attribute-schema", sportId)
                        .header("Accept-Language", "vi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.groups[0].attributes[0].key").value("shoeSize"))
                .andExpect(jsonPath("$.data.groups[0].groups[0].label").value("Vợt"))
                .andExpect(jsonPath("$.data.groups[0].groups[0].attributes[0].label").value("Độ căng"))
                .andExpect(jsonPath("$.data.groups[0].groups[0].attributes[0].min").value(15.0));
    }

    @Test
    void get_treatsDeactivatedSportAsNotFound() throws Exception {
        authenticateAs(UUID.randomUUID());

        Sport sport = sportRepository.findById(sportId).orElseThrow();
        sport.setIsActive(false);
        sportRepository.save(sport);
        evictSportCache();

        // A7 collapses inactive into not-found rather than exposing a 400 about a sport the
        // catalogue never offered.
        mockMvc.perform(get("/api/sports/{sportId}/attribute-schema", sportId))
                .andExpect(status().isNotFound());
    }

    // --- A11: the admin read of an inactive sport's schema ---

    @Test
    void adminGetAll_rejectsNonAdmin_withForbidden() throws Exception {
        authenticateAs(UUID.randomUUID());

        mockMvc.perform(get("/api/sports/all/{sportId}/attribute-schema", sportId))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminGetAll_rejectsAnonymous_withForbidden() throws Exception {
        // Same trap as get_rejectsAnonymous_withForbidden above: /api/sports/** is blanket
        // permitAll, so without @PreAuthorize this path would answer anonymous callers.
        mockMvc.perform(get("/api/sports/all/{sportId}/attribute-schema", sportId))
                .andExpect(status().isForbidden());
    }

    @Test
    void adminGetAll_returnsSchemaForDeactivatedSport_whereMemberGetIs404() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");

        mockMvc.perform(put("/api/sports/{sportId}/attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(validSchema())))
                .andExpect(status().isOk());

        Sport sport = sportRepository.findById(sportId).orElseThrow();
        sport.setIsActive(false);
        sportRepository.save(sport);
        evictSportCache();

        // The whole point of A11, asserted as a pair: the member-facing read still collapses an
        // inactive sport into 404 (A6/A7 invisibility, unchanged), while the admin twin returns the
        // document the admin PUT was always allowed to write.
        mockMvc.perform(get("/api/sports/{sportId}/attribute-schema", sportId))
                .andExpect(status().isNotFound());

        mockMvc.perform(get("/api/sports/all/{sportId}/attribute-schema", sportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.groups[0].key").value("gear"));
    }

    @Test
    void adminGetAll_returnsNotFoundForUnknownSport() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");

        mockMvc.perform(get("/api/sports/all/{sportId}/attribute-schema", 999999L))
                .andExpect(status().isNotFound());
    }

    // --- v2 / A12: definitions registry, DEFINITION / DEFINITION_LIST ---

    /**
     * {@code Shoe{shoe: Reference(required), size: ShoeSize(optional)}} plus a bare
     * {@code Reference}-typed {@code rackets: DEFINITION_LIST} — the same shape used throughout the
     * v2 design doc and the unit-level specs, here round-tripped through the real JSON column.
     */
    private AttributeSchema v2SchemaWithDefinitions() {
        AttributeDefinitionType reference = AttributeDefinitionType.builder().name("Reference").fields(List.of(
                        StringField.builder().key("id").label(Map.of("en", "Id"))
                                .isRequired(false).build(),
                        StringField.builder().key("value").label(Map.of("en", "Value"))
                                .isRequired(true).build()))
                .build();
        AttributeDefinitionType shoeSize = AttributeDefinitionType.builder().name("ShoeSize").fields(List.of(
                        EnumField.builder().key("system").label(Map.of("en", "System"))
                                .options(List.of(AttributeOption.builder().value("US").label(Map.of("en", "US")).build()))
                                .isRequired(true).build(),
                        StringField.builder().key("value").label(Map.of("en", "Value"))
                                .isRequired(true).build()))
                .build();
        AttributeDefinitionType shoe = AttributeDefinitionType.builder().name("Shoe").fields(List.of(
                        DefinitionField.builder().key("shoe").label(Map.of("en", "Shoe"))
                                .definitionRef("Reference")
                                .isRequired(true).build(),
                        DefinitionField.builder().key("size").label(Map.of("en", "Size"))
                                .definitionRef("ShoeSize")
                                .isRequired(false).build()))
                .build();

        return AttributeSchema.builder()
                .defaultLocale("en")
                .definitions(List.of(reference, shoeSize, shoe))
                .groups(List.of(AttributeGroup.builder()
                        .key("gear").label(Map.of("en", "Gear")).isAvailable(true)
                        .attributes(List.of(
                                DefinitionListAttribute.builder()
                                        .key("rackets").label(Map.of("en", "Rackets"))
                                        .definitionRef("Reference")
                                        .isAvailable(true).build(),
                                DefinitionAttribute.builder()
                                        .key("footwear").label(Map.of("en", "Footwear"))
                                        .definitionRef("Shoe")
                                        .isAvailable(true).build()))
                        .build()))
                .build();
    }

    @Test
    void adminPut_thenGet_roundTripsAV2DocumentWithDefinitionsAndDefinitionList() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");

        mockMvc.perform(put("/api/sports/{sportId}/attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(v2SchemaWithDefinitions())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.definitions[2].name").value("Shoe"))
                .andExpect(jsonPath("$.data.definitions[2].fields[0].definitionRef").value("Reference"))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].key").value("rackets"))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].type").value("DEFINITION_LIST"))
                .andExpect(jsonPath("$.data.groups[0].attributes[1].definitionRef").value("Shoe"));

        evictSportCache();

        mockMvc.perform(get("/api/sports/{sportId}/attribute-schema", sportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.definitions[2].name").value("Shoe"))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].type").value("DEFINITION_LIST"));
    }

    @Test
    void adminPut_rejectsUnresolvedDefinitionRef_atomically() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");

        AttributeGroup gear = AttributeGroup.builder()
                .key("gear").label(Map.of("en", "Gear")).isAvailable(true)
                .attributes(List.of(DefinitionAttribute.builder()
                        .key("footwear").label(Map.of("en", "Footwear"))
                        .definitionRef("NoSuchDefinition")
                        .isAvailable(true).build()))
                .build();

        mockMvc.perform(put("/api/sports/{sportId}/attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(AttributeSchema.builder()
                                .defaultLocale("en")
                                .groups(List.of(gear)).build())))
                .andExpect(status().isBadRequest());

        evictSportCache();

        // Rejected atomically: nothing was written, so the sport still offers no attributes.
        mockMvc.perform(get("/api/sports/{sportId}/attribute-schema", sportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    @Test
    void adminUpdateSport_rejectsRenameOntoAnExistingName_withBadRequest() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");

        Long otherId = sportRepository.save(Sport.builder()
                .name("A11 Pickleball")
                .isActive(true)
                .build()).getId();
        evictSportCache();

        // Before A11 this reached the caller as 500: no existsByName guard, and
        // GlobalExceptionHandler has no DataIntegrityViolationException case, so the UNIQUE
        // violation on sports.name fell through to the catch-all Exception handler.
        mockMvc.perform(put("/api/sports/{sportId}", otherId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"name\":\"A9 Badminton\"}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Sport with name 'A9 Badminton' already exists"));
    }

    // --- A13: localized attribute-schema labels ---

    private AttributeSchema multiLocaleSchema() {
        return AttributeSchema.builder()
                .defaultLocale("en")
                .groups(List.of(AttributeGroup.builder()
                        .key("gear")
                        .label(Map.of("en", "Gear", "vi", "Đồ nghề"))
                        .isAvailable(true)

                        .attributes(List.of(StringAttribute.builder()
                                .key("racket")
                                .label(Map.of("en", "Racket", "vi", "Vợt"))
                                .isAvailable(true).build()))
                        .build()))
                .build();
    }

    @Test
    void memberGet_resolvesForAcceptLanguage_whileAdminGetReturnsEveryLocale() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");

        mockMvc.perform(put("/api/sports/{sportId}/attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(multiLocaleSchema())))
                .andExpect(status().isOk());

        evictSportCache();

        // Exact match on the caller's Accept-Language.
        mockMvc.perform(get("/api/sports/{sportId}/attribute-schema", sportId)
                        .header("Accept-Language", "vi"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.groups[0].label").value("Đồ nghề"))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].label").value("Vợt"));

        // No Accept-Language header at all falls back to the document's own defaultLocale.
        mockMvc.perform(get("/api/sports/{sportId}/attribute-schema", sportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.groups[0].label").value("Gear"))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].label").value("Racket"));

        // The whole point of A13's endpoint split, asserted as a pair: the admin twin is never
        // resolved — the editor needs every locale, not just the caller's.
        mockMvc.perform(get("/api/sports/all/{sportId}/attribute-schema", sportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.groups[0].label.en").value("Gear"))
                .andExpect(jsonPath("$.data.groups[0].label.vi").value("Đồ nghề"))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].label.en").value("Racket"))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].label.vi").value("Vợt"));
    }

    @Test
    void adminPut_rejectsLabelMissingTheDefaultLocaleEntry_withBadRequest() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");

        AttributeSchema schema = AttributeSchema.builder()
                .defaultLocale("en")
                .groups(List.of(AttributeGroup.builder()
                        // Only "vi" - the document's own defaultLocale ("en") has no entry.
                        .key("gear").label(Map.of("vi", "Đồ nghề")).isAvailable(true)
                        .attributes(List.of())
                        .build()))
                .build();

        mockMvc.perform(put("/api/sports/{sportId}/attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(schema)))
                .andExpect(status().isBadRequest());
    }

    @Test
    void adminPut_rejectsAMalformedDefaultLocale_withBadRequest() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");

        AttributeSchema schema = AttributeSchema.builder()
                .defaultLocale("vi_VN")
                .groups(List.of())
                .build();

        mockMvc.perform(put("/api/sports/{sportId}/attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(schema)))
                .andExpect(status().isBadRequest());
    }

    // --- A16: NUMBER / BOOLEAN ---

    @Test
    void adminPut_thenGet_roundTripsANumberAttributeWithBoundsAndABoolean() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");

        AttributeSchema schema = AttributeSchema.builder()
                .defaultLocale("en")
                .groups(List.of(AttributeGroup.builder()
                        .key("gear").label(Map.of("en", "Gear")).isAvailable(true)
                        .attributes(List.of(
                                NumberAttribute.builder()
                                        .key("tension").label(Map.of("en", "String tension"))
                                        .min(15.0).max(35.0)
                                        .isAvailable(true).defaultValue(27).build(),
                                BooleanAttribute.builder()
                                        .key("strung").label(Map.of("en", "Strung"))
                                        .isAvailable(true).build()))
                        .build()))
                .build();

        mockMvc.perform(put("/api/sports/{sportId}/attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(schema)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.groups[0].attributes[0].type").value("NUMBER"))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].min").value(15.0))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].max").value(35.0))
                .andExpect(jsonPath("$.data.groups[0].attributes[1].type").value("BOOLEAN"));

        evictSportCache();

        mockMvc.perform(get("/api/sports/{sportId}/attribute-schema", sportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.groups[0].attributes[0].type").value("NUMBER"))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].min").value(15.0))
                .andExpect(jsonPath("$.data.groups[0].attributes[0].max").value(35.0));
    }

    @Test
    void adminPut_rejectsMinGreaterThanMaxOnANumberAttribute_withBadRequest() throws Exception {
        authenticateAs(UUID.randomUUID(), "ADMIN");

        AttributeSchema schema = AttributeSchema.builder()
                .defaultLocale("en")
                .groups(List.of(AttributeGroup.builder()
                        .key("gear").label(Map.of("en", "Gear")).isAvailable(true)
                        .attributes(List.of(NumberAttribute.builder()
                                .key("tension").label(Map.of("en", "String tension"))
                                .min(35.0).max(15.0)
                                .isAvailable(true).build()))
                        .build()))
                .build();

        mockMvc.perform(put("/api/sports/{sportId}/attribute-schema", sportId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(schema)))
                .andExpect(status().isBadRequest());

        evictSportCache();

        mockMvc.perform(get("/api/sports/{sportId}/attribute-schema", sportId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data").doesNotExist());
    }

}
