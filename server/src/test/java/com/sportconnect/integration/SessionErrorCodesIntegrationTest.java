package com.sportconnect.integration;

import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.session.api.dto.CancelSessionRequest;
import com.sportconnect.session.api.dto.CreateSessionRequest;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.api.dto.UpdateSessionRequest;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-45 - real-pipeline coverage of the session module's error codes: a real {@code MockMvc}
 * request through the real {@code SessionController}, {@code SessionServiceImpl}, the session
 * gates, {@code GroupServiceImpl} and {@code GlobalExceptionHandler}, asserting the HTTP status and
 * the {@code errorCode} (plus {@code errorParams} where the code carries one). Fixtures are
 * inserted through repositories, as in {@link SessionAccessGateIntegrationTest}. Every request
 * fails before any side effect (outbox, system comment), so no post or outbox fixtures are needed.
 */
class SessionErrorCodesIntegrationTest extends BaseIT {

    private static final Integer ROLE_OWNER = 1;
    private static final Integer ROLE_MEMBER = 3;

    @Autowired private SessionRepository sessionRepository;
    @Autowired private SessionParticipantRepository sessionParticipantRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private GroupMemberRepository groupMemberRepository;
    @Autowired private UserRepository userRepository;

    private final AtomicLong postIdSeq = new AtomicLong(1);

