package com.sportconnect.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionOutboxEvent;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.repository.SessionOutboxEventRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.social.post.api.dto.PostType;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-66 through the real pipeline: {@code POST /api/sessions/{id}/shares} with real Keycloak-style tokens (so a
 * deactivated caller meets the real JWT filter), {@code SessionShareGate}, {@code SessionServiceImpl}, the real friend
 * list, the real batch user lookup (which omits deactivated accounts), the outbox table and
 * {@code GlobalExceptionHandler}. {@code SessionServiceImplSpec} covers every branch with mocks; this proves the access
 * boundary and what a mock cannot: the derived participant query, the real friendship rows, the rows actually written.
 */
class SessionShareIntegrationTest extends RedisBaseIT {

    private static final String SHARE_CREATED = "session.share.created";
    private static final String INVITATION = "session.invitation.created";

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
    private Long sportId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        hostId = createUserWithRoles(true, "USER");
        sportId = sportRepository.save(Sport.builder().name("SESSION-66 " + UUID.randomUUID()).isActive(true).build())
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

    /** A friend of {@code ofUserId}: an active user and the friendship row, as the app stores it. */
    private UUID friendOf(UUID ofUserId) {
        UUID friendId = createUserWithRoles(true, "USER");
        friendshipRepository.save(Friendship.builder().userId(ofUserId).friendId(friendId).build());
        friendshipRepository.save(Friendship.builder().userId(friendId).friendId(ofUserId).build());
        return friendId;
    }

    private void join(Long sessionId, UUID userId, ParticipantStatus status) {
        participantRepository.save(SessionParticipant.builder().sessionId(sessionId).userId(userId).status(status).build());
    }

    /** A standalone session the host has JOINED (as {@code createSession} seeds it). */
    private Long standalone(SessionStatus status) {
        return seed(null, status, hostId);
    }

    private Long seed(Long groupId, SessionStatus status, UUID creatorId) {
        Long postId = postRepository.save(Post.builder().userId(creatorId).groupId(null).postType(PostType.SESSION_POST)
                .content("Session: fixture").visibility("private").isActive(true).build()).getId();
        Long id = sessionRepository.save(Session.builder().title("Share session")
                .groupId(groupId).isPublic(groupId == null).postId(postId)
                .sessionType(groupId == null ? SessionType.STANDALONE : SessionType.GROUP_RECURRING)
                .createdBy(creatorId).sportId(sportId).locationId(1L)
                .scheduledStart(Instant.now().plusSeconds(86400)).scheduledEndAt(Instant.now().plusSeconds(90000))
                .status(status).capacity(10).feeType(FeeType.FREE).initialSlot(0).autoApprove(false)
                .build()).getId();
        if (groupId == null) {
            join(id, creatorId, ParticipantStatus.JOINED);
        }
        return id;
    }

    private ResultActions share(Long sessionId, UUID callerId, List<UUID> userIds) throws Exception {
        return mockMvc.perform(post("/api/sessions/{id}/shares", sessionId)
                .header("Authorization", bearer(callerId))
                .contentType(MediaType.APPLICATION_JSON)
                .content(toJson(Map.of("userIds", userIds.stream().map(UUID::toString).toList()))));
    }

    private List<SessionOutboxEvent> shareEvents() {
        return outboxRepository.findAll().stream().filter(e -> SHARE_CREATED.equals(e.getEventType())).toList();
    }

    /** A share is not an invitation: the invitation event type must never be written by it. */
    private void assertNoInvitationEvent() {
        assertThat(outboxRepository.findAll().stream().filter(e -> INVITATION.equals(e.getEventType()))).isEmpty();
    }

    private void assertNothingWritten(Long sessionId, int participantRows) {
        assertThat(shareEvents()).isEmpty();
        assertThat(participantRepository.findAll().stream().filter(p -> sessionId.equals(p.getSessionId())).count())
                .isEqualTo(participantRows);
        assertThat(commentRepository.count()).isZero();
    }

    // ---- the happy path ----------------------------------------------------------------------------------------

