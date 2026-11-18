package com.sportconnect.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.session.api.dto.CreateSessionRequest;
import com.sportconnect.session.api.dto.GroupAudience;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionOutboxEvent;
import com.sportconnect.session.repository.SessionAudienceMemberRepository;
import com.sportconnect.session.repository.SessionOutboxEventRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.social.post.repository.CommentRepository;
import com.sportconnect.social.post.repository.PostRepository;
import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.repository.SportRepository;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-GROUP-1 through the real pipeline: a group member (not only an owner or admin) creates a custom group session; its
 * audience decides who is told; the creator (while a member) and the owner and admins manage it; a cancel tells the audience
 * and the players. Real tokens, {@code SessionServiceImpl}, {@code GroupServiceImpl} membership, the real outbox and audience
 * tables and {@code GlobalExceptionHandler}. {@code SessionServiceImplSpec} covers every branch with mocks.
 */
class SessionGroupCustomSessionIntegrationTest extends RedisBaseIT {

    private static final Integer OWNER_ROLE_ID = 1;
    private static final Integer ADMIN_ROLE_ID = 2;
    private static final Integer MEMBER_ROLE_ID = 3;
    private static final String CREATED = "session.group.created";
    private static final String CANCELLED = "session.group.cancelled";

    @Autowired private SessionRepository sessionRepository;
    @Autowired private SessionParticipantRepository participantRepository;
    @Autowired private SessionAudienceMemberRepository audienceRepository;
    @Autowired private SessionOutboxEventRepository outboxRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private GroupMemberRepository groupMemberRepository;
    @Autowired private PostRepository postRepository;
    @Autowired private CommentRepository commentRepository;
    @Autowired private SportRepository sportRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private CacheManager cacheManager;

