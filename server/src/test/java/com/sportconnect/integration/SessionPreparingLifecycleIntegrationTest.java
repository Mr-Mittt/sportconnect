package com.sportconnect.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.sportconnect.location.entity.Location;
import com.sportconnect.location.repository.LocationRepository;
import com.sportconnect.session.api.dto.CreateSessionRequest;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.UpdateSessionRequest;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionOutboxEvent;
import com.sportconnect.session.repository.SessionOutboxEventRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.social.post.api.dto.PostType;
import com.sportconnect.social.post.entity.Comment;
import com.sportconnect.social.post.entity.Post;
import com.sportconnect.social.post.repository.CommentRepository;
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
import org.springframework.security.core.context.SecurityContextHolder;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-46 end to end through real wiring: {@code POST /api/sessions} (the new columns, the
 * status rule that now needs a duration, a blank title), {@code PUT} while {@code PREPARING},
 * the explicit {@code POST /api/sessions/{id}/schedule}, and the lock once {@code SCHEDULED}.
 * {@code SessionServiceImplSpec} covers every branch with mocks; this proves what a mock cannot:
 * the V085-V087 columns and their {@code CHECK}s round-trip, the real companion post is created
 * for a title-less session, the real exception-to-status mapping, and that a deactivated creator
 * is stopped by the real JWT filter before {@code scheduleSession} runs.
 */
class SessionPreparingLifecycleIntegrationTest extends RedisBaseIT {

    @Autowired private SessionRepository sessionRepository;
    @Autowired private SessionParticipantRepository sessionParticipantRepository;
    @Autowired private SessionOutboxEventRepository sessionOutboxEventRepository;
    @Autowired private PostRepository postRepository;
    @Autowired private CommentRepository commentRepository;
    @Autowired private LocationRepository locationRepository;
    @Autowired private SportRepository sportRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private CacheManager cacheManager;