    @Test
    void theHost_sharesWithFriends_oneShareEventEach_noParticipantRow_noComment() throws Exception {
        Long sessionId = standalone(SessionStatus.SCHEDULED);
        UUID a = friendOf(hostId);
        UUID b = friendOf(hostId);

        share(sessionId, hostId, List.of(a, b))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sent").value(2))
                .andExpect(jsonPath("$.data.skipped").value(0));

        List<SessionOutboxEvent> events = shareEvents();
        assertThat(events).hasSize(2);
        Set<UUID> recipients = new java.util.HashSet<>();
        for (SessionOutboxEvent event : events) {
            JsonNode payload = objectMapper.readTree(event.getPayload());
            assertThat(payload.get("sessionId").asLong()).isEqualTo(sessionId);
            assertThat(UUID.fromString(payload.get("actorId").asText())).isEqualTo(hostId);
            recipients.add(UUID.fromString(payload.get("recipientUserId").asText()));
        }
        assertThat(recipients).containsExactlyInAnyOrder(a, b);
        // A share is not an invitation: the host's own row is the only participant row, nothing is said in the
        // thread, and the invitation event type is not used.
        assertThat(participantRepository.findAll()).hasSize(1);
        assertNoInvitationEvent();
        assertThat(commentRepository.count()).isZero();
    }

    @Test
    void anotherJoinedParticipant_mayShare_andAPreparingSessionToo() throws Exception {
        Long sessionId = standalone(SessionStatus.PREPARING);
        UUID joiner = createUserWithRoles(true, "USER");
        join(sessionId, joiner, ParticipantStatus.JOINED);
        UUID friend = friendOf(joiner);

        share(sessionId, joiner, List.of(friend))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sent").value(1));

        assertThat(shareEvents()).hasSize(1);
        JsonNode payload = objectMapper.readTree(shareEvents().get(0).getPayload());
        assertThat(UUID.fromString(payload.get("actorId").asText())).isEqualTo(joiner);
    }

    @Test
    void theFriendWhoWasShared_decidesForThemself_andTheNormalJoinRulesApply() throws Exception {
        Long sessionId = standalone(SessionStatus.SCHEDULED);
        UUID friend = friendOf(hostId);
        share(sessionId, hostId, List.of(friend)).andExpect(status().isOk());

        // No INVITED row exists, so joining is an ordinary join request (the session needs host approval).
        mockMvc.perform(post("/api/sessions/{id}/join", sessionId).header("Authorization", bearer(friend)))
                .andExpect(status().isOk());

        SessionParticipant row = participantRepository.findBySessionIdAndUserId(sessionId, friend).orElseThrow();
        assertThat(row.getStatus()).isEqualTo(ParticipantStatus.REQUESTED);
        assertThat(outboxRepository.findAll().stream()
                .filter(e -> "session.join_request.created".equals(e.getEventType()))).hasSize(1);
    }

    // ---- who may share (access boundary) -----------------------------------------------------------------------

    @Test
    void anyCaller_mayShare_whateverTheirRelationToTheSession() throws Exception {
        Long sessionId = standalone(SessionStatus.SCHEDULED);
        int shared = 0;
        // CLIENT-SESSION-49: requested, invited, left and not in the session at all may share it too.
        for (ParticipantStatus held : new ParticipantStatus[] {
                ParticipantStatus.REQUESTED, ParticipantStatus.INVITED, ParticipantStatus.LEFT, null}) {
            UUID caller = createUserWithRoles(true, "USER");
            if (held != null) {
                join(sessionId, caller, held);
            }
            UUID friend = friendOf(caller);

            share(sessionId, caller, List.of(friend))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.sent").value(1));
            shared++;
            assertThat(shareEvents()).hasSize(shared);
        }
    }

