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

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-GL-64 — {@code GET /api/sessions/{sessionId}/thread-people}, through the real controller, service, gate,
 * {@code GroupServiceImpl}, {@code UserServiceImpl} and the native name-search query on the H2 test database (whose
 * {@code immutable_unaccent} alias stands in for Postgres's). Covers the authorization boundary (the same gate as the
 * thread), who is listed, the name rule (first and last name, word-start, accent-insensitive), the size cap and the order.
 */
class SessionThreadPeopleIntegrationTest extends BaseIT {

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

    private UUID viewerId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        viewerId = createUser("Viewer", "Person", true).getId();
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

    private User createUser(String firstName, String lastName, boolean active) {
        User user = new User();
        user.setUsername("u_" + UUID.randomUUID());
        user.setEmail("u_" + UUID.randomUUID() + "@example.com");
        user.setFirstName(firstName);
        user.setLastName(lastName);
        user.setIsEmailVerified(false);
        user.setIsActive(active);
        return userRepository.save(user);
    }

    private Long createGroup() {
        return groupRepository.save(Group.builder().countryId(1L).regionId(1L)
                .groupName("Thread people group " + UUID.randomUUID())
                .createdBy(viewerId)
                .isPrivate(false)
                .isActive(true)
                .build()).getId();
    }