    private UUID creatorId;
    private UUID memberId;
    private UUID outsiderId;
    private Long groupId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        creatorId = createUser("creator").getId();
        memberId = createUser("member").getId();
        outsiderId = createUser("outsider").getId();
        groupId = groupRepository.save(Group.builder()
                .groupName("Session Errors " + UUID.randomUUID())
                .createdBy(creatorId).isPrivate(true).isActive(true).build()).getId();
        addMember(creatorId, ROLE_OWNER);
        addMember(memberId, ROLE_MEMBER);
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
    }

    private void clearAll() {
        sessionParticipantRepository.deleteAll();
        sessionRepository.deleteAll();
        groupMemberRepository.deleteAll();
        groupRepository.deleteAll();
        userRepository.deleteAll();
    }

    private User createUser(String label) {
        User user = new User();
        user.setUsername(label + "_" + UUID.randomUUID());
        user.setEmail(label + "_" + System.nanoTime() + "@example.com");
        user.setPasswordHash("password");
        user.setFirstName(label);
        user.setLastName("User");
        user.setIsEmailVerified(false);
        user.setIsActive(true);
        return userRepository.save(user);
    }

    private void addMember(UUID userId, Integer roleId) {
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(userId).roleId(roleId).build());
    }

    private Long seedSession(Long sessionGroupId, SessionStatus status) {
        return sessionRepository.save(Session.builder()
                .groupId(sessionGroupId)
                .isPublic(sessionGroupId == null)
                .postId(postIdSeq.getAndIncrement())
                .sessionType(sessionGroupId == null ? SessionType.STANDALONE : SessionType.GROUP_RECURRING)
                .createdBy(creatorId)
                .sportId(1L)
                .locationId(1L)
                .scheduledStart(Instant.now().plusSeconds(86400))
                .status(status)
                .capacity(9999)
                .feeType(FeeType.FREE)
                .initialSlot(0)
                .autoApprove(false)
                .build()).getId();
    }

    private CreateSessionRequest.CreateSessionRequestBuilder createBody() {
        return CreateSessionRequest.builder()
                .scheduledStart(Instant.now().plusSeconds(86400)).capacity(10);
    }

    // -- 404: SESSION_NOT_FOUND / SESSION_JOIN_REQUEST_NOT_FOUND -------------------------------

    @Test
    void getSession_missing_is404SessionNotFound() throws Exception {
        authenticateAs(outsiderId);
        mockMvc.perform(get("/api/sessions/{id}", 999999L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SESSION_NOT_FOUND"));
    }

    @Test
    void getSession_ofADeletedGroup_is404SessionNotFound() throws Exception {
        Long sessionId = seedSession(groupId, SessionStatus.SCHEDULED);
        Group group = groupRepository.findById(groupId).orElseThrow();
        group.setIsActive(false);
        groupRepository.save(group);
        authenticateAs(memberId);
        mockMvc.perform(get("/api/sessions/{id}", sessionId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SESSION_NOT_FOUND"));
    }

    @Test
    void comments_ofAMissingSession_is404SessionNotFound() throws Exception {
        authenticateAs(outsiderId);
        mockMvc.perform(get("/api/sessions/{id}/comments", 999999L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SESSION_NOT_FOUND"));
    }

    @Test
    void join_missingSession_is404SessionNotFound() throws Exception {
        authenticateAs(outsiderId);
        mockMvc.perform(post("/api/sessions/{id}/join", 999999L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SESSION_NOT_FOUND"));
    }

    @Test
    void approve_withNoPendingRequest_is404SessionJoinRequestNotFound() throws Exception {
        Long sessionId = seedSession(null, SessionStatus.SCHEDULED);
        authenticateAs(creatorId);
        mockMvc.perform(post("/api/sessions/{id}/participants/{userId}/approve", sessionId, outsiderId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SESSION_JOIN_REQUEST_NOT_FOUND"));
    }

    // -- 403 -----------------------------------------------------------------------------------

    @Test
    void comments_ofAGroupSession_forANonMember_is403SessionForbidden() throws Exception {
        Long sessionId = seedSession(groupId, SessionStatus.SCHEDULED);
        authenticateAs(outsiderId);
        mockMvc.perform(get("/api/sessions/{id}/comments", sessionId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_FORBIDDEN"));
    }

    @Test
    void getSession_ofAGroupSession_forANonMember_is403SessionForbidden() throws Exception {
        Long sessionId = seedSession(groupId, SessionStatus.SCHEDULED);
        authenticateAs(outsiderId);
        mockMvc.perform(get("/api/sessions/{id}", sessionId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_FORBIDDEN"));
    }

    @Test
    void groupSessionsList_forANonMember_is403SessionGroupMemberRequired() throws Exception {
        authenticateAs(outsiderId);
        mockMvc.perform(get("/api/sessions/group/{id}", groupId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_MEMBER_REQUIRED"));
    }

    @Test
    void join_aGroupSession_asANonMember_is403SessionGroupMemberRequired() throws Exception {
        Long sessionId = seedSession(groupId, SessionStatus.SCHEDULED);
        authenticateAs(outsiderId);
        mockMvc.perform(post("/api/sessions/{id}/join", sessionId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_MEMBER_REQUIRED"));
    }

    @Test
    void create_aGroupSession_asAPlainMember_is403SessionGroupAdminRequired() throws Exception {
        authenticateAs(memberId);
        mockMvc.perform(post("/api/sessions").contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(createBody().groupId(groupId).build())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_ADMIN_REQUIRED"));
    }

    @Test
    void update_aGroupSession_asAPlainMember_is403SessionGroupAdminRequired() throws Exception {
        Long sessionId = seedSession(groupId, SessionStatus.SCHEDULED);
        authenticateAs(memberId);
        mockMvc.perform(put("/api/sessions/{id}", sessionId).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(UpdateSessionRequest.builder().title("new").build())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_ADMIN_REQUIRED"));
    }

    @Test
    void update_aStandaloneSession_asANonCreator_is403SessionCreatorRequired() throws Exception {
        Long sessionId = seedSession(null, SessionStatus.SCHEDULED);
        authenticateAs(outsiderId);
        mockMvc.perform(put("/api/sessions/{id}", sessionId).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(UpdateSessionRequest.builder().title("new").build())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_CREATOR_REQUIRED"));
    }

    @Test
    void cancel_aStandaloneSession_asANonCreator_is403SessionCreatorRequired() throws Exception {
        Long sessionId = seedSession(null, SessionStatus.SCHEDULED);
        authenticateAs(outsiderId);
        mockMvc.perform(post("/api/sessions/{id}/cancel", sessionId).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(new CancelSessionRequest())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_CREATOR_REQUIRED"));
    }

    // -- 409 -----------------------------------------------------------------------------------

    @Test
    void join_aCancelledSession_is409SessionCancelled() throws Exception {
        Long sessionId = seedSession(null, SessionStatus.CANCELLED);
        authenticateAs(outsiderId);
        mockMvc.perform(post("/api/sessions/{id}/join", sessionId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_CANCELLED"));
    }

    @Test
    void approve_onACancelledSession_is409SessionCancelled() throws Exception {
        Long sessionId = seedSession(null, SessionStatus.CANCELLED);
        authenticateAs(creatorId);
        mockMvc.perform(post("/api/sessions/{id}/participants/{userId}/approve", sessionId, outsiderId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_CANCELLED"));
    }

    @Test
    void cancel_aCompletedSession_is409SessionNotCancellableWithStatus() throws Exception {
        Long sessionId = seedSession(null, SessionStatus.COMPLETED);
        authenticateAs(creatorId);
        mockMvc.perform(post("/api/sessions/{id}/cancel", sessionId).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(new CancelSessionRequest())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_NOT_CANCELLABLE"))
                .andExpect(jsonPath("$.errorParams.status").value("COMPLETED"));
    }

    @Test
    void update_locationOnAScheduledSession_is409SessionNotPreparing() throws Exception {
        Long sessionId = seedSession(null, SessionStatus.SCHEDULED);
        authenticateAs(creatorId);
        mockMvc.perform(put("/api/sessions/{id}", sessionId).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(UpdateSessionRequest.builder().locationId(2L).build())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_NOT_PREPARING"));
    }

    @Test
    void leave_whenNotAParticipant_is409SessionNotParticipant() throws Exception {
        Long sessionId = seedSession(null, SessionStatus.SCHEDULED);
        authenticateAs(outsiderId);
        mockMvc.perform(delete("/api/sessions/{id}/leave", sessionId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_NOT_PARTICIPANT"));
    }

    // -- 400 -----------------------------------------------------------------------------------

    @Test
    void leave_asTheCreatorOfAStandaloneSession_is400SessionCreatorCannotLeave() throws Exception {
        Long sessionId = seedSession(null, SessionStatus.SCHEDULED);
        authenticateAs(creatorId);
        mockMvc.perform(delete("/api/sessions/{id}/leave", sessionId))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_CREATOR_CANNOT_LEAVE"));
    }

    @Test
    void create_standaloneWithoutSportId_is400SessionSportRequired() throws Exception {
        authenticateAs(creatorId);
        mockMvc.perform(post("/api/sessions").contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(createBody().build())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SPORT_REQUIRED"));
    }

    @Test
    void upcoming_viewerZoneIdWithoutDate_is400AndUncoded() throws Exception {
        authenticateAs(creatorId);
        mockMvc.perform(get("/api/sessions/upcoming").param("viewerZoneId", "Asia/Ho_Chi_Minh"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").doesNotExist())
                .andExpect(jsonPath("$.message").value("viewerZoneId is only valid alongside date"));
    }
}