    private UUID creatorId;
    private Long sportId;
    private Long locationId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        creatorId = createUser(true).getId();
        sportId = sportRepository.save(Sport.builder()
                .name("SESSION-46 sport " + UUID.randomUUID()).isActive(true).build()).getId();
        evictSportCache();
        locationId = locationRepository.save(Location.builder()
                .sportId(sportId).name("Court").createdBy(creatorId).build()).getId();
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
    }

    private void clearAll() {
        commentRepository.deleteAll();
        sessionOutboxEventRepository.deleteAll();
        sessionParticipantRepository.deleteAll();
        sessionRepository.deleteAll();
        postRepository.deleteAll();
        locationRepository.deleteAll();
        sportRepository.deleteAll();
        userRepository.deleteAll();
        evictSportCache();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    private User createUser(boolean active) {
        User user = new User();
        user.setUsername("s46_" + UUID.randomUUID());
        user.setEmail("s46_" + System.nanoTime() + "@example.com");
        user.setFirstName("Host");
        user.setLastName("User");
        user.setIsEmailVerified(false);
        user.setIsActive(active);
        return userRepository.save(user);
    }

    private CreateSessionRequest.CreateSessionRequestBuilder createBody() {
        return CreateSessionRequest.builder().title("Test session").sportId(sportId)
                .scheduledStart(Instant.now().plusSeconds(86400)).capacity(10).gameMood(5);
    }

    /** Creates through the real endpoint and returns the new session id. */
    private Long createViaApi(CreateSessionRequest request) throws Exception {
        String body = mockMvc.perform(post("/api/sessions").contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(request)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        JsonNode data = objectMapper.readTree(body).get("data");
        return data.get("id").asLong();
    }

    @Test
    void create_withoutLocationOrDuration_startsPreparing_andPersistsTheNewColumns() throws Exception {
        authenticateAs(creatorId);
        mockMvc.perform(post("/api/sessions").contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(createBody().title("  Friday game  ").maleSlots(2).femaleSlots(3).gameMood(7)
                                .feeNote("  bring cash  ").build())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("PREPARING"))
                .andExpect(jsonPath("$.data.gameMood").value(7))
                .andExpect(jsonPath("$.data.maleSlots").value(2))
                .andExpect(jsonPath("$.data.femaleSlots").value(3))
                .andExpect(jsonPath("$.data.feeNote").value("bring cash"))
                .andExpect(jsonPath("$.data.title").value("Friday game"));

        Session stored = sessionRepository.findAll().get(0);
        assertThat(stored.getGameMood()).isEqualTo(7);
        assertThat(stored.getMaleSlots()).isEqualTo(2);
        assertThat(stored.getFemaleSlots()).isEqualTo(3);
        assertThat(stored.getFeeNote()).isEqualTo("bring cash");
        assertThat(stored.getTitle()).isEqualTo("Friday game");
        // SESSION-49: the title is required, so the real companion post always carries it
        assertThat(postRepository.findById(stored.getPostId()).orElseThrow().getContent()).isEqualTo("Session: Friday game");
    }

    @Test
    void create_withoutATitle_is400SessionTitleRequired_andCreatesNothing() throws Exception {
        authenticateAs(creatorId);
        for (String blank : new String[] {null, "", "   "}) {
            mockMvc.perform(post("/api/sessions").contentType(MediaType.APPLICATION_JSON)
                            .content(toJson(createBody().title(blank).build())))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errorCode").value("SESSION_TITLE_REQUIRED"));
        }
        assertThat(sessionRepository.findAll()).isEmpty();
    }

    @Test
    void update_toABlankTitle_is400SessionTitleRequired_andKeepsTheTitle() throws Exception {
        authenticateAs(creatorId);
        Long sessionId = createViaApi(createBody().build());

        mockMvc.perform(put("/api/sessions/" + sessionId).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(UpdateSessionRequest.builder().title("   ").build())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_TITLE_REQUIRED"));

        assertThat(sessionRepository.findById(sessionId).orElseThrow().getTitle()).isEqualTo("Test session");
    }

    @Test
    void create_withLocationAndFeeButNoDuration_stillStartsPreparing() throws Exception {
        authenticateAs(creatorId);
        mockMvc.perform(post("/api/sessions").contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(createBody().locationId(locationId).feeType(FeeType.FREE).build())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("PREPARING"));
    }

    @Test
    void create_withLocationFeeAndDuration_startsScheduled() throws Exception {
        authenticateAs(creatorId);
        mockMvc.perform(post("/api/sessions").contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(createBody().locationId(locationId).feeType(FeeType.FREE)
                                .durationMinutes(90).build())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("SCHEDULED"));
    }

    @Test
    void create_slotsOverTheOpenSeats_is400SessionGenderSlotsExceedOpen() throws Exception {
        authenticateAs(creatorId);
        mockMvc.perform(post("/api/sessions").contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(createBody().capacity(10).initialSlot(4).maleSlots(4).femaleSlots(3).build())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GENDER_SLOTS_EXCEED_OPEN"));
        assertThat(sessionRepository.count()).isZero();
    }

    @Test
    void create_withoutOrOutOfRangeGameMood_is400ValidationFailed() throws Exception {
        authenticateAs(creatorId);
        mockMvc.perform(post("/api/sessions").contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(createBody().gameMood(11).build())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"))
                .andExpect(jsonPath("$.errorParams.fields.gameMood").exists());
    }

    @Test
    void create_withoutGameMood_is400ValidationFailed() throws Exception {
        authenticateAs(creatorId);
        mockMvc.perform(post("/api/sessions").contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(createBody().gameMood(null).build())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"));
    }

    @Test
    void lifecycle_editEverythingWhilePreparing_thenScheduleExplicitly_thenEverythingIsLocked() throws Exception {
        authenticateAs(creatorId);
        Long sessionId = createViaApi(createBody().build());

        // Location, fee and duration all present after this edit: no automatic flip any more.
        mockMvc.perform(put("/api/sessions/{id}", sessionId).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(UpdateSessionRequest.builder().locationId(locationId).feeType(FeeType.FREE)
                                .durationMinutes(60).title("Sunday game").maleSlots(2).gameMood(9)
                                .feeNote("split the court fee").build())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("PREPARING"))
                .andExpect(jsonPath("$.data.gameMood").value(9))
                .andExpect(jsonPath("$.data.maleSlots").value(2))
                .andExpect(jsonPath("$.data.feeNote").value("split the court fee"));

        // The explicit action leaves PREPARING.
        mockMvc.perform(post("/api/sessions/{id}/schedule", sessionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("SCHEDULED"));
        assertThat(sessionRepository.findById(sessionId).orElseThrow().getStatus()).isEqualTo(SessionStatus.SCHEDULED);

        // Once SCHEDULED every edit is locked, including fields that used to be editable.
        mockMvc.perform(put("/api/sessions/{id}", sessionId).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(UpdateSessionRequest.builder().title("Renamed").build())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_NOT_PREPARING"));
        assertThat(sessionRepository.findById(sessionId).orElseThrow().getTitle()).isEqualTo("Sunday game");

        mockMvc.perform(post("/api/sessions/{id}/schedule", sessionId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_NOT_PREPARING"));
    }

    @Test
    void put_clearsSlotsWithZeroAndFeeNoteWithEmptyString_andMovesTheEndWithTheStart() throws Exception {
        authenticateAs(creatorId);
        Long sessionId = createViaApi(createBody().maleSlots(2).femaleSlots(2).feeNote("note")
                .durationMinutes(60).build());
        Instant originalStart = sessionRepository.findById(sessionId).orElseThrow().getScheduledStart();
        Instant newStart = originalStart.plusSeconds(7200);

        mockMvc.perform(put("/api/sessions/{id}", sessionId).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(UpdateSessionRequest.builder().maleSlots(0).feeNote("")
                                .scheduledStart(newStart).build())))
                .andExpect(status().isOk());

        Session stored = sessionRepository.findById(sessionId).orElseThrow();
        assertThat(stored.getMaleSlots()).isNull();
        assertThat(stored.getFemaleSlots()).isEqualTo(2);
        assertThat(stored.getFeeNote()).isNull();
        assertThat(stored.getScheduledStart()).isEqualTo(newStart);
        assertThat(stored.getScheduledEndAt()).isEqualTo(newStart.plusSeconds(3600));
    }

    @Test
    void schedule_whenSomethingIsMissing_is400SessionNotReadyListingIt() throws Exception {
        authenticateAs(creatorId);
        Long sessionId = createViaApi(createBody().feeType(FeeType.FREE).build());

        mockMvc.perform(post("/api/sessions/{id}/schedule", sessionId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_NOT_READY"))
                .andExpect(jsonPath("$.errorParams.missing[0]").value("location"))
                .andExpect(jsonPath("$.errorParams.missing[1]").value("duration"))
                .andExpect(jsonPath("$.errorParams.missing[2]").doesNotExist());
        assertThat(sessionRepository.findById(sessionId).orElseThrow().getStatus()).isEqualTo(SessionStatus.PREPARING);
    }

    @Test
    void schedule_asSomeoneElse_is403SessionCreatorRequired() throws Exception {
        Long sessionId;
        UUID outsiderId = createUserWithRoles(true, "USER");
        authenticateAs(creatorId);
        sessionId = createViaApi(createBody().build());
        SecurityContextHolder.clearContext();
        // A fresh request as another user needs a real token: authenticateAs only takes effect
        // before the first MockMvc call of a test method (see BaseIT).
        mockMvc.perform(post("/api/sessions/{id}/schedule", sessionId)
                        .header("Authorization", bearer(outsiderId)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_CREATOR_REQUIRED"));
    }

    @Test
    void schedule_asADeactivatedCreator_isRefusedByTheRealJwtFilterBeforeAnythingRuns() throws Exception {
        UUID inactiveId = createUserWithRoles(false, "USER");
        Long sessionId = sessionRepository.save(Session.builder().title("Test session")
                .groupId(null).isPublic(true)
                .postId(postRepository.save(Post.builder()
                        .userId(inactiveId).groupId(null)
                        .postType(PostType.SESSION_POST)
                        .content("Session: x").visibility("private").isActive(true).build()).getId())
                .sessionType(SessionType.STANDALONE)
                .createdBy(inactiveId).sportId(sportId).locationId(locationId)
                .scheduledStart(Instant.now().plusSeconds(86400)).scheduledEndAt(Instant.now().plusSeconds(90000))
                .status(SessionStatus.PREPARING).capacity(10).feeType(FeeType.FREE)
                .initialSlot(0).autoApprove(false).build()).getId();

        mockMvc.perform(post("/api/sessions/{id}/schedule", sessionId)
                        .header("Authorization", bearer(inactiveId)))
                .andExpect(status().isUnauthorized());
        assertThat(sessionRepository.findById(sessionId).orElseThrow().getStatus()).isEqualTo(SessionStatus.PREPARING);
    }

    // ---- SESSION-67: one system comment per changed field --------------------------------------------------------

    private List<SessionOutboxEvent> outboxEvents(String type) {
        return sessionOutboxEventRepository.findAll().stream().filter(e -> type.equals(e.getEventType())).toList();
    }

    /** The session thread through the real endpoint, as code to params (newest first in the response). */
    private Map<String, JsonNode> threadByCode(Long sessionId) throws Exception {
        String body = mockMvc.perform(get("/api/sessions/{id}/comments", sessionId))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        Map<String, JsonNode> byCode = new LinkedHashMap<>();
        for (JsonNode comment : objectMapper.readTree(body).get("data").get("content")) {
            assertThat(comment.get("commentType").asText()).isEqualTo("SESSION_SYSTEM");
            byCode.put(comment.get("systemCode").asText(), comment);
        }
        return byCode;
    }

    @Test
    void update_writesOneSystemCommentPerChangedField_readableInTheThread_andOneDetailsEvent() throws Exception {
        authenticateAs(creatorId);
        Long sessionId = createViaApi(createBody().build());

        mockMvc.perform(put("/api/sessions/{id}", sessionId).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(UpdateSessionRequest.builder().title("Sunday game").locationId(locationId)
                                .feeType(FeeType.FIXED).feeAmountVnd(50000L).durationMinutes(60).capacity(12)
                                .feeNote("Bring cash").build())))
                .andExpect(status().isOk());

        Map<String, JsonNode> thread = threadByCode(sessionId);
        assertThat(thread.keySet()).containsExactlyInAnyOrder("SESSION_TITLE_CHANGED", "SESSION_LOCATION_CHANGED",
                "SESSION_DURATION_CHANGED", "SESSION_CAPACITY_CHANGED", "SESSION_FEE_CHANGED", "SESSION_FEE_NOTE_CHANGED");

        JsonNode title = thread.get("SESSION_TITLE_CHANGED");
        assertThat(title.get("systemParams").get("name").asText()).isEqualTo("Host User");
        assertThat(title.get("systemParams").get("old").asText()).isEqualTo("Test session");
        assertThat(title.get("systemParams").get("new").asText()).isEqualTo("Sunday game");
        assertThat(title.get("content").asText()).isEqualTo("Host User updated the title \"Sunday game\"");

        JsonNode location = thread.get("SESSION_LOCATION_CHANGED").get("systemParams");
        assertThat(location.get("old").asText()).isEmpty();
        assertThat(location.get("new").asText()).isEqualTo("Court");

        JsonNode fee = thread.get("SESSION_FEE_CHANGED").get("systemParams");
        assertThat(fee.get("oldFeeType").asText()).isEmpty();
        assertThat(fee.get("newFeeType").asText()).isEqualTo("FIXED");
        assertThat(fee.get("newFeeAmountVnd").asText()).isEqualTo("50000");

        JsonNode capacity = thread.get("SESSION_CAPACITY_CHANGED");
        assertThat(capacity.get("content").asText()).isEqualTo("Host User changed the capacity from \"10\" to \"12\"");
        assertThat(thread.get("SESSION_DURATION_CHANGED").get("systemParams").get("new").asText()).isEqualTo("60");

        // Authored by the session's creator, like every session system comment.
        for (Comment comment : commentRepository.findAll()) {
            assertThat(comment.getUserId()).isEqualTo(creatorId);
        }
        // The notification stays one field-agnostic event, and the comments do not also ping as comments.
        assertThat(outboxEvents("session.details.updated")).hasSize(1);
        assertThat(outboxEvents("session.comment.created")).isEmpty();
    }

    @Test
    void update_thatResendsTheStoredValues_writesNoComment() throws Exception {
        authenticateAs(creatorId);
        Long sessionId = createViaApi(createBody().build());

        mockMvc.perform(put("/api/sessions/{id}", sessionId).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(UpdateSessionRequest.builder().title("Test session").capacity(10).gameMood(5).build())))
                .andExpect(status().isOk());

        assertThat(threadByCode(sessionId)).isEmpty();
        assertThat(commentRepository.count()).isZero();
        assertThat(outboxEvents("session.details.updated")).hasSize(1);
    }

    @Test
    void update_whoseCommentsCannotBeWritten_rollsTheWholeEditBack_andSendsNoNotification() throws Exception {
        authenticateAs(creatorId);
        Long sessionId = createViaApi(createBody().build());
        // The companion post is the thread anchor: without it the comment batch is refused after the fields were set.
        Session stored = sessionRepository.findById(sessionId).orElseThrow();
        postRepository.deleteById(stored.getPostId());

        int status = mockMvc.perform(put("/api/sessions/{id}", sessionId).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(UpdateSessionRequest.builder().title("Never stored").capacity(99).build())))
                .andReturn().getResponse().getStatus();

        assertThat(status).isGreaterThanOrEqualTo(400);
        Session after = sessionRepository.findById(sessionId).orElseThrow();
        assertThat(after.getTitle()).isEqualTo("Test session");
        assertThat(after.getCapacity()).isEqualTo(10);
        assertThat(outboxEvents("session.details.updated")).isEmpty();
    }
}
