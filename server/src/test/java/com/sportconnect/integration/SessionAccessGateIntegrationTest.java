package com.sportconnect.integration;

import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.Instant;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Real end-to-end coverage for SESSION-40 — {@code GET /api/sessions/{sessionId}} (previously
 * ungated entirely) and the tightened {@code GET /api/sessions/group/{groupId}}. {@code
 * SessionDetailGateSpec} and {@code SessionServiceImplSpec} cover the branch logic with
 * collaborators mocked; this class proves the whole chain — real {@code SessionController}/{@code
 * SessionServiceImpl}/{@code SessionDetailGate}/{@code GroupServiceImpl} beans, real H2-backed DB
 * round trip, real exception-to-HTTP-status mapping — actually rejects/accepts over real HTTP.
 * Sessions are inserted directly via the repository (no DB-level FK on {@code postId} — cross-domain
 * references are IDs only — so no real {@code Post} row is needed), same lighter-weight fixture
 * style {@code SessionDiscoverIntegrationTest} uses, unlike {@code SessionPostAccessGateIntegrationTest}
 * (which needs real posts because it exercises comment behavior through the real Post/Comment tables).
 */
class SessionAccessGateIntegrationTest extends BaseIT {

    private static final Integer ROLE_MEMBER = 3;

    @Autowired
    private SessionRepository sessionRepository;

    @Autowired
    private SessionParticipantRepository sessionParticipantRepository;

    @Autowired
    private GroupRepository groupRepository;

    @Autowired
    private GroupMemberRepository groupMemberRepository;

    @Autowired
    private UserRepository userRepository;

    private final AtomicLong postIdSeq = new AtomicLong(1);

    private UUID creatorId;
    private UUID viewerId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        creatorId = createUser("d40creator").getId();
        viewerId = createUser("d40viewer").getId();
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

    private Long createGroup(boolean isPrivate, boolean isActive) {
        Group group = Group.builder()
                .groupName("SESSION-40 Test Group " + UUID.randomUUID())
                .createdBy(creatorId)
                .isPrivate(isPrivate)
                .isActive(isActive)
                .build();
        return groupRepository.save(group).getId();
    }

    private void addMember(Long groupId, UUID userId) {
        groupMemberRepository.save(GroupMember.builder()
                .groupId(groupId).userId(userId).roleId(ROLE_MEMBER).build());
    }

    private Long createSession(Long groupId, boolean isPublic) {
        Session session = Session.builder()
                .groupId(groupId)
                .isPublic(isPublic)
                .postId(postIdSeq.getAndIncrement())
                .sessionType(groupId == null ? SessionType.STANDALONE : SessionType.GROUP_RECURRING)
                .createdBy(creatorId)
                .sportId(1L)
                .locationId(1L)
                .scheduledStart(Instant.now().plusSeconds(86400))
                .status(SessionStatus.SCHEDULED)
                .capacity(9999)
                .feeType(FeeType.FREE)
                .initialSlot(0)
                .autoApprove(false)
                .build();
        return sessionRepository.save(session).getId();
    }

    private void addParticipant(Long sessionId, UUID userId, ParticipantStatus status) {
        sessionParticipantRepository.save(SessionParticipant.builder()
                .sessionId(sessionId).userId(userId).status(status).build());
    }

    // ── GET /api/sessions/{sessionId} ────────────────────────────────────────

    @Test
    void getSession_standaloneIsPublicTrue_isVisibleToAnyAuthenticatedUser() throws Exception {
        Long sessionId = createSession(null, true);
        authenticateAs(viewerId);

        mockMvc.perform(get("/api/sessions/{sessionId}", sessionId))
                .andExpect(status().isOk());
    }

    @Test
    void getSession_standaloneIsPublicFalse_deniedWithoutAParticipantRow() throws Exception {
        Long sessionId = createSession(null, false);
        authenticateAs(viewerId);

        mockMvc.perform(get("/api/sessions/{sessionId}", sessionId))
                .andExpect(status().isForbidden());
    }

