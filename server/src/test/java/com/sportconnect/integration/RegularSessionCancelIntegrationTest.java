package com.sportconnect.integration;

import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.location.entity.Location;
import com.sportconnect.location.repository.LocationRepository;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionOutboxEvent;
import com.sportconnect.session.repository.GroupSessionGenerationQueueRepository;
import com.sportconnect.session.repository.GroupSessionRecurrenceRepository;
import com.sportconnect.session.repository.GroupSessionSettingsRepository;
import com.sportconnect.session.repository.SessionOutboxEventRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.social.post.api.dto.PostType;
import com.sportconnect.social.post.entity.Post;
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

import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-GROUP-6 through the real pipeline: before turning generation off, switching the mode or deleting a configuration an
 * owner or admin can count the scheduled regular sessions, and ask for them to be cancelled with the change. A cancel made for a
 * rule change tells the audience and the players, never touches an {@code ONGOING} or a custom session, and never brings a
 * session back (it is not a "regular session ended" event).
 */
class RegularSessionCancelIntegrationTest extends RedisBaseIT {

    private static final Integer OWNER_ROLE_ID = 1;
    private static final Integer ADMIN_ROLE_ID = 2;
    private static final Integer MEMBER_ROLE_ID = 3;
    private static final String CANCELLED = "session.group.cancelled";

    @Autowired private GroupSessionSettingsRepository settingsRepository;
    @Autowired private GroupSessionRecurrenceRepository recurrenceRepository;
    @Autowired private GroupSessionGenerationQueueRepository queueRepository;
    @Autowired private SessionRepository sessionRepository;
    @Autowired private SessionParticipantRepository participantRepository;
    @Autowired private SessionOutboxEventRepository outboxRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private GroupMemberRepository groupMemberRepository;
    @Autowired private PostRepository postRepository;
    @Autowired private CommentRepository commentRepository;
    @Autowired private LocationRepository locationRepository;
    @Autowired private SportRepository sportRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private CacheManager cacheManager;

    private UUID ownerId;
    private UUID adminId;
    private UUID memberA;
    private UUID memberB;
    private UUID deactivatedMember;
    private Long sportId;
    private Long locationId;
    private Long groupId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        ownerId = createUserWithRoles(true, "USER");
        adminId = createUserWithRoles(true, "USER");
        memberA = createUserWithRoles(true, "USER");
        memberB = createUserWithRoles(true, "USER");
        deactivatedMember = createUserWithRoles(false, "USER");
        sportId = sportRepository.save(Sport.builder().name("SESSION-GROUP-6 " + UUID.randomUUID()).isActive(true).build()).getId();
        evictSportCache();
        locationId = locationRepository.save(Location.builder().sportId(sportId).name("Court").timezone("UTC").createdBy(ownerId).build()).getId();
        groupId = groupRepository.save(Group.builder().countryId(1L).regionId(1L).groupName("Sunday Smash").createdBy(ownerId).isPrivate(true).isActive(true)
                .sportId(sportId).build()).getId();
        join(ownerId, OWNER_ROLE_ID);
        join(adminId, ADMIN_ROLE_ID);
        for (UUID member : List.of(memberA, memberB, deactivatedMember)) {
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
        participantRepository.deleteAll();
        sessionRepository.deleteAll();
        queueRepository.deleteAll();
        recurrenceRepository.deleteAll();
        settingsRepository.deleteAll();
        postRepository.deleteAll();
        groupMemberRepository.deleteAll();
        groupRepository.deleteAll();
        locationRepository.deleteAll();
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

    private String base() {
        return "/api/sessions/group/" + groupId;
    }

    private ResultActions putAs(UUID userId, String path, Object body) throws Exception {
        return mockMvc.perform(put(base() + path).header("Authorization", bearer(userId))
                .contentType(MediaType.APPLICATION_JSON).content(toJson(body)));
    }

    private ResultActions countAs(UUID userId, String query) throws Exception {
        return mockMvc.perform(get(base() + "/regular-sessions/count" + query).header("Authorization", bearer(userId)));
    }

    /** Switches generation on and adds a complete configuration for a slot two hours from now: one SCHEDULED regular session. */
    private Long generateOneRegularSession() throws Exception {
        putAs(adminId, "/settings", Map.of("enabled", true)).andExpect(status().isOk());
        Instant start = Instant.now().plus(Duration.ofHours(2)).truncatedTo(ChronoUnit.MINUTES);
        Map<String, Object> body = new HashMap<>();
        body.put("dayKey", start.atOffset(ZoneOffset.UTC).getDayOfWeek().getValue());
        body.put("startTime", LocalTime.ofInstant(start, ZoneOffset.UTC).toString());
        body.put("durationMinutes", 90);
        body.put("locationId", locationId);
        String json = mockMvc.perform(post(base() + "/recurrences").header("Authorization", bearer(adminId))
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(body)))
                .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        Long recurrenceId = objectMapper.readTree(json).get("data").get("id").asLong();
        assertThat(regularSessions()).hasSize(1);
        return recurrenceId;
    }

