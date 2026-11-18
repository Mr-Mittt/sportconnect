package com.sportconnect.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.session.api.dto.CreateSessionRequest;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.repository.SessionOutboxEventRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.social.post.api.dto.PostType;
import com.sportconnect.social.post.api.dto.SystemCode;
import com.sportconnect.social.post.entity.Post;
import com.sportconnect.social.post.repository.CommentRepository;
import com.sportconnect.social.post.repository.PostRepository;
import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.repository.SportRepository;
import com.sportconnect.user.entity.Friendship;
import com.sportconnect.user.repository.FriendshipRepository;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
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
 * SESSION-69 through the real pipeline: a host makes a standalone session private (at creation and while {@code PREPARING}),
 * and it is then visible only to its creator and to people who hold a participant row on it. Real Keycloak-style tokens,
 * {@code SessionDetailGate}, {@code SessionServiceImpl}, the real participant, comment and outbox tables and
 * {@code GlobalExceptionHandler}. {@code SessionServiceImplSpec} covers every branch with mocks; this proves the access
 * boundary on every path that returns a session, its players or its thread, and the create and update round trip.
 */
class SessionPrivateSessionIntegrationTest extends RedisBaseIT {

    @Autowired private SessionRepository sessionRepository;
    @Autowired private SessionParticipantRepository participantRepository;
    @Autowired private SessionOutboxEventRepository outboxRepository;
    @Autowired private FriendshipRepository friendshipRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private GroupMemberRepository groupMemberRepository;
    @Autowired private PostRepository postRepository;
    @Autowired private CommentRepository commentRepository;
    @Autowired private SportRepository sportRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private CacheManager cacheManager;