    private void addMember(Long groupId, UUID userId) {
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(userId).roleId(ROLE_MEMBER).build());
    }

    private Long createSession(Long groupId) {
        return sessionRepository.save(Session.builder().title("Thread people session")
                .groupId(groupId)
                .isPublic(false)
                .postId(postIdSeq.getAndIncrement())
                .sessionType(groupId == null ? SessionType.STANDALONE : SessionType.GROUP_RECURRING)
                .createdBy(viewerId)
                .sportId(1L)
                .locationId(1L)
                .scheduledStart(Instant.now().plusSeconds(86400))
                .status(SessionStatus.SCHEDULED)
                .capacity(9999)
                .feeType(FeeType.FREE)
                .initialSlot(0)
                .autoApprove(false)
                .build()).getId();
    }

    private void addParticipant(Long sessionId, UUID userId, ParticipantStatus status) {
        sessionParticipantRepository.save(SessionParticipant.builder()
                .sessionId(sessionId).userId(userId).status(status).build());
    }

    /** A session the viewer can read: they are a JOINED participant. */
    private Long sessionWithViewer(Long groupId) {
        Long sessionId = createSession(groupId);
        addParticipant(sessionId, viewerId, ParticipantStatus.JOINED);
        return sessionId;
    }

    private Long joined(Long sessionId, String firstName, String lastName) {
        addParticipant(sessionId, createUser(firstName, lastName, true).getId(), ParticipantStatus.JOINED);
        return sessionId;
    }

    // ── authorization boundary ───────────────────────────────────────────────

    @Test
    void aStrangerIsForbiddenAndAMissingSessionIsNotFound() throws Exception {
        Long sessionId = createSession(null);
        UUID stranger = createUser("Stranger", "Person", true).getId();

        mockMvc.perform(get("/api/sessions/{id}/thread-people", sessionId).header("Authorization", bearerFor(stranger, "USER")))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_FORBIDDEN"));
        mockMvc.perform(get("/api/sessions/{id}/thread-people", 999_999L).header("Authorization", bearerFor(viewerId, "USER")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SESSION_NOT_FOUND"));
    }

    @Test
    void aParticipantWhoLeftIsForbidden() throws Exception {
        Long sessionId = createSession(null);
        addParticipant(sessionId, viewerId, ParticipantStatus.LEFT);

        mockMvc.perform(get("/api/sessions/{id}/thread-people", sessionId).header("Authorization", bearerFor(viewerId, "USER")))
                .andExpect(status().isForbidden());
    }

    @Test
    void anUnauthenticatedCallerIsRefused() throws Exception {
        Long sessionId = sessionWithViewer(null);

        mockMvc.perform(get("/api/sessions/{id}/thread-people", sessionId))
                .andExpect(status().is4xxClientError());
    }

    // ── who is listed ────────────────────────────────────────────────────────

    @Test
    void joinedRequestedAndInvitedAreListedAndLeftIsNot_theCallerToo() throws Exception {
        Long sessionId = sessionWithViewer(null);
        addParticipant(sessionId, createUser("Joined", "One", true).getId(), ParticipantStatus.JOINED);
        addParticipant(sessionId, createUser("Requested", "Two", true).getId(), ParticipantStatus.REQUESTED);
        addParticipant(sessionId, createUser("Invited", "Three", true).getId(), ParticipantStatus.INVITED);
        addParticipant(sessionId, createUser("Left", "Four", true).getId(), ParticipantStatus.LEFT);

        mockMvc.perform(get("/api/sessions/{id}/thread-people", sessionId)
                        .param("size", "20").header("Authorization", bearerFor(viewerId, "USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(4)))
                .andExpect(jsonPath("$.data[?(@.fullName == 'Joined One')]").exists())
                .andExpect(jsonPath("$.data[?(@.fullName == 'Requested Two')]").exists())
                .andExpect(jsonPath("$.data[?(@.fullName == 'Invited Three')]").exists())
                .andExpect(jsonPath("$.data[?(@.fullName == 'Viewer Person')]").exists())
                .andExpect(jsonPath("$.data[?(@.fullName == 'Left Four')]").doesNotExist());
    }

    @Test
    void aDeactivatedUserAndAUserWithNoNameAreNotListed_andNoPrivateFieldLeaks() throws Exception {
        Long sessionId = sessionWithViewer(null);
        addParticipant(sessionId, createUser("Gone", "Away", false).getId(), ParticipantStatus.JOINED);
        addParticipant(sessionId, createUser(null, null, true).getId(), ParticipantStatus.JOINED);
        joined(sessionId, "Visible", "Person");

        mockMvc.perform(get("/api/sessions/{id}/thread-people", sessionId)
                        .param("size", "20").header("Authorization", bearerFor(viewerId, "USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(2)))
                .andExpect(jsonPath("$.data[?(@.fullName == 'Gone Away')]").doesNotExist())
                .andExpect(jsonPath("$.data[0].email").doesNotExist())
                .andExpect(jsonPath("$.data[0].username").doesNotExist())
                .andExpect(jsonPath("$.data[0].userId").exists())
                .andExpect(jsonPath("$.data[0].avatarUrl").hasJsonPath());
    }

    // ── the name rule ────────────────────────────────────────────────────────

    @Test
    void accentsAndCaseAreIgnored_includingTheVietnameseD() throws Exception {
        Long sessionId = sessionWithViewer(null);
        joined(sessionId, "Tuấn", "Nguyễn");
        joined(sessionId, "Minh", "Đặng");

        search(sessionId, "TUAN").andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].fullName").value("Tuấn Nguyễn"));
        search(sessionId, "nguyen").andExpect(jsonPath("$.data", hasSize(1)));
        search(sessionId, "dang").andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].fullName").value("Minh Đặng"));
        search(sessionId, "ĐẶ").andExpect(jsonPath("$.data", hasSize(1)));
    }

    @Test
    void aWordMustStartAName_neverTheMiddleOfOne() throws Exception {
        Long sessionId = sessionWithViewer(null);
        joined(sessionId, "Bao", "Tran");
        joined(sessionId, "Binh", "An");

        search(sessionId, "an").andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].fullName").value("Binh An"));
        search(sessionId, "ran").andExpect(jsonPath("$.data", hasSize(0)));
    }

    @Test
    void aLaterWordOfAFieldMatches_andSoDoesEveryWordOfAMultiWordQueryInAnyOrder() throws Exception {
        Long sessionId = sessionWithViewer(null);
        joined(sessionId, "Tuấn Anh", "Nguyễn");

        search(sessionId, "anh").andExpect(jsonPath("$.data", hasSize(1)));
        search(sessionId, "anh tu").andExpect(jsonPath("$.data", hasSize(1)));
        search(sessionId, "nguyen tuan").andExpect(jsonPath("$.data", hasSize(1)));
        search(sessionId, "anh zzz").andExpect(jsonPath("$.data", hasSize(0)));
    }

    @Test
    void theUsernameAndEmailAreNeverSearched_andAPercentSignIsNotAWildcard() throws Exception {
        Long sessionId = sessionWithViewer(null);
        User user = createUser("Plain", "Name", true);
        user.setUsername("zzhandle");
        userRepository.save(user);
        addParticipant(sessionId, user.getId(), ParticipantStatus.JOINED);

        search(sessionId, "zzhandle").andExpect(jsonPath("$.data", hasSize(0)));
        search(sessionId, "example").andExpect(jsonPath("$.data", hasSize(0)));
        search(sessionId, "%").andExpect(jsonPath("$.data", hasSize(0)));
        search(sessionId, "_").andExpect(jsonPath("$.data", hasSize(0)));
    }

    @Test
    void aNameBeginningWithTheFirstWordComesBeforeOneThatOnlyHasALaterWord() throws Exception {
        Long sessionId = sessionWithViewer(null);
        joined(sessionId, "Aaron Anh", "Le");
        joined(sessionId, "Anh Tu", "Pham");

        search(sessionId, "anh").andExpect(jsonPath("$.data", hasSize(2)))
                .andExpect(jsonPath("$.data[0].fullName").value("Anh Tu Pham"))
                .andExpect(jsonPath("$.data[1].fullName").value("Aaron Anh Le"));
    }

    // ── the cap ──────────────────────────────────────────────────────────────

    @Test
    void theSizeDefaultsToFive_isCutToTwenty_andIsAtLeastOne() throws Exception {
        Long sessionId = sessionWithViewer(null);
        for (int i = 0; i < 24; i++) {
            joined(sessionId, "Person" + (char) ('a' + i), "Same");
        }

        mockMvc.perform(get("/api/sessions/{id}/thread-people", sessionId).header("Authorization", bearerFor(viewerId, "USER")))
                .andExpect(jsonPath("$.data", hasSize(5)));
        mockMvc.perform(get("/api/sessions/{id}/thread-people", sessionId)
                        .param("size", "100").header("Authorization", bearerFor(viewerId, "USER")))
                .andExpect(jsonPath("$.data", hasSize(20)));
        mockMvc.perform(get("/api/sessions/{id}/thread-people", sessionId)
                        .param("size", "2").header("Authorization", bearerFor(viewerId, "USER")))
                .andExpect(jsonPath("$.data", hasSize(2)));
        mockMvc.perform(get("/api/sessions/{id}/thread-people", sessionId)
                        .param("size", "0").header("Authorization", bearerFor(viewerId, "USER")))
                .andExpect(jsonPath("$.data", hasSize(1)));
    }

    // ── group sessions ───────────────────────────────────────────────────────

    @Test
    void aGroupSessionListsParticipantsFirstThenMembers_eachOnce() throws Exception {
        Long groupId = createGroup();
        Long sessionId = sessionWithViewer(groupId);
        UUID both = createUser("Both", "Roles", true).getId();
        addParticipant(sessionId, both, ParticipantStatus.JOINED);
        addMember(groupId, both);
        addMember(groupId, createUser("Aaa", "Member", true).getId());
        addMember(groupId, createUser("Zzz", "Member", true).getId());

        // Order proves the tiers: "Both Roles" (a participant) is first although "Aaa Member" sorts before it by name.
        mockMvc.perform(get("/api/sessions/{id}/thread-people", sessionId)
                        .param("size", "20").header("Authorization", bearerFor(viewerId, "USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(4)))
                .andExpect(jsonPath("$.data[0].fullName").value("Both Roles"))
                .andExpect(jsonPath("$.data[1].fullName").value("Viewer Person"))
                .andExpect(jsonPath("$.data[2].fullName").value("Aaa Member"))
                .andExpect(jsonPath("$.data[3].fullName").value("Zzz Member"));
    }

    @Test
    void aGroupMemberWhoIsNotAParticipantCanReadAndFindOthers() throws Exception {
        Long groupId = createGroup();
        Long sessionId = createSession(groupId);
        UUID member = createUser("Only", "Member", true).getId();
        addMember(groupId, member);
        addMember(groupId, createUser("Other", "Member", true).getId());

        mockMvc.perform(get("/api/sessions/{id}/thread-people", sessionId)
                        .param("q", "oth").header("Authorization", bearerFor(member, "USER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data", hasSize(1)))
                .andExpect(jsonPath("$.data[0].fullName").value("Other Member"));
    }

    @Test
    void aStandaloneSessionNeverListsGroupPeople() throws Exception {
        Long sessionId = sessionWithViewer(null);
        Long groupId = createGroup();
        addMember(groupId, createUser("Outside", "Member", true).getId());

        search(sessionId, "outside").andExpect(jsonPath("$.data", hasSize(0)));
    }

    private org.springframework.test.web.servlet.ResultActions search(Long sessionId, String q) throws Exception {
        return mockMvc.perform(get("/api/sessions/{id}/thread-people", sessionId)
                        .param("q", q).param("size", "20").header("Authorization", bearerFor(viewerId, "USER")))
                .andExpect(status().isOk());
    }
}