    private List<Session> regularSessions() {
        return sessionRepository.findAll().stream().filter(s -> s.getRecurrenceId() != null).toList();
    }

    private Set<UUID> cancelRecipients() throws Exception {
        Set<UUID> ids = new HashSet<>();
        for (SessionOutboxEvent event : outboxRepository.findAll()) {
            if (CANCELLED.equals(event.getEventType())) {
                ids.add(UUID.fromString(objectMapper.readTree(event.getPayload()).get("recipientUserId").asText()));
            }
        }
        return ids;
    }

    private void addCustomSession(SessionStatus status) {
        Long postId = postRepository.save(Post.builder().userId(ownerId).groupId(null).postType(PostType.SESSION_POST)
                .content("Session: custom").visibility("private").isActive(true).build()).getId();
        sessionRepository.save(Session.builder().title("Custom").groupId(groupId).isPublic(false).postId(postId)
                .sessionType(SessionType.GROUP_RECURRING).createdBy(memberA).sportId(sportId).locationId(locationId)
                .scheduledStart(Instant.now().plus(Duration.ofDays(1))).scheduledEndAt(Instant.now().plus(Duration.ofDays(1)).plusSeconds(5400))
                .status(status).capacity(10).feeType(FeeType.FREE).initialSlot(0).gameMood(5).build());
    }

    // ---- counting ---------------------------------------------------------------------------------------------------

    @Test
    void theCount_isPerGroupOrPerConfiguration_andCountsOnlyScheduledRegularSessions() throws Exception {
        Long recurrenceId = generateOneRegularSession();
        addCustomSession(SessionStatus.SCHEDULED);

        countAs(adminId, "").andExpect(status().isOk()).andExpect(jsonPath("$.data.count").value(1));
        countAs(adminId, "?scope=ALL").andExpect(status().isOk()).andExpect(jsonPath("$.data.count").value(1));
        countAs(adminId, "?scope=RECURRENCE&recurrenceId=" + recurrenceId).andExpect(jsonPath("$.data.count").value(1));
        countAs(adminId, "?scope=RECURRENCE&recurrenceId=987654").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECURRENCE_NOT_FOUND"));
        countAs(adminId, "?scope=RECURRENCE").andExpect(status().isBadRequest());

        // A session already under way is never counted.
        Session regular = regularSessions().get(0);
        regular.setStatus(SessionStatus.ONGOING);
        sessionRepository.save(regular);
        countAs(adminId, "").andExpect(jsonPath("$.data.count").value(0));
    }

    @Test
    void onlyAnOwnerOrAdminMayCount() throws Exception {
        generateOneRegularSession();

        countAs(memberA, "").andExpect(status().isForbidden()).andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_ADMIN_REQUIRED"));
        countAs(ownerId, "").andExpect(status().isOk());
    }

    // ---- turning generation off -------------------------------------------------------------------------------------