    /** A private group with {@code hostId} as owner (SESSION-GROUP-3: a group session is shareable by its members). */
    private Long groupWithHost(boolean active) {
        Long groupId = groupRepository.save(Group.builder().groupName("Share " + UUID.randomUUID())
                .createdBy(hostId).isPrivate(true).isActive(active).build()).getId();
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(hostId).roleId(1).build());
        return groupId;
    }

    private UUID memberOf(Long groupId) {
        UUID member = createUserWithRoles(true, "USER");
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(member).roleId(3).build());
        return member;
    }

    @Test
    void aMember_sharesAGroupSession_withOtherMembersOnly_notWithFriendsOutsideTheGroup() throws Exception {
        Long groupId = groupWithHost(true);
        Long sessionId = seed(groupId, SessionStatus.SCHEDULED, hostId);
        UUID memberA = memberOf(groupId);
        UUID memberB = memberOf(groupId);
        UUID friendNotInGroup = friendOf(hostId);
        UUID strangerNotInGroup = createUserWithRoles(true, "USER");

        share(sessionId, memberA, List.of(hostId, memberB, friendNotInGroup, strangerNotInGroup))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sent").value(2))
                .andExpect(jsonPath("$.data.skipped").value(2));

        // The owner and the other member are told; the friend and the stranger are outside the group and are not.
        List<String> recipients = new ArrayList<>();
        for (SessionOutboxEvent event : shareEvents()) {
            JsonNode payload = objectMapper.readTree(event.getPayload());
            assertThat(payload.get("sessionId").asLong()).isEqualTo(sessionId);
            assertThat(payload.get("actorId").asText()).isEqualTo(memberA.toString());
            recipients.add(payload.get("recipientUserId").asText());
        }
        assertThat(recipients).containsExactlyInAnyOrder(hostId.toString(), memberB.toString());
        // A share is a notification: no participant row, no invitation.
        assertThat(participantRepository.findBySessionIdAndUserId(sessionId, memberB)).isEmpty();
        assertThat(participantRepository.findBySessionIdAndUserId(sessionId, hostId)).isEmpty();
        assertNoInvitationEvent();
    }

    @Test
    void aGroupSession_isShareableInAnyStatus() throws Exception {
        Long groupId = groupWithHost(true);
        UUID other = memberOf(groupId);
        int shared = 0;
        for (SessionStatus sessionStatus : SessionStatus.values()) {
            Long sessionId = seed(groupId, sessionStatus, hostId);
            share(sessionId, hostId, List.of(other)).andExpect(status().isOk()).andExpect(jsonPath("$.data.sent").value(1));
            shared++;
            assertThat(shareEvents()).hasSize(shared);
        }
    }

    @Test
    void aNonMember_cannotShareAGroupSession_403_andNothingIsWritten() throws Exception {
        Long groupId = groupWithHost(true);
        Long sessionId = seed(groupId, SessionStatus.SCHEDULED, hostId);
        UUID member = memberOf(groupId);
        UUID outsider = createUserWithRoles(true, "USER");

        share(sessionId, outsider, List.of(member))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_MEMBER_REQUIRED"));

        assertThat(shareEvents()).isEmpty();
    }

    @Test
    void aGroupSession_skipsADeactivatedMemberAndAMemberAlreadyInIt() throws Exception {
        Long groupId = groupWithHost(true);
        Long sessionId = seed(groupId, SessionStatus.SCHEDULED, hostId);
        UUID fresh = memberOf(groupId);
        UUID alreadyIn = memberOf(groupId);
        join(sessionId, alreadyIn, ParticipantStatus.JOINED);
        UUID deactivated = createUserWithRoles(false, "USER");
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(deactivated).roleId(3).build());

        share(sessionId, hostId, List.of(fresh, alreadyIn, deactivated))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sent").value(1))
                .andExpect(jsonPath("$.data.skipped").value(2));

        assertThat(shareEvents()).hasSize(1);
        assertThat(objectMapper.readTree(shareEvents().get(0).getPayload()).get("recipientUserId").asText())
                .isEqualTo(fresh.toString());
    }

    @Test
    void aGroupSessionOfAnInactiveGroup_is404() throws Exception {
        Long groupId = groupWithHost(false);
        Long sessionId = seed(groupId, SessionStatus.SCHEDULED, hostId);

        share(sessionId, hostId, List.of(createUserWithRoles(true, "USER")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SESSION_NOT_FOUND"));

        assertThat(shareEvents()).isEmpty();
    }

    @Test
    void theFiftyLimit_stillAppliesToAGroupShare() throws Exception {
        Long groupId = groupWithHost(true);
        Long sessionId = seed(groupId, SessionStatus.SCHEDULED, hostId);
        List<UUID> tooMany = new ArrayList<>();
        for (int i = 0; i < 51; i++) {
            tooMany.add(UUID.randomUUID());
        }

        share(sessionId, hostId, tooMany).andExpect(status().isBadRequest());

        assertThat(shareEvents()).isEmpty();
    }

    @Test
    void aMissingSession_is404() throws Exception {
        share(987654L, hostId, List.of(friendOf(hostId)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SESSION_NOT_FOUND"));
    }

    @Test
    void aDeactivatedCaller_isStoppedByTheRealJwtFilter_beforeAnythingRuns() throws Exception {
        UUID inactiveHost = createUserWithRoles(false, "USER");
        Long sessionId = seed(null, SessionStatus.SCHEDULED, inactiveHost);
        UUID friend = friendOf(inactiveHost);

        share(sessionId, inactiveHost, List.of(friend)).andExpect(status().isUnauthorized());

        assertThat(shareEvents()).isEmpty();
    }

    @Test
    void anAnonymousCaller_isUnauthorized() throws Exception {
        Long sessionId = standalone(SessionStatus.SCHEDULED);

        mockMvc.perform(post("/api/sessions/{id}/shares", sessionId).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"userIds\":[\"" + UUID.randomUUID() + "\"]}"))
                .andExpect(status().isUnauthorized());
    }

    // ---- the session's status -----------------------------------------------------------------------------------

    @Test
    void aSessionInAnyStatus_canBeShared() throws Exception {
        // CLIENT-SESSION-49 removed the status rule (SESSION_NOT_SHAREABLE): every status shares, one event each.
        UUID friend = friendOf(hostId);
        int shared = 0;
        for (SessionStatus status : SessionStatus.values()) {
            Long sessionId = standalone(status);

            share(sessionId, hostId, List.of(friend))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.data.sent").value(1));
            shared++;
            assertThat(shareEvents()).hasSize(shared);
        }
    }

    // ---- who may be shared with ---------------------------------------------------------------------------------

    @Test
    void aRecipientWhoIsNotAFriend_isSilentlyIgnored_neverNotified_andTheCallStillSucceeds() throws Exception {
        Long sessionId = standalone(SessionStatus.SCHEDULED);
        UUID friend = friendOf(hostId);
        UUID stranger = createUserWithRoles(true, "USER");
        // Friendship is the caller's own list: someone who only has the caller as a friend one way does not count.
        UUID oneWay = createUserWithRoles(true, "USER");
        friendshipRepository.save(Friendship.builder().userId(oneWay).friendId(hostId).build());

        share(sessionId, hostId, List.of(friend, stranger, oneWay))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sent").value(1))
                .andExpect(jsonPath("$.data.skipped").value(2));

        List<SessionOutboxEvent> events = shareEvents();
        assertThat(events).hasSize(1);
        assertThat(UUID.fromString(objectMapper.readTree(events.get(0).getPayload()).get("recipientUserId").asText()))
                .isEqualTo(friend);
    }

    @Test
    void sharingOnlyWithStrangers_sendsNothing_andIsNotAnError() throws Exception {
        Long sessionId = standalone(SessionStatus.SCHEDULED);
        UUID stranger = createUserWithRoles(true, "USER");

        share(sessionId, hostId, List.of(stranger))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.sent").value(0))
                .andExpect(jsonPath("$.data.skipped").value(1));

        assertNothingWritten(sessionId, 1);
    }

    @Test
    void skipped_theCaller_aDuplicate_aStranger_joinedRequestedInvited_andADeactivatedFriend_butNotAFriendWhoLeft() throws Exception {
        Long sessionId = standalone(SessionStatus.SCHEDULED);
        UUID fresh = friendOf(hostId);
        UUID left = friendOf(hostId);
        join(sessionId, left, ParticipantStatus.LEFT);
        UUID joined = friendOf(hostId);
        join(sessionId, joined, ParticipantStatus.JOINED);
        UUID requested = friendOf(hostId);
        join(sessionId, requested, ParticipantStatus.REQUESTED);
        UUID invited = friendOf(hostId);
        join(sessionId, invited, ParticipantStatus.INVITED);
        UUID deactivated = createUserWithRoles(false, "USER");
        friendshipRepository.save(Friendship.builder().userId(hostId).friendId(deactivated).build());
        UUID stranger = createUserWithRoles(true, "USER");

        List<UUID> ask = new ArrayList<>(List.of(fresh, fresh, hostId, left, joined, requested, invited, deactivated, stranger));
        share(sessionId, hostId, ask)
                .andExpect(status().isOk())
                // 8 distinct ids: fresh and left are notified, the other six are skipped.
                .andExpect(jsonPath("$.data.sent").value(2))
                .andExpect(jsonPath("$.data.skipped").value(6));

        Set<UUID> notified = shareEvents().stream().map(e -> {
            try {
                return UUID.fromString(objectMapper.readTree(e.getPayload()).get("recipientUserId").asText());
            } catch (Exception ex) {
                throw new IllegalStateException(ex);
            }
        }).collect(Collectors.toSet());
        assertThat(notified).containsExactlyInAnyOrder(fresh, left);
        // The friend who LEFT keeps their LEFT row: a share does not touch participants.
        assertThat(participantRepository.findBySessionIdAndUserId(sessionId, left).orElseThrow().getStatus())
                .isEqualTo(ParticipantStatus.LEFT);
    }

    // ---- request validation -------------------------------------------------------------------------------------

    @Test
    void anEmptyList_aListOver50_orANullEntry_isAValidationFailure_andNothingIsSent() throws Exception {
        Long sessionId = standalone(SessionStatus.SCHEDULED);
        List<String> over = new ArrayList<>();
        for (int i = 0; i < 51; i++) {
            over.add(UUID.randomUUID().toString());
        }
        for (String body : List.of(
                "{\"userIds\":[]}",
                "{}",
                "{\"userIds\":[null]}",
                toJson(Map.of("userIds", over)))) {
            mockMvc.perform(post("/api/sessions/{id}/shares", sessionId)
                            .header("Authorization", bearer(hostId))
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"));
        }
        assertThat(shareEvents()).isEmpty();
    }
}
