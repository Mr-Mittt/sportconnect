package com.sportconnect.integration;

import com.fasterxml.jackson.core.type.TypeReference;
import com.sportconnect.common.attributes.AttributeDefinitionType;
import com.sportconnect.common.attributes.AttributeGroup;
import com.sportconnect.common.attributes.AttributeSchema;
import com.sportconnect.common.attributes.Cardinality;
import com.sportconnect.common.attributes.field.StringField;
import com.sportconnect.common.attributes.json.AttributeJson;
import com.sportconnect.common.attributes.node.DefinitionListAttribute;
import com.sportconnect.common.attributes.node.RefAttribute;
import com.sportconnect.common.attributes.node.StringAttribute;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.social.post.api.dto.PostType;
import com.sportconnect.social.post.entity.Post;
import com.sportconnect.social.post.repository.PostRepository;
import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.repository.SportRepository;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.http.MediaType;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-23 end-to-end: a session-attributes write goes through a real {@code MockMvc} request →
 * real {@code SessionController}/{@code SessionServiceImpl} → the real {@code SportService} bean
 * ({@code getSessionAttributeSchemaRaw}, which ref-expands the sport's stored session schema) →
 * {@code SessionAttributeFilter} → the real {@code sessions.attributes} JSON column → and back out
 * on {@code SessionResponse}. {@code SessionAttributeFilterSpec} and {@code SessionServiceImplSpec}
 * cover the branch logic with the schema mocked; this proves the parts only real wiring shows —
 * the ref-expansion round trip, the JSONB persist/read, and the drop of a switched-off attribute
 * through the whole pipeline.
 *
 * <p>The session row itself is seeded via repositories (its creation would pull in
 * location/sport-match validation this class isn't about), following the precedent in
 * {@code SessionSystemCommentIntegrationTest}; the attribute write and every assertion go through
 * real HTTP. Uses {@code PUT} rather than {@code POST}: replace semantics make it the fuller test
 * (a first write, a wholesale replace, and a clear), and it needs no {@code locationId} in the body.
 */
class SessionAttributesIntegrationTest extends RedisBaseIT {

    @Autowired
    private SportRepository sportRepository;

    @Autowired
    private PostRepository postRepository;

    @Autowired
    private SessionRepository sessionRepository;

    @Autowired
    private SessionParticipantRepository sessionParticipantRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private CacheManager cacheManager;

    private Long sportId;
    private Long sessionId;
    private UUID creatorId;

    @BeforeEach
    void setUpFixtures() throws Exception {
        sessionParticipantRepository.deleteAll();
        sessionRepository.deleteAll();
        postRepository.deleteAll();
        sportRepository.deleteAll();
        userRepository.deleteAll();
        evictSportCache();

        User creator = new User();
        creator.setUsername("s23_" + UUID.randomUUID());
        creator.setEmail("session23_" + System.nanoTime() + "@example.com");
        creator.setPasswordHash("password");
        creator.setFirstName("Creator");
        creator.setLastName("User");
        creator.setIsEmailVerified(false);
        creator.setIsActive(true);
        creatorId = userRepository.save(creator).getId();

        // setup/notes (STRING, available) + setup/private (STRING, isAvailable:false). Own nodes
        // only — no #ref, so no profile schema needed; the real expander still runs at read time
        // via SportService.getSessionAttributeSchemaRaw. Persisted straight onto the Sport row
        // rather than through the admin PUT endpoint: a MockMvc call in @BeforeEach would fix this
        // method's authenticated identity as the admin for the rest of the test (BaseIT's
        // "first request wins" note), and this class needs to act as the session's creator.
        AttributeSchema schema = AttributeSchema.builder()
                .defaultLocale("en")
                .groups(List.of(AttributeGroup.builder()
                        .key("setup").label(Map.of("en", "Setup")).isAvailable(true)
                        .attributes(List.of(
                                StringAttribute.builder()
                                        .key("notes").label(Map.of("en", "Notes"))
                                        .isAvailable(true).build(),
                                StringAttribute.builder()
                                        .key("private").label(Map.of("en", "Private"))
                                        .isAvailable(false).build()))
                        .build()))
                .build();

        Sport sport = Sport.builder()
                .name("SESSION-23 fixture sport")
                .description("session attributes IT")
                .isActive(true)
                .build();
        sport.setSessionAttributesSchema(AttributeJson.mapper().convertValue(schema, new TypeReference<Map<String, Object>>() {}));
        sportId = sportRepository.save(sport).getId();
        evictSportCache();

        Long postId = postRepository.save(Post.builder()
                .userId(creatorId).groupId(null).postType(PostType.SESSION_POST)
                .content("Session: fixture").visibility("private").isActive(true).build()).getId();

        sessionId = sessionRepository.save(Session.builder()
                .groupId(null).postId(postId).sessionType(SessionType.STANDALONE)
                .createdBy(creatorId).sportId(sportId).locationId(1L)
                .scheduledStart(LocalDateTime.now().plusDays(1)).status(SessionStatus.SCHEDULED)
                .capacity(9999).feeType(FeeType.FREE).initialSlot(0).autoApprove(false)
                .build()).getId();
    }

    @AfterEach
    void tearDown() {
        sessionParticipantRepository.deleteAll();
        sessionRepository.deleteAll();
        postRepository.deleteAll();
        sportRepository.deleteAll();
        userRepository.deleteAll();
        evictSportCache();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    @Test
    void put_filtersSubmittedAttributes_keepingOnlyLiveSchemaKeys_andPersistsThemToTheJsonColumn() throws Exception {
        authenticateAs(creatorId);
        mockMvc.perform(put("/api/sessions/{sessionId}", sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"attributes": {
                                    "setup/notes": "bring water",
                                    "setup/private": "should be dropped (switched off)",
                                    "setup/unknown": "should be dropped (not in schema)"
                                }}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attributes.['setup/notes']").value("bring water"))
                .andExpect(jsonPath("$.data.attributes.['setup/private']").doesNotExist())
                .andExpect(jsonPath("$.data.attributes.['setup/unknown']").doesNotExist());

        // Survived the real JSON column round trip, still just the one accepted key.
        Session reloaded = sessionRepository.findById(sessionId).orElseThrow();
        org.junit.jupiter.api.Assertions.assertEquals(Map.of("setup/notes", "bring water"),
                reloaded.getAttributes());
    }

    @Test
    void put_replacesTheStoredAttributesWholesale_notMerged() throws Exception {
        authenticateAs(creatorId);
        mockMvc.perform(put("/api/sessions/{sessionId}", sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"attributes": {"setup/notes": "first"}}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attributes.['setup/notes']").value("first"));

        // A second write with a different value replaces, not accumulates.
        mockMvc.perform(put("/api/sessions/{sessionId}", sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"attributes": {"setup/notes": "second"}}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attributes.['setup/notes']").value("second"));

        Session reloaded = sessionRepository.findById(sessionId).orElseThrow();
        org.junit.jupiter.api.Assertions.assertEquals(Map.of("setup/notes", "second"),
                reloaded.getAttributes());
    }

    @Test
    void put_withAnExplicitEmptyMap_clearsTheStoredAttributes() throws Exception {
        authenticateAs(creatorId);
        mockMvc.perform(put("/api/sessions/{sessionId}", sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"attributes": {"setup/notes": "bring water"}}"""))
                .andExpect(status().isOk());

        mockMvc.perform(put("/api/sessions/{sessionId}", sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"attributes": {}}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attributes").isEmpty());

        Session reloaded = sessionRepository.findById(sessionId).orElseThrow();
        org.junit.jupiter.api.Assertions.assertTrue(reloaded.getAttributes().isEmpty());
    }

    /**
     * C10 (found via CLIENT-SESSION-17): a {@code #ref} node with {@code cardinality: SINGLE}
     * pointing at a {@code DEFINITION_LIST} base must accept — and persist — a <em>bare record</em>,
     * not a one-element array. Before C10, {@code DerivedSchemaExpander} kept the base's list
     * subtype and {@code AttributeValueFilter} then dropped the single value the client submits.
     */
    @Test
    void put_singleCardinalityRefOffAListBase_keepsABareRecordValue() throws Exception {
        reseedSportWithSingleRefSchema();
        authenticateAs(creatorId);

        mockMvc.perform(put("/api/sessions/{sessionId}", sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"attributes": {"match/shuttlecocks": {"value": "Ba Sao ProX"}}}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attributes.['match/shuttlecocks'].value").value("Ba Sao ProX"))
                // a one-element array is now the *wrong* shape for a SINGLE #ref — it must NOT come back as one
                .andExpect(jsonPath("$.data.attributes.['match/shuttlecocks']").isMap());

        Session reloaded = sessionRepository.findById(sessionId).orElseThrow();
        org.junit.jupiter.api.Assertions.assertEquals(
                Map.of("match/shuttlecocks", Map.of("value", "Ba Sao ProX")),
                reloaded.getAttributes());
    }

    @Test
    void put_singleCardinalityRef_dropsAnArrayValue() throws Exception {
        reseedSportWithSingleRefSchema();
        authenticateAs(creatorId);

        mockMvc.perform(put("/api/sessions/{sessionId}", sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"attributes": {"match/shuttlecocks": [{"value": "Ba Sao ProX"}]}}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.attributes.['match/shuttlecocks']").doesNotExist());
    }

    /**
     * Re-saves the {@link #sportId} sport with a real (base profile schema + derived session
     * schema) pair: {@code gear/shuttlecocks} is a {@code DEFINITION_LIST} on the profile schema,
     * and the session schema references it via a {@code #ref} node with {@code cardinality: SINGLE}
     * at path {@code match/shuttlecocks}. Cache evicted so the next read re-expands.
     */
    private void reseedSportWithSingleRefSchema() {
        AttributeDefinitionType reference = AttributeDefinitionType.builder()
                .name("Reference")
                .fields(List.of(StringField.builder()
                        .key("value").label(Map.of("en", "Name")).isRequired(true).build()))
                .build();

        AttributeSchema profileSchema = AttributeSchema.builder()
                .defaultLocale("en")
                .definitions(List.of(reference))
                .groups(List.of(AttributeGroup.builder()
                        .key("gear").label(Map.of("en", "Gear")).isAvailable(true)
                        .attributes(List.of(DefinitionListAttribute.builder()
                                .key("shuttlecocks").label(Map.of("en", "Shuttlecocks"))
                                .definitionRef("Reference").isAvailable(true).build()))
                        .build()))
                .build();

        AttributeSchema sessionSchema = AttributeSchema.builder()
                .defaultLocale("en")
                .groups(List.of(AttributeGroup.builder()
                        .key("match").label(Map.of("en", "Match")).isAvailable(true)
                        .attributes(List.of(RefAttribute.builder()
                                .key("shuttlecocks").ref("gear/shuttlecocks")
                                .cardinality(Cardinality.SINGLE).build()))
                        .build()))
                .build();

        Sport sport = sportRepository.findById(sportId).orElseThrow();
        sport.setAttributesSchema(AttributeJson.mapper()
                .convertValue(profileSchema, new TypeReference<Map<String, Object>>() {}));
        sport.setSessionAttributesSchema(AttributeJson.mapper()
                .convertValue(sessionSchema, new TypeReference<Map<String, Object>>() {}));
        sportRepository.save(sport);
        evictSportCache();
    }

    @Test
    void put_withoutAnAttributesField_leavesStoredAttributesUntouched() throws Exception {
        authenticateAs(creatorId);
        mockMvc.perform(put("/api/sessions/{sessionId}", sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"attributes": {"setup/notes": "bring water"}}"""))
                .andExpect(status().isOk());

        // A later edit that doesn't mention attributes must not wipe them.
        mockMvc.perform(put("/api/sessions/{sessionId}", sessionId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"title": "New title"}"""))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("New title"))
                .andExpect(jsonPath("$.data.attributes.['setup/notes']").value("bring water"));
    }
}