    @Test
    void turningGenerationOff_withCancelScheduled_cancelsThem_tellsTheAudience_andBringsNothingBack() throws Exception {
        generateOneRegularSession();
        addCustomSession(SessionStatus.SCHEDULED);
        outboxRepository.deleteAll();

        putAs(adminId, "/settings", Map.of("enabled", false, "cancelScheduled", true)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.enabled").value(false))
                .andExpect(jsonPath("$.data.cancelledSessions").value(1));

        List<Session> regular = regularSessions();
        assertThat(regular).hasSize(1);
        assertThat(regular.get(0).getStatus()).isEqualTo(SessionStatus.CANCELLED);
        assertThat(regular.get(0).getCancelledBy()).isEqualTo(adminId);
        assertThat(regular.get(0).getCancelReason()).contains("turned off regular sessions");
        // The audience (the owner, both members; not the admin who did it, not the deactivated account).
        assertThat(cancelRecipients()).containsExactlyInAnyOrder(ownerId, memberA, memberB);
        // The custom session is a different thing: untouched.
        assertThat(sessionRepository.findAll().stream().filter(s -> s.getRecurrenceId() == null))
                .allMatch(s -> s.getStatus() == SessionStatus.SCHEDULED);
        // Nothing came back: still one regular session, and switching OFF queued nothing.
        assertThat(regularSessions()).hasSize(1);
    }

    @Test
    void turningGenerationOff_withoutCancelScheduled_leavesThemThere() throws Exception {
        generateOneRegularSession();

        putAs(adminId, "/settings", Map.of("enabled", false)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.cancelledSessions").value(0));

        assertThat(regularSessions()).singleElement().satisfies(s -> assertThat(s.getStatus()).isEqualTo(SessionStatus.SCHEDULED));
        assertThat(cancelRecipients()).isEmpty();
    }

    @Test
    void anOngoingRegularSession_isNeverCancelledByARuleChange() throws Exception {
        generateOneRegularSession();
        Session regular = regularSessions().get(0);
        regular.setStatus(SessionStatus.ONGOING);
        sessionRepository.save(regular);

        putAs(adminId, "/settings", Map.of("enabled", false, "cancelScheduled", true)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.cancelledSessions").value(0));

        assertThat(regularSessions().get(0).getStatus()).isEqualTo(SessionStatus.ONGOING);
    }

    // ---- switching the mode -----------------------------------------------------------------------------------------

    @Test
    void switchingTheMode_withCancelScheduled_cancelsThem_andOnlyThen() throws Exception {
        generateOneRegularSession();

        // Not asked: the session stays.
        putAs(ownerId, "/settings", Map.of("mode", "MONTHLY")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.cancelledSessions").value(0));
        assertThat(regularSessions().get(0).getStatus()).isEqualTo(SessionStatus.SCHEDULED);

        // Asked: switching back cancels it.
        putAs(ownerId, "/settings", Map.of("mode", "WEEKLY", "cancelScheduled", true)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.cancelledSessions").value(1));
        assertThat(regularSessions().get(0).getStatus()).isEqualTo(SessionStatus.CANCELLED);
        assertThat(regularSessions().get(0).getCancelReason()).contains("switched its regular sessions to weekly");
    }

    // ---- deleting a configuration ---------------------------------------------------------------------------------------

    @Test
    void deletingAConfiguration_withoutCancelScheduled_leavesWhatItGenerated() throws Exception {
        Long recurrenceId = generateOneRegularSession();

        mockMvc.perform(delete(base() + "/recurrences/" + recurrenceId).header("Authorization", bearer(adminId)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.count").value(0));
        assertThat(regularSessions().get(0).getStatus()).isEqualTo(SessionStatus.SCHEDULED);
        assertThat(recurrenceRepository.findById(recurrenceId)).isEmpty();
    }

    @Test
    void deletingAConfiguration_withCancelScheduled_true() throws Exception {
        Long recurrenceId = generateOneRegularSession();
        outboxRepository.deleteAll();

        mockMvc.perform(delete(base() + "/recurrences/" + recurrenceId + "?cancelScheduled=true").header("Authorization", bearer(adminId)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.count").value(1));

        assertThat(recurrenceRepository.findById(recurrenceId)).isEmpty();
        assertThat(regularSessions()).singleElement().satisfies(s -> {
            assertThat(s.getStatus()).isEqualTo(SessionStatus.CANCELLED);
            assertThat(s.getCancelReason()).contains("removed this regular session configuration");
        });
        assertThat(cancelRecipients()).containsExactlyInAnyOrder(ownerId, memberA, memberB);
    }

    @Test
    void aPlainMemberCannotCancelThroughARuleChange() throws Exception {
        Long recurrenceId = generateOneRegularSession();

        putAs(memberA, "/settings", Map.of("enabled", false, "cancelScheduled", true)).andExpect(status().isForbidden());
        mockMvc.perform(delete(base() + "/recurrences/" + recurrenceId + "?cancelScheduled=true").header("Authorization", bearer(memberA)))
                .andExpect(status().isForbidden());

        assertThat(regularSessions().get(0).getStatus()).isEqualTo(SessionStatus.SCHEDULED);
        assertThat(recurrenceRepository.findById(recurrenceId)).isPresent();
    }
}