    private UUID ownerId;
    private UUID adminId;
    private UUID creatorId;
    private UUID memberA;
    private UUID memberB;
    private UUID deactivatedMember;
    private UUID outsiderId;
    private Long sportId;
    private Long otherSportId;
    private Long groupId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        ownerId = createUserWithRoles(true, "USER");
        adminId = createUserWithRoles(true, "USER");
        creatorId = createUserWithRoles(true, "USER");
        memberA = createUserWithRoles(true, "USER");
        memberB = createUserWithRoles(true, "USER");
        deactivatedMember = createUserWithRoles(false, "USER");
        outsiderId = createUserWithRoles(true, "USER");
        sportId = sportRepository.save(Sport.builder().name("SESSION-GROUP-1 " + UUID.randomUUID()).isActive(true).build()).getId();
        otherSportId = sportRepository.save(Sport.builder().name("SESSION-GROUP-1 other " + UUID.randomUUID()).isActive(true).build()).getId();
        evictSportCache();
        groupId = groupRepository.save(Group.builder().groupName("SESSION-GROUP-1 " + UUID.randomUUID())
                .createdBy(ownerId).isPrivate(true).isActive(true).sportId(sportId).build()).getId();
        join(ownerId, OWNER_ROLE_ID);
        join(adminId, ADMIN_ROLE_ID);
        for (UUID member : List.of(creatorId, memberA, memberB, deactivatedMember)) {
            join(member, MEMBER_ROLE_ID);
        }
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
    }

    private void clearAll() {
        outboxRepository.deleteAll();
        commentRepository.deleteAll();
        audienceRepository.deleteAll();
        participantRepository.deleteAll();
        sessionRepository.deleteAll();
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

    private void join(UUID userId, Integer roleId) {
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(userId).roleId(roleId).build());
    }

    private void leaveGroup(UUID userId) {
        groupMemberRepository.deleteAll(groupMemberRepository.findAll().stream()
                .filter(m -> m.getGroupId().equals(groupId) && m.getUserId().equals(userId)).toList());
    }

    private CreateSessionRequest.CreateSessionRequestBuilder body() {
        // No location: the session starts PREPARING, which keeps the test off the location module and still exercises create.
        return CreateSessionRequest.builder().title("Group game").groupId(groupId)
                .scheduledStart(Instant.now().plusSeconds(86400)).capacity(10).gameMood(5);
    }

    private ResultActions createAs(UUID userId, CreateSessionRequest request) throws Exception {
        return mockMvc.perform(post("/api/sessions").header("Authorization", bearer(userId))
                .contentType(MediaType.APPLICATION_JSON).content(toJson(request)));
    }

    private Long createdIdBy(UUID userId, CreateSessionRequest request) throws Exception {
        String json = createAs(userId, request).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(json).get("data").get("id").asLong();
    }

    private ResultActions cancelAs(UUID userId, Long sessionId) throws Exception {
        return mockMvc.perform(post("/api/sessions/{id}/cancel", sessionId).header("Authorization", bearer(userId))
                .contentType(MediaType.APPLICATION_JSON).content("{}"));
    }

    private ResultActions updateAs(UUID userId, Long sessionId, Map<String, Object> fields) throws Exception {
        return mockMvc.perform(put("/api/sessions/{id}", sessionId).header("Authorization", bearer(userId))
                .contentType(MediaType.APPLICATION_JSON).content(toJson(fields)));
    }

    /** The recipients of every outbox row of one event type. */
    private Set<UUID> recipients(String eventType) throws Exception {
        Set<UUID> ids = new java.util.HashSet<>();
        for (SessionOutboxEvent event : outboxRepository.findAll()) {
            if (eventType.equals(event.getEventType())) {
                ids.add(UUID.fromString(objectMapper.readTree(event.getPayload()).get("recipientUserId").asText()));
            }
        }
        return ids;
    }

    private long count(String eventType) {
        return outboxRepository.findAll().stream().filter(e -> eventType.equals(e.getEventType())).count();
    }

    // ---- who may create ---------------------------------------------------------------------------------------------

    @Test
    void aPlainMember_createsAGroupSession_withTheGroupsSport_notPublic_autoApprove_andIsJoined() throws Exception {
        String json = createAs(creatorId, body().sportId(otherSportId).build()).andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.groupId").value(groupId))
                .andExpect(jsonPath("$.data.sportId").value(sportId))
                .andExpect(jsonPath("$.data.isPublic").value(false))
                .andReturn().getResponse().getContentAsString();
        Long id = objectMapper.readTree(json).get("data").get("id").asLong();

        Session saved = sessionRepository.findById(id).orElseThrow();
        assertThat(saved.getSessionType()).isEqualTo(SessionType.GROUP_RECURRING);
        assertThat(saved.getSportId()).isEqualTo(sportId);
        assertThat(saved.getAutoApprove()).isTrue();
        assertThat(saved.getGroupAudience()).isEqualTo(GroupAudience.ALL_MEMBERS);
        assertThat(participantRepository.findBySessionIdAndUserId(id, creatorId).orElseThrow().getStatus())
                .isEqualTo(ParticipantStatus.JOINED);
    }

    @Test
    void aNonMember_isRefusedWith403_andNothingIsWritten() throws Exception {
        createAs(outsiderId, body().build()).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_MEMBER_REQUIRED"));

        assertThat(sessionRepository.count()).isZero();
        assertThat(outboxRepository.count()).isZero();
    }

    @Test
    void aDeactivatedCaller_getsNoSession() throws Exception {
        mockMvc.perform(post("/api/sessions").header("Authorization", bearer(deactivatedMember))
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(body().build())))
                .andExpect(status().is4xxClientError());

        assertThat(sessionRepository.count()).isZero();
    }

    @Test
    void twoGroupSessionsMayStartAtTheSameInstant_theUniqueKeyIsGone() throws Exception {
        Instant sameStart = Instant.now().plusSeconds(86400);
        createAs(creatorId, body().scheduledStart(sameStart).title("First").build()).andExpect(status().isCreated());
        createAs(memberA, body().scheduledStart(sameStart).title("Second").build()).andExpect(status().isCreated());

        assertThat(sessionRepository.count()).isEqualTo(2);
    }

    // ---- the audience -----------------------------------------------------------------------------------------------

    @Test
    void noAudience_tellsEveryOtherActiveMember_andNobodyElse() throws Exception {
        Long id = createdIdBy(creatorId, body().build());

        // The creator is excluded, the deactivated member is dropped, the outsider is not in the group.
        assertThat(recipients(CREATED)).containsExactlyInAnyOrder(ownerId, adminId, memberA, memberB);
        for (SessionOutboxEvent event : outboxRepository.findAll()) {
            JsonNode payload = objectMapper.readTree(event.getPayload());
            assertThat(payload.get("sessionId").asLong()).isEqualTo(id);
            assertThat(payload.get("actorId").asText()).isEqualTo(creatorId.toString());
            assertThat(payload.get("groupId").asLong()).isEqualTo(groupId);
        }
        // Only a notification: nobody is made a participant or an invitee.
        assertThat(participantRepository.findAll()).extracting(p -> p.getUserId()).containsExactly(creatorId);
        assertThat(audienceRepository.count()).isZero();
    }

    @Test
    void aSpecificAudience_isStored_andOnlyThoseMembersAreTold_noInvitedRow() throws Exception {
        Long id = createdIdBy(creatorId, body().audience(GroupAudience.SPECIFIC)
                .audienceUserIds(List.of(memberA, memberA, creatorId)).build());

        assertThat(sessionRepository.findById(id).orElseThrow().getGroupAudience()).isEqualTo(GroupAudience.SPECIFIC);
        assertThat(audienceRepository.findUserIdsBySessionId(id)).containsExactly(memberA);
        assertThat(recipients(CREATED)).containsExactly(memberA);
        assertThat(participantRepository.findAll()).allMatch(p -> p.getStatus() == ParticipantStatus.JOINED);
    }

    @Test
    void aSpecificAudienceNamingAnOutsider_is400_andNothingIsWritten() throws Exception {
        createAs(creatorId, body().audience(GroupAudience.SPECIFIC).audienceUserIds(List.of(memberA, outsiderId)).build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_AUDIENCE_NOT_MEMBER"));

        assertThat(sessionRepository.count()).isZero();
        assertThat(outboxRepository.count()).isZero();
    }

    @Test
    void aSpecificAudienceWithNobody_is400() throws Exception {
        createAs(creatorId, body().audience(GroupAudience.SPECIFIC).audienceUserIds(List.of(creatorId)).build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_AUDIENCE_REQUIRED"));
        createAs(creatorId, body().audience(GroupAudience.SPECIFIC).build())
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_AUDIENCE_REQUIRED"));

        assertThat(sessionRepository.count()).isZero();
    }

    @Test
    void aSpecificAudienceHasNoCap_aBigGroupAllMembersIsTold() throws Exception {
        List<UUID> chosen = new ArrayList<>();
        for (int i = 0; i < 120; i++) {
            UUID member = createUserWithRoles(true, "USER");
            join(member, MEMBER_ROLE_ID);
            chosen.add(member);
        }
        long started = System.nanoTime();
        Long id = createdIdBy(creatorId, body().audience(GroupAudience.SPECIFIC).audienceUserIds(chosen).build());
        long millis = (System.nanoTime() - started) / 1_000_000;

        assertThat(audienceRepository.findUserIdsBySessionId(id)).hasSize(120);
        assertThat(count(CREATED)).isEqualTo(120);
        System.out.println("SESSION-GROUP-1: a SPECIFIC audience of 120 created and notified in " + millis + " ms");
    }

    @Test
    void aMemberWhoLeftTheGroup_isNotToldOfALaterCancel_evenIfChosen() throws Exception {
        Long id = createdIdBy(creatorId, body().audience(GroupAudience.SPECIFIC)
                .audienceUserIds(List.of(memberA, memberB)).build());
        leaveGroup(memberB);

        cancelAs(creatorId, id).andExpect(status().isOk());

        assertThat(recipients(CANCELLED)).containsExactly(memberA);
    }

    // ---- who may change it, and who is told of a cancel ---------------------------------------------------------------

    @Test
    void theCreator_editsAndCancelsTheirOwnSession_whileAMember() throws Exception {
        Long id = createdIdBy(creatorId, body().build());

        updateAs(creatorId, id, Map.of("title", "Renamed by creator")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("Renamed by creator"));
        cancelAs(creatorId, id).andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("CANCELLED"));
    }

    @Test
    void anOrdinaryMember_whoIsNotTheCreator_cannotEditOrCancel() throws Exception {
        Long id = createdIdBy(creatorId, body().build());

        updateAs(memberA, id, Map.of("title", "Hijacked")).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_ADMIN_REQUIRED"));
        cancelAs(memberA, id).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_ADMIN_REQUIRED"));

        assertThat(sessionRepository.findById(id).orElseThrow().getTitle()).isEqualTo("Group game");
    }

    @Test
    void aCreatorWhoLeftTheGroup_losesTheRight() throws Exception {
        Long id = createdIdBy(creatorId, body().build());
        leaveGroup(creatorId);

        cancelAs(creatorId, id).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_ADMIN_REQUIRED"));
        updateAs(creatorId, id, Map.of("title", "Still mine?")).andExpect(status().isForbidden());
    }

    @Test
    void theOwnerAndAnAdmin_manageASessionTheyDidNotCreate() throws Exception {
        Long first = createdIdBy(creatorId, body().title("One").build());
        Long second = createdIdBy(creatorId, body().title("Two").build());

        updateAs(adminId, first, Map.of("title", "Admin edit")).andExpect(status().isOk());
        cancelAs(adminId, first).andExpect(status().isOk());
        cancelAs(ownerId, second).andExpect(status().isOk());
    }

    @Test
    void aCancel_tellsTheAudienceAndThePlayers_neverTheActor_neverADeactivatedAccount() throws Exception {
        Long id = createdIdBy(creatorId, body().build());
        // memberA asks to join and is auto-approved, so is JOINED as well as in the audience.
        mockMvc.perform(post("/api/sessions/{id}/join", id).header("Authorization", bearer(memberA))).andExpect(status().isOk());
        outboxRepository.deleteAll();

        cancelAs(adminId, id).andExpect(status().isOk());

        assertThat(recipients(CANCELLED)).containsExactlyInAnyOrder(ownerId, creatorId, memberA, memberB);
        assertThat(recipients(CANCELLED)).doesNotContain(adminId, deactivatedMember, outsiderId);
        assertThat(count(CANCELLED)).isEqualTo(4);
        Set<String> actors = outboxRepository.findAll().stream().filter(e -> CANCELLED.equals(e.getEventType()))
                .map(e -> {
                    try {
                        return objectMapper.readTree(e.getPayload()).get("actorId").asText();
                    } catch (Exception ex) {
                        throw new IllegalStateException(ex);
                    }
                }).collect(Collectors.toSet());
        assertThat(actors).containsExactly(adminId.toString());
    }
}