    private UUID hostId;
    private UUID strangerId;
    private Long sportId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        hostId = createUserWithRoles(true, "USER");
        strangerId = createUserWithRoles(true, "USER");
        sportId = sportRepository.save(Sport.builder().name("SESSION-69 " + UUID.randomUUID()).isActive(true).build())
                .getId();
        evictSportCache();
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
    }

    private void clearAll() {
        outboxRepository.deleteAll();
        commentRepository.deleteAll();
        participantRepository.deleteAll();
        sessionRepository.deleteAll();
        friendshipRepository.deleteAll();
        groupMemberRepository.deleteAll();
        groupRepository.deleteAll();
        postRepository.deleteAll();
        userRepository.deleteAll();
        sportRepository.deleteAll();
        evictSportCache();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    private void participate(Long sessionId, UUID userId, ParticipantStatus status) {
        participantRepository.save(SessionParticipant.builder().sessionId(sessionId).userId(userId).status(status).build());
    }

    /** A session row as the service would store it; the creator holds a JOINED row for a standalone one (as createSession seeds). */
    private Long seed(Long groupId, SessionStatus status, boolean isPublic) {
        Long postId = postRepository.save(Post.builder().userId(hostId).groupId(null).postType(PostType.SESSION_POST)
                .content("Session: fixture").visibility("private").isActive(true).build()).getId();
        Long id = sessionRepository.save(Session.builder().title("Private session")
                .groupId(groupId).isPublic(isPublic).postId(postId)
                .sessionType(groupId == null ? SessionType.STANDALONE : SessionType.GROUP_RECURRING)
                .createdBy(hostId).sportId(sportId).locationId(1L)
                .scheduledStart(Instant.now().plusSeconds(86400)).scheduledEndAt(Instant.now().plusSeconds(90000))
                .status(status).capacity(10).feeType(FeeType.FREE).initialSlot(0).gameMood(5).autoApprove(false)
                .build()).getId();
        if (groupId == null) {
            participate(id, hostId, ParticipantStatus.JOINED);
        }
        return id;
    }

    private Long privateSession() {
        return seed(null, SessionStatus.SCHEDULED, false);
    }

    private ResultActions getAs(UUID userId, String path, Object... vars) throws Exception {
        return mockMvc.perform(get(path, vars).header("Authorization", bearer(userId)));
    }

    private ResultActions joinAs(UUID userId, Long sessionId) throws Exception {
        return mockMvc.perform(post("/api/sessions/{id}/join", sessionId).header("Authorization", bearer(userId)));
    }

    // ---- creating --------------------------------------------------------------------------------------------------

    private JsonNode createAs(UUID userId, CreateSessionRequest request) throws Exception {
        String body = mockMvc.perform(post("/api/sessions").header("Authorization", bearer(userId))
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(request)))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(body).get("data");
    }

    private CreateSessionRequest.CreateSessionRequestBuilder createBody() {
        return CreateSessionRequest.builder().title("Friday game").sportId(sportId)
                .scheduledStart(Instant.now().plusSeconds(86400)).capacity(10).gameMood(5);
    }

    @Test
    void create_withoutIsPublic_isPublic_andWithFalse_isPrivate_andTheResponseSaysSo() throws Exception {
        JsonNode open = createAs(hostId, createBody().build());
        JsonNode closed = createAs(hostId, createBody().title("Closed game").isPublic(false).build());

        assertThat(open.get("isPublic").asBoolean()).isTrue();
        assertThat(closed.get("isPublic").asBoolean()).isFalse();
        assertThat(sessionRepository.findById(open.get("id").asLong()).orElseThrow().getIsPublic()).isTrue();
        assertThat(sessionRepository.findById(closed.get("id").asLong()).orElseThrow().getIsPublic()).isFalse();
    }

    @Test
    void aPrivateSessionCreatedWithAnInvitee_isOpenedAndAcceptedByThatInvitee_andByNobodyElse() throws Exception {
        UUID invitee = createUserWithRoles(true, "USER");
        JsonNode created = createAs(hostId, createBody().isPublic(false).inviteeIds(List.of(invitee)).build());
        Long id = created.get("id").asLong();

        getAs(invitee, "/api/sessions/{id}", id).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isPublic").value(false));
        getAs(strangerId, "/api/sessions/{id}", id).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_FORBIDDEN"));

        joinAs(strangerId, id).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_FORBIDDEN"));
        assertThat(participantRepository.findBySessionIdAndUserId(id, strangerId)).isEmpty();

        joinAs(invitee, id).andExpect(status().isOk());
        assertThat(participantRepository.findBySessionIdAndUserId(id, invitee).orElseThrow().getStatus())
                .isEqualTo(ParticipantStatus.JOINED);
    }

    // ---- who can open it -------------------------------------------------------------------------------------------

    @Test
    void detail_ofAPrivateSession_isOpenToItsCreatorAndToAnyoneHoldingAJoinedRequestedOrInvitedRow_notToOthers() throws Exception {
        Long id = privateSession();
        UUID joined = createUserWithRoles(true, "USER");
        UUID requested = createUserWithRoles(true, "USER");
        UUID invited = createUserWithRoles(true, "USER");
        UUID left = createUserWithRoles(true, "USER");
        participate(id, joined, ParticipantStatus.JOINED);
        participate(id, requested, ParticipantStatus.REQUESTED);
        participate(id, invited, ParticipantStatus.INVITED);
        participate(id, left, ParticipantStatus.LEFT);

        for (UUID allowed : List.of(hostId, joined, requested, invited)) {
            getAs(allowed, "/api/sessions/{id}", id).andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.isPublic").value(false));
        }
        for (UUID refused : List.of(strangerId, left)) {
            getAs(refused, "/api/sessions/{id}", id).andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.errorCode").value("SESSION_FORBIDDEN"));
        }
    }

    @Test
    void aPublicSession_staysOpenToEveryone() throws Exception {
        Long id = seed(null, SessionStatus.SCHEDULED, true);

        getAs(strangerId, "/api/sessions/{id}", id).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isPublic").value(true));
        getAs(strangerId, "/api/sessions/{id}/participants", id).andExpect(status().isOk());
    }

    @Test
    void anUnknownSession_is404_beforeAnyVisibilityRule() throws Exception {
        getAs(strangerId, "/api/sessions/{id}", 987654L).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SESSION_NOT_FOUND"));
        getAs(strangerId, "/api/sessions/{id}/participants", 987654L).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SESSION_NOT_FOUND"));
    }

    // ---- the player list (it had no access check at all) -----------------------------------------------------------

    @Test
    void playersOfAPrivateSession_areNotReadableByAStranger_butAreByTheCreatorAndAnInvitee() throws Exception {
        Long id = privateSession();
        UUID invited = createUserWithRoles(true, "USER");
        participate(id, invited, ParticipantStatus.INVITED);

        getAs(strangerId, "/api/sessions/{id}/participants", id).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_FORBIDDEN"));
        getAs(hostId, "/api/sessions/{id}/participants", id).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1));
        getAs(invited, "/api/sessions/{id}/participants", id).andExpect(status().isOk());
    }

    @Test
    void playersOfAGroupSession_areNotReadableByANonMember_butAreByAMember() throws Exception {
        Long groupId = groupRepository.save(Group.builder().groupName("SESSION-69 " + UUID.randomUUID())
                .createdBy(hostId).isPrivate(true).isActive(true).build()).getId();
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(hostId).roleId(1).build());
        Long id = seed(groupId, SessionStatus.SCHEDULED, false);

        getAs(strangerId, "/api/sessions/{id}/participants", id).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_FORBIDDEN"));
        getAs(hostId, "/api/sessions/{id}/participants", id).andExpect(status().isOk());
    }

    @Test
    void theRequestedQueue_isStillTheCreatorsAlone() throws Exception {
        Long id = privateSession();
        UUID invited = createUserWithRoles(true, "USER");
        participate(id, invited, ParticipantStatus.INVITED);

        mockMvc.perform(get("/api/sessions/{id}/participants", id).param("status", "REQUESTED")
                        .header("Authorization", bearer(invited)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_CREATOR_REQUIRED"));
        mockMvc.perform(get("/api/sessions/{id}/participants", id).param("status", "REQUESTED")
                        .header("Authorization", bearer(hostId)))
                .andExpect(status().isOk());
    }

    // ---- joining ---------------------------------------------------------------------------------------------------

    @Test
    void aStranger_cannotJoinAPrivateSession_andNothingIsWritten() throws Exception {
        Long id = privateSession();

        joinAs(strangerId, id).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_FORBIDDEN"));

        assertThat(participantRepository.findBySessionIdAndUserId(id, strangerId)).isEmpty();
        assertThat(outboxRepository.findAll().stream()
                .filter(e -> e.getEventType().startsWith("session.join_request"))).isEmpty();
    }

    @Test
    void aStranger_learnsNothingElseAboutAPrivateSession_notEvenThatItIsCancelled() throws Exception {
        Long id = seed(null, SessionStatus.CANCELLED, false);

        joinAs(strangerId, id).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_FORBIDDEN"));
    }

    @Test
    void someoneWhoLeftOrWasRejected_cannotComeBackToAPrivateSession() throws Exception {
        Long id = privateSession();
        participate(id, strangerId, ParticipantStatus.LEFT);

        joinAs(strangerId, id).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_FORBIDDEN"));
        assertThat(participantRepository.findBySessionIdAndUserId(id, strangerId).orElseThrow().getStatus())
                .isEqualTo(ParticipantStatus.LEFT);
    }

    @Test
    void aStranger_canStillRequestToJoinAPublicSession() throws Exception {
        Long id = seed(null, SessionStatus.SCHEDULED, true);

        joinAs(strangerId, id).andExpect(status().isOk());

        assertThat(participantRepository.findBySessionIdAndUserId(id, strangerId).orElseThrow().getStatus())
                .isEqualTo(ParticipantStatus.REQUESTED);
    }

    // ---- the thread and the rest of the session's surface (already participant-only, proven here) --------------------

    @Test
    void theThreadOfAPrivateSession_isNotReadableByAStranger() throws Exception {
        Long id = privateSession();

        getAs(strangerId, "/api/sessions/{id}/comments", id).andExpect(status().isForbidden());
        getAs(hostId, "/api/sessions/{id}/comments", id).andExpect(status().isOk());
    }

    // ---- sharing ---------------------------------------------------------------------------------------------------

    @Test
    void aPrivateSession_cannotBeShared_notEvenByItsCreator() throws Exception {
        Long id = privateSession();
        UUID friend = createUserWithRoles(true, "USER");
        friendshipRepository.save(Friendship.builder().userId(hostId).friendId(friend).build());
        friendshipRepository.save(Friendship.builder().userId(friend).friendId(hostId).build());

        mockMvc.perform(post("/api/sessions/{id}/shares", id).header("Authorization", bearer(hostId))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(Map.of("userIds", List.of(friend.toString())))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SHARE_NOT_ALLOWED"));

        assertThat(outboxRepository.findAll().stream().filter(e -> "session.share.created".equals(e.getEventType()))).isEmpty();
    }

    // ---- switching it while PREPARING ------------------------------------------------------------------------------

    private ResultActions updateAs(UUID userId, Long sessionId, Map<String, Object> body) throws Exception {
        return mockMvc.perform(put("/api/sessions/{id}", sessionId).header("Authorization", bearer(userId))
                .contentType(MediaType.APPLICATION_JSON).content(toJson(body)));
    }

    @Test
    void theHost_switchesAPreparingSessionToPrivate_theThreadSaysSo_andAStrangerIsShutOut() throws Exception {
        Long id = seed(null, SessionStatus.PREPARING, true);
        getAs(strangerId, "/api/sessions/{id}", id).andExpect(status().isOk());

        updateAs(hostId, id, Map.of("isPublic", false)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isPublic").value(false));

        assertThat(sessionRepository.findById(id).orElseThrow().getIsPublic()).isFalse();
        assertThat(commentRepository.findAll()).anySatisfy(comment -> {
            assertThat(comment.getSystemCode()).isEqualTo(SystemCode.SESSION_VISIBILITY_CHANGED);
            assertThat(comment.getSystemParams()).containsEntry("old", "public").containsEntry("new", "private");
        });
        getAs(strangerId, "/api/sessions/{id}", id).andExpect(status().isForbidden());
    }

    @Test
    void switchingToPrivate_keepsEveryExistingParticipantRow_andTheirAccess() throws Exception {
        Long id = seed(null, SessionStatus.PREPARING, true);
        UUID joined = createUserWithRoles(true, "USER");
        UUID requested = createUserWithRoles(true, "USER");
        participate(id, joined, ParticipantStatus.JOINED);
        participate(id, requested, ParticipantStatus.REQUESTED);

        updateAs(hostId, id, Map.of("isPublic", false)).andExpect(status().isOk());

        getAs(joined, "/api/sessions/{id}", id).andExpect(status().isOk());
        getAs(requested, "/api/sessions/{id}", id).andExpect(status().isOk());
        assertThat(participantRepository.findBySessionIdAndUserId(id, requested).orElseThrow().getStatus())
                .isEqualTo(ParticipantStatus.REQUESTED);
    }

    @Test
    void theHost_canSwitchItBackToPublic_whilePreparing() throws Exception {
        Long id = seed(null, SessionStatus.PREPARING, false);

        updateAs(hostId, id, Map.of("isPublic", true)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isPublic").value(true));

        getAs(strangerId, "/api/sessions/{id}", id).andExpect(status().isOk());
    }

    @Test
    void onceNoLongerPreparing_theVisibilityCannotBeChanged() throws Exception {
        Long id = seed(null, SessionStatus.SCHEDULED, true);

        updateAs(hostId, id, Map.of("isPublic", false)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_NOT_PREPARING"));

        assertThat(sessionRepository.findById(id).orElseThrow().getIsPublic()).isTrue();
    }

    @Test
    void aSessionOfAGroup_ignoresIsPublic_andStaysNonPublic() throws Exception {
        Long groupId = groupRepository.save(Group.builder().groupName("SESSION-69 " + UUID.randomUUID())
                .createdBy(hostId).isPrivate(true).isActive(true).build()).getId();
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(hostId).roleId(1).build());
        Long id = seed(groupId, SessionStatus.PREPARING, false);

        updateAs(hostId, id, Map.of("isPublic", true)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.isPublic").value(false));

        assertThat(sessionRepository.findById(id).orElseThrow().getIsPublic()).isFalse();
        assertThat(commentRepository.findAll().stream()
                .filter(c -> c.getSystemCode() == SystemCode.SESSION_VISIBILITY_CHANGED)).isEmpty();
    }

    @Test
    void aStranger_cannotSwitchSomeoneElsesSessionToPrivate() throws Exception {
        Long id = seed(null, SessionStatus.PREPARING, true);

        updateAs(strangerId, id, Map.of("isPublic", false)).andExpect(status().isForbidden());

        assertThat(sessionRepository.findById(id).orElseThrow().getIsPublic()).isTrue();
    }

    @Test
    void anAnonymousCaller_isUnauthorized() throws Exception {
        Long id = privateSession();

        mockMvc.perform(get("/api/sessions/{id}/participants", id)).andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/sessions/{id}/join", id)).andExpect(status().isUnauthorized());
    }
}