    @Test
    void getSession_standaloneIsPublicFalse_visibleToAJoinedRequestedOrInvitedParticipant() throws Exception {
        for (ParticipantStatus grantingStatus : new ParticipantStatus[] {
                ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED
        }) {
            Long sessionId = createSession(null, false);
            addParticipant(sessionId, viewerId, grantingStatus);
            authenticateAs(viewerId);

            mockMvc.perform(get("/api/sessions/{sessionId}", sessionId))
                    .andExpect(status().isOk());
        }
    }

    @Test
    void getSession_standaloneIsPublicFalse_deniedForALeftParticipant() throws Exception {
        Long sessionId = createSession(null, false);
        addParticipant(sessionId, viewerId, ParticipantStatus.LEFT);
        authenticateAs(viewerId);

        mockMvc.perform(get("/api/sessions/{sessionId}", sessionId))
                .andExpect(status().isForbidden());
    }

    @Test
    void getSession_groupLinkedIsPublicFalse_deniedForANonMember() throws Exception {
        Long groupId = createGroup(true, true);
        Long sessionId = createSession(groupId, false);
        authenticateAs(viewerId);

        mockMvc.perform(get("/api/sessions/{sessionId}", sessionId))
                .andExpect(status().isForbidden());
    }

    @Test
    void getSession_groupLinkedIsPublicFalse_visibleToAGroupMember() throws Exception {
        Long groupId = createGroup(true, true);
        Long sessionId = createSession(groupId, false);
        addMember(groupId, viewerId);
        authenticateAs(viewerId);

        mockMvc.perform(get("/api/sessions/{sessionId}", sessionId))
                .andExpect(status().isOk());
    }

    /** Future-proofing case (Session.isPublic's own Javadoc: a group session becoming
     * independently public is a real future feature, not built here) — not reachable via any real
     * API path today, built directly via the repository, same rationale as the SESSION-39
     * addendum's public-group-linked-session fixtures. */
    @Test
    void getSession_groupLinkedIsPublicTrue_visibleToANonMemberToo() throws Exception {
        Long groupId = createGroup(true, true);
        Long sessionId = createSession(groupId, true);
        authenticateAs(viewerId);

        mockMvc.perform(get("/api/sessions/{sessionId}", sessionId))
                .andExpect(status().isOk());
    }

    @Test
    void getSession_groupInactive_returnsNotFoundEvenForAMember() throws Exception {
        Long groupId = createGroup(true, false);
        Long sessionId = createSession(groupId, false);
        addMember(groupId, viewerId);
        authenticateAs(viewerId);

        mockMvc.perform(get("/api/sessions/{sessionId}", sessionId))
                .andExpect(status().isNotFound());
    }

    @Test
    void getSession_nonexistentSession_returnsNotFound() throws Exception {
        authenticateAs(viewerId);

        mockMvc.perform(get("/api/sessions/{sessionId}", 999999L))
                .andExpect(status().isNotFound());
    }

    // ── GET /api/sessions/group/{groupId} ────────────────────────────────────

    @Test
    void getGroupSessions_publicGroup_deniedForANonMember() throws Exception {
        Long groupId = createGroup(false, true);
        authenticateAs(viewerId);

        mockMvc.perform(get("/api/sessions/group/{groupId}", groupId))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getGroupSessions_publicGroup_visibleToAMember() throws Exception {
        Long groupId = createGroup(false, true);
        addMember(groupId, viewerId);
        authenticateAs(viewerId);

        mockMvc.perform(get("/api/sessions/group/{groupId}", groupId))
                .andExpect(status().isOk());
    }

    @Test
    void getGroupSessions_privateGroup_deniedForANonMember() throws Exception {
        Long groupId = createGroup(true, true);
        authenticateAs(viewerId);

        mockMvc.perform(get("/api/sessions/group/{groupId}", groupId))
                .andExpect(status().isBadRequest());
    }

    @Test
    void getGroupSessions_privateGroup_visibleToAMember() throws Exception {
        Long groupId = createGroup(true, true);
        addMember(groupId, viewerId);
        authenticateAs(viewerId);

        mockMvc.perform(get("/api/sessions/group/{groupId}", groupId))
                .andExpect(status().isOk());
    }
}
