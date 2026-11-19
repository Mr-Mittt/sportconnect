package com.sportconnect.integration;

import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.location.entity.Location;
import com.sportconnect.location.repository.LocationRepository;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.GroupAudience;
import com.sportconnect.session.api.dto.RecurrenceMode;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.entity.GroupSessionGenerationItem;
import com.sportconnect.session.service.GroupSessionGenerationPlanner;
import com.sportconnect.session.service.GroupSessionOccurrenceGenerator;
import com.sportconnect.session.service.GroupSessionQueueWriter;
import com.sportconnect.session.entity.GroupSessionRecurrence;
import com.sportconnect.session.entity.GroupSessionSettings;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionOutboxEvent;
import com.sportconnect.session.repository.GroupSessionGenerationQueueRepository;
import com.sportconnect.session.repository.GroupSessionRecurrenceRepository;
import com.sportconnect.session.repository.GroupSessionSettingsRepository;
import com.sportconnect.session.repository.SessionOutboxEventRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.session.service.GroupSessionGenerationListener;
import com.sportconnect.session.service.GroupSessionGenerationRunner;
import com.sportconnect.session.service.SessionGenerationService;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-GROUP-5 through the real pipeline: the settings and recurrence endpoints (SESSION-GROUP-4) change a group's
 * configuration, the after-commit listener asks the planner what to queue, the runner drains the queue, and the generator
 * creates the regular sessions, with their companion posts, audience and {@code session.group.created} notifications. A
 * regular session ending (closed by the job or cancelled through the API) queues the next day. Real tokens, real tables
 * (the H2 mirror), real transactions and events. The Spock specs cover every branch of the planner, runner and generator
 * with mocks. All locations are in UTC, so a slot "two hours from now" is the same wall clock the generator reads.
 */
class GroupSessionGenerationIntegrationTest extends RedisBaseIT {

    private static final Integer OWNER_ROLE_ID = 1;
    private static final Integer ADMIN_ROLE_ID = 2;
    private static final Integer MEMBER_ROLE_ID = 3;
    private static final String CREATED = "session.group.created";

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
    @Autowired private SessionGenerationService sessionGenerationService;
    @Autowired private GroupSessionGenerationListener listener;
    @Autowired private GroupSessionGenerationRunner runner;
    @Autowired private GroupSessionGenerationPlanner planner;
    @Autowired private GroupSessionQueueWriter queueWriter;
    @Autowired private GroupSessionOccurrenceGenerator generator;
    @Autowired private PlatformTransactionManager transactionManager;

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
        sportId = sportRepository.save(Sport.builder().name("SESSION-GROUP-5 " + UUID.randomUUID()).isActive(true).build()).getId();
        evictSportCache();
        locationId = locationRepository.save(Location.builder().sportId(sportId).name("Court").timezone("UTC").createdBy(ownerId).build()).getId();
        groupId = groupRepository.save(Group.builder().groupName("Sunday Smash").createdBy(ownerId).isPrivate(true).isActive(true)
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

    private ResultActions send(UUID userId, String method, String path, Object body) throws Exception {
        var builder = "PUT".equals(method) ? put(base() + path) : post(base() + path);
        builder.header("Authorization", bearer(userId));
        if (body != null) {
            builder.contentType(MediaType.APPLICATION_JSON).content(toJson(body));
        }
        return mockMvc.perform(builder);
    }

    private void enableGeneration() throws Exception {
        send(adminId, "PUT", "/settings", Map.of("enabled", true)).andExpect(status().isOk());
    }

    /** The slot two hours from now, to the minute, in UTC: a recurrence that falls on it next. */
    private Instant slotStart() {
        return Instant.now().plus(Duration.ofHours(2)).truncatedTo(ChronoUnit.MINUTES);
    }

    private Map<String, Object> recurrenceFor(Instant start, boolean complete) {
        Map<String, Object> body = new HashMap<>();
        body.put("dayKey", start.atOffset(ZoneOffset.UTC).getDayOfWeek().getValue());
        body.put("startTime", LocalTime.ofInstant(start, ZoneOffset.UTC).toString());
        if (complete) {
            body.put("durationMinutes", 90);
            body.put("locationId", locationId);
        }
        return body;
    }

    private Long addRecurrence(Instant start) throws Exception {
        String json = send(adminId, "POST", "/recurrences", recurrenceFor(start, true)).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(json).get("data").get("id").asLong();
    }

    private List<Session> regularSessions() {
        return sessionRepository.findAll().stream().filter(s -> s.getRecurrenceId() != null).toList();
    }

    private Set<UUID> recipientsOf(String eventType) throws Exception {
        Set<UUID> ids = new HashSet<>();
        for (SessionOutboxEvent event : outboxRepository.findAll()) {
            if (eventType.equals(event.getEventType())) {
                ids.add(UUID.fromString(objectMapper.readTree(event.getPayload()).get("recipientUserId").asText()));
            }
        }
        return ids;
    }

    // ---- the configuration asks, the generator creates -----------------------------------------------------------------

    @Test
    void addingAConfiguration_whileGenerationIsOn_generatesTheSession_tellsTheAudience_andMarksTheQueueRowDone() throws Exception {
        enableGeneration();
        Instant start = slotStart();

        Long recurrenceId = addRecurrence(start);

        List<Session> sessions = regularSessions();
        assertThat(sessions).hasSize(1);
        Session session = sessions.get(0);
        assertThat(session.getRecurrenceId()).isEqualTo(recurrenceId);
        assertThat(session.getOccurrenceDate()).isEqualTo(LocalDate.ofInstant(start, ZoneOffset.UTC));
        assertThat(session.getScheduledStart()).isEqualTo(start);
        assertThat(session.getScheduledEndAt()).isEqualTo(start.plus(Duration.ofMinutes(90)));
        assertThat(session.getStatus()).isEqualTo(SessionStatus.SCHEDULED);
        assertThat(session.getGroupId()).isEqualTo(groupId);
        assertThat(session.getSessionType()).isEqualTo(SessionType.GROUP_RECURRING);
        assertThat(session.getCreatedBy()).isEqualTo(ownerId);
        assertThat(session.getSportId()).isEqualTo(sportId);
        assertThat(session.getLocationId()).isEqualTo(locationId);
        assertThat(session.getIsPublic()).isFalse();
        assertThat(session.getAutoApprove()).isTrue();
        assertThat(session.getFeeType()).isEqualTo(FeeType.FREE);
        assertThat(session.getGroupAudience()).isEqualTo(GroupAudience.ALL_MEMBERS);
        assertThat(session.getTitle()).isEqualTo("Sunday Smash's session");
        assertThat(postRepository.findById(session.getPostId())).isPresent();

        // The audience is told (all members but the owner, who is the author, and the deactivated account); nobody is invited.
        assertThat(recipientsOf(CREATED)).containsExactlyInAnyOrder(adminId, memberA, memberB);
        assertThat(participantRepository.findAll()).isEmpty();
        assertThat(queueRepository.findAll()).singleElement().satisfies(item -> {
            assertThat(item.getStatus()).isEqualTo(GroupSessionGenerationItem.Status.DONE);
            assertThat(item.getOccurrenceDate()).isEqualTo(session.getOccurrenceDate());
        });
    }

    @Test
    void aSpecificAudience_isSnapshottedOntoTheSession_andOnlyThoseAreTold() throws Exception {
        enableGeneration();
        Map<String, Object> body = recurrenceFor(slotStart(), true);
        body.put("audience", "SPECIFIC");
        body.put("audienceUserIds", List.of(memberA.toString()));

        send(adminId, "POST", "/recurrences", body).andExpect(status().isCreated());

        Session session = regularSessions().get(0);
        assertThat(session.getGroupAudience()).isEqualTo(GroupAudience.SPECIFIC);
        assertThat(sessionRepository.findById(session.getId()).orElseThrow().getGroupAudienceUserIds()).containsExactly(memberA);
        assertThat(recipientsOf(CREATED)).containsExactly(memberA);
    }

    @Test
    void editingTheConfiguration_orSwitchingGenerationBackOn_neverGeneratesADuplicate() throws Exception {
        enableGeneration();
        Instant start = slotStart();
        Long recurrenceId = addRecurrence(start);
        assertThat(regularSessions()).hasSize(1);

        send(adminId, "PUT", "/recurrences/" + recurrenceId, recurrenceFor(start, true)).andExpect(status().isOk());
        send(adminId, "PUT", "/settings", Map.of("enabled", false)).andExpect(status().isOk());
        send(adminId, "PUT", "/settings", Map.of("enabled", true)).andExpect(status().isOk());

        assertThat(regularSessions()).hasSize(1);
    }

    @Test
    void whileGenerationIsOff_nothingIsGenerated_untilItIsSwitchedOn() throws Exception {
        Instant start = slotStart();
        addRecurrence(start);

        assertThat(regularSessions()).isEmpty();
        assertThat(queueRepository.findAll()).isEmpty();

        enableGeneration();

        assertThat(regularSessions()).hasSize(1);
        assertThat(regularSessions().get(0).getScheduledStart()).isEqualTo(start);
    }

    @Test
    void aDraft_isNeverGenerated_untilItIsCompleted() throws Exception {
        enableGeneration();
        Instant start = slotStart();
        String json = send(adminId, "POST", "/recurrences", recurrenceFor(start, false)).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        Long id = objectMapper.readTree(json).get("data").get("id").asLong();

        assertThat(regularSessions()).isEmpty();

        send(adminId, "PUT", "/recurrences/" + id, recurrenceFor(start, true)).andExpect(status().isOk());

        assertThat(regularSessions()).hasSize(1);
    }

    @Test
    void aConfigurationOfTheOtherMode_isInert_switchingTheModeBackActivatesIt() throws Exception {
        enableGeneration();
        send(ownerId, "PUT", "/settings", Map.of("mode", "MONTHLY")).andExpect(status().isOk());
        Instant start = slotStart();
        // Created in MONTHLY mode with a day that would be a weekday number if it were weekly: the mode decides.
        Map<String, Object> monthly = recurrenceFor(start, true);
        monthly.put("dayKey", start.atOffset(ZoneOffset.UTC).getDayOfMonth());
        send(adminId, "POST", "/recurrences", monthly).andExpect(status().isCreated());
        assertThat(regularSessions()).hasSize(1);
        sessionRepository.deleteAll();
        queueRepository.deleteAll();

        send(ownerId, "PUT", "/settings", Map.of("mode", "WEEKLY")).andExpect(status().isOk());
        assertThat(regularSessions()).as("a monthly configuration is inert in WEEKLY mode").isEmpty();

        send(ownerId, "PUT", "/settings", Map.of("mode", "MONTHLY")).andExpect(status().isOk());
        assertThat(regularSessions()).hasSize(1);
    }

    // ---- a regular session ends: the next day ----------------------------------------------------------------------------

    /** Moves the recurrence to another weekday (so its next slot is a later date) and ends its generated session in the past. */
    private Session endTheFirstDayAndMoveTheRecurrence(Long recurrenceId, Session first, int moveByDays) {
        GroupSessionRecurrence recurrence = recurrenceRepository.findById(recurrenceId).orElseThrow();
        recurrence.setDayKey((recurrence.getDayKey() - 1 + moveByDays) % 7 + 1);
        recurrenceRepository.save(recurrence);
        return first;
    }

    @Test
    void theLastRegularSessionOfADayCompleting_generatesTheNextDay() throws Exception {
        enableGeneration();
        Long recurrenceId = addRecurrence(slotStart());
        Session first = regularSessions().get(0);
        endTheFirstDayAndMoveTheRecurrence(recurrenceId, first, 3);
        first.setStatus(SessionStatus.ONGOING);
        first.setScheduledStart(Instant.now().minus(Duration.ofHours(3)));
        first.setScheduledEndAt(Instant.now().minus(Duration.ofHours(2)));
        sessionRepository.save(first);

        sessionGenerationService.closePastSessions();

        assertThat(sessionRepository.findById(first.getId()).orElseThrow().getStatus()).isEqualTo(SessionStatus.COMPLETED);
        List<Session> sessions = regularSessions();
        assertThat(sessions).hasSize(2);
        Session next = sessions.stream().filter(s -> !s.getId().equals(first.getId())).findFirst().orElseThrow();
        assertThat(next.getOccurrenceDate()).isAfter(first.getOccurrenceDate());
        assertThat(next.getStatus()).isEqualTo(SessionStatus.SCHEDULED);
        assertThat(next.getRecurrenceId()).isEqualTo(recurrenceId);
    }

    @Test
    void cancellingTheLastRegularSession_generatesTheNextDay_butNotWhileGenerationIsOff() throws Exception {
        enableGeneration();
        Long recurrenceId = addRecurrence(slotStart());
        Session first = regularSessions().get(0);
        endTheFirstDayAndMoveTheRecurrence(recurrenceId, first, 3);

        // Generation is off: cancelling the session must not bring the next one back.
        send(adminId, "PUT", "/settings", Map.of("enabled", false)).andExpect(status().isOk());
        mockMvc.perform(post("/api/sessions/{id}/cancel", first.getId()).header("Authorization", bearer(ownerId))
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk());
        assertThat(regularSessions()).hasSize(1);

        // Generation on again: a new configuration change finds the next day (the cancelled session no longer blocks it).
        enableGeneration();
        List<Session> sessions = regularSessions();
        assertThat(sessions).hasSize(2);
        assertThat(sessions).filteredOn(s -> s.getStatus() == SessionStatus.CANCELLED).hasSize(1);
        assertThat(sessions).filteredOn(s -> s.getStatus() == SessionStatus.SCHEDULED).hasSize(1);
    }

    @Test
    void cancellingTheLastRegularSession_whileGenerationIsOn_generatesTheNextDay() throws Exception {
        enableGeneration();
        Long recurrenceId = addRecurrence(slotStart());
        Session first = regularSessions().get(0);
        endTheFirstDayAndMoveTheRecurrence(recurrenceId, first, 3);

        mockMvc.perform(post("/api/sessions/{id}/cancel", first.getId()).header("Authorization", bearer(ownerId))
                .contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isOk());

        List<Session> sessions = regularSessions();
        assertThat(sessions).hasSize(2);
        assertThat(sessions).filteredOn(s -> s.getStatus() == SessionStatus.CANCELLED).hasSize(1);
        assertThat(sessions).filteredOn(s -> s.getStatus() == SessionStatus.SCHEDULED).hasSize(1);
    }

    @Test
    void aCustomGroupSessionEnding_neverTriggersGeneration() throws Exception {
        enableGeneration();
        // A custom session (no recurrence) of the group, already over.
        Long postId = postRepository.save(com.sportconnect.social.post.entity.Post.builder().userId(ownerId).groupId(null)
                .postType(com.sportconnect.social.post.api.dto.PostType.SESSION_POST).content("Session: custom")
                .visibility("private").isActive(true).build()).getId();
        sessionRepository.save(Session.builder().title("Custom").groupId(groupId).isPublic(false).postId(postId)
                .sessionType(SessionType.GROUP_RECURRING).createdBy(memberA).sportId(sportId).locationId(locationId)
                .scheduledStart(Instant.now().minus(Duration.ofHours(3))).scheduledEndAt(Instant.now().minus(Duration.ofHours(2)))
                .status(SessionStatus.ONGOING).capacity(10).feeType(FeeType.FREE).initialSlot(0).gameMood(5).build());
        // The group has a complete configuration, so a trigger would have something to generate.
        recurrenceRepository.save(GroupSessionRecurrence.builder().groupId(groupId).mode(RecurrenceMode.WEEKLY).dayKey(1)
                .startTime(LocalTime.of(18, 0)).durationMinutes(90).locationId(locationId).draft(false).build());

        sessionGenerationService.closePastSessions();

        assertThat(regularSessions()).isEmpty();
        assertThat(queueRepository.findAll()).isEmpty();
    }

    // ---- recovery, retry, the guard ---------------------------------------------------------------------------------------

    @Test
    void theStartupRecovery_generatesASlotThatWasMissedWhileTheServerWasDown() throws Exception {
        // Seeded straight into the tables: no event fired, as if the server had been down when it was configured.
        settingsRepository.save(GroupSessionSettings.builder().groupId(groupId).enabled(true).mode(RecurrenceMode.WEEKLY).build());
        Instant start = slotStart();
        recurrenceRepository.save(GroupSessionRecurrence.builder().groupId(groupId).mode(RecurrenceMode.WEEKLY)
                .dayKey(start.atOffset(ZoneOffset.UTC).getDayOfWeek().getValue()).startTime(LocalTime.ofInstant(start, ZoneOffset.UTC))
                .durationMinutes(90).locationId(locationId).draft(false).build());
        assertThat(regularSessions()).isEmpty();

        listener.onStartup();

        assertThat(regularSessions()).hasSize(1);
        assertThat(regularSessions().get(0).getScheduledStart()).isEqualTo(start);
        // Running it again (a second instance, a restart) changes nothing.
        listener.onStartup();
        assertThat(regularSessions()).hasSize(1);
    }

    @Test
    void aFailingSlot_isRetriedWithABackoff_andEndsFailedAfterFiveAttempts() throws Exception {
        settingsRepository.save(GroupSessionSettings.builder().groupId(groupId).enabled(true).mode(RecurrenceMode.WEEKLY).build());
        // A location that does not exist: generating this slot fails every time. The queued date is tomorrow, and the recurrence
        // falls on tomorrow's weekday (a date off the rule is ignored, not retried).
        LocalDate tomorrow = LocalDate.now(ZoneOffset.UTC).plusDays(1);
        Long recurrenceId = recurrenceRepository.save(GroupSessionRecurrence.builder().groupId(groupId).mode(RecurrenceMode.WEEKLY)
                .dayKey(tomorrow.getDayOfWeek().getValue()).startTime(LocalTime.of(18, 0)).durationMinutes(90).locationId(987654L)
                .draft(false).build()).getId();
        Instant now = Instant.now();
        Long itemId = queueRepository.save(GroupSessionGenerationItem.builder().recurrenceId(recurrenceId)
                .occurrenceDate(tomorrow).targetStart(now.plus(Duration.ofDays(1)))
                .nextAttemptAt(now.minusSeconds(5)).build()).getId();

        runner.processDue();

        GroupSessionGenerationItem afterFirst = queueRepository.findById(itemId).orElseThrow();
        assertThat(afterFirst.getStatus()).isEqualTo(GroupSessionGenerationItem.Status.PENDING);
        assertThat(afterFirst.getAttempts()).isEqualTo(1);
        assertThat(afterFirst.getLastError()).isNotBlank();
        assertThat(afterFirst.getNextAttemptAt()).isAfter(now.plus(Duration.ofSeconds(30)));
        assertThat(regularSessions()).isEmpty();

        // Not due yet: another run leaves it alone.
        runner.processDue();
        assertThat(queueRepository.findById(itemId).orElseThrow().getAttempts()).isEqualTo(1);

        // The fifth failed attempt ends it.
        afterFirst.setAttempts(4);
        afterFirst.setNextAttemptAt(now.minusSeconds(5));
        queueRepository.save(afterFirst);
        runner.processDue();
        assertThat(queueRepository.findById(itemId).orElseThrow().getStatus()).isEqualTo(GroupSessionGenerationItem.Status.FAILED);
    }

    // ---- SESSION-GROUP-5 review: IGNORED slots (queue hardening) ---------------------------------------------------------

    /** A PENDING queue row, due now, for {@code date}. */
    private Long queuePending(Long recurrenceId, LocalDate date, Instant targetStart) {
        return queueRepository.save(GroupSessionGenerationItem.builder().recurrenceId(recurrenceId).occurrenceDate(date)
                .targetStart(targetStart).nextAttemptAt(Instant.now().minusSeconds(5)).build()).getId();
    }

    @Test
    void aQueuedDate_thatNoLongerFallsOnTheRecurrencesDay_isIgnoredAsSuperseded_andNoSessionIsCreated() throws Exception {
        enableGeneration();
        // The rule is "the weekday of a slot two hours from now"; the queued row is for a date two days later (another weekday):
        // the situation after an edit moved the recurrence's day while the old slot was still queued.
        Instant start = slotStart();
        Long recurrenceId = recurrenceRepository.save(GroupSessionRecurrence.builder().groupId(groupId).mode(RecurrenceMode.WEEKLY)
                .dayKey(start.atOffset(ZoneOffset.UTC).getDayOfWeek().getValue()).startTime(LocalTime.ofInstant(start, ZoneOffset.UTC))
                .durationMinutes(90).locationId(locationId).draft(false).build()).getId();
        LocalDate staleDate = LocalDate.ofInstant(start, ZoneOffset.UTC).plusDays(2);
        Long itemId = queuePending(recurrenceId, staleDate, start.plus(Duration.ofDays(2)));

        runner.processDue();

        assertThat(regularSessions()).isEmpty();
        GroupSessionGenerationItem item = queueRepository.findById(itemId).orElseThrow();
        assertThat(item.getStatus()).isEqualTo(GroupSessionGenerationItem.Status.IGNORED);
        assertThat(item.getIgnoredReason()).isEqualTo(GroupSessionGenerationItem.IgnoredReason.SUPERSEDED);
    }

    @Test
    void aSlotThatHasEnded_isIgnoredAsOutdated_notDone() throws Exception {
        enableGeneration();
        Instant start = Instant.now().minus(Duration.ofHours(3)).truncatedTo(ChronoUnit.MINUTES); // ended 90 minutes ago
        Long recurrenceId = recurrenceRepository.save(GroupSessionRecurrence.builder().groupId(groupId).mode(RecurrenceMode.WEEKLY)
                .dayKey(start.atOffset(ZoneOffset.UTC).getDayOfWeek().getValue()).startTime(LocalTime.ofInstant(start, ZoneOffset.UTC))
                .durationMinutes(90).locationId(locationId).draft(false).build()).getId();
        Long itemId = queuePending(recurrenceId, LocalDate.ofInstant(start, ZoneOffset.UTC), start);

        runner.processDue();

        assertThat(regularSessions()).isEmpty();
        GroupSessionGenerationItem item = queueRepository.findById(itemId).orElseThrow();
        assertThat(item.getStatus()).isEqualTo(GroupSessionGenerationItem.Status.IGNORED);
        assertThat(item.getIgnoredReason()).isEqualTo(GroupSessionGenerationItem.IgnoredReason.OUTDATED);
    }

    @Test
    void aSlotIgnoredBecauseGenerationWasOff_isRevivedAndGenerated_whenItIsSwitchedBackOn() throws Exception {
        Instant start = slotStart();
        Long recurrenceId = addRecurrence(start);                       // generation is off: nothing is queued or generated
        assertThat(queueRepository.findAll()).isEmpty();
        LocalDate date = LocalDate.ofInstant(start, ZoneOffset.UTC);
        Long itemId = queuePending(recurrenceId, date, start);          // the slot was queued just before the owner switched off

        runner.processDue();
        GroupSessionGenerationItem ignored = queueRepository.findById(itemId).orElseThrow();
        assertThat(ignored.getStatus()).isEqualTo(GroupSessionGenerationItem.Status.IGNORED);
        assertThat(ignored.getIgnoredReason()).isEqualTo(GroupSessionGenerationItem.IgnoredReason.GENERATION_OFF);
        assertThat(regularSessions()).isEmpty();

        enableGeneration();                                             // switched back on, the same day

        assertThat(regularSessions()).hasSize(1);
        GroupSessionGenerationItem revived = queueRepository.findById(itemId).orElseThrow();
        assertThat(revived.getStatus()).isEqualTo(GroupSessionGenerationItem.Status.DONE);
        assertThat(revived.getIgnoredReason()).isNull();
    }

    // ---- SESSION-GROUP-5 review: race-free queueing -------------------------------------------------------------------------

    private Long savedRecurrence(Instant start) {
        settingsRepository.save(GroupSessionSettings.builder().groupId(groupId).enabled(true).mode(RecurrenceMode.WEEKLY).build());
        return recurrenceRepository.save(GroupSessionRecurrence.builder().groupId(groupId).mode(RecurrenceMode.WEEKLY)
                .dayKey(start.atOffset(ZoneOffset.UTC).getDayOfWeek().getValue()).startTime(LocalTime.ofInstant(start, ZoneOffset.UTC))
                .durationMinutes(90).locationId(locationId).draft(false).build()).getId();
    }

    @Test
    void queueingASlot_ignoresTheRecurrencesOtherPendingSlots_asOutdatedWhenStarted_andSupersededWhenNot() {
        Instant start = slotStart();
        Long recurrenceId = savedRecurrence(start);
        LocalDate date = LocalDate.ofInstant(start, ZoneOffset.UTC);
        Long started = queuePending(recurrenceId, date.minusDays(7), start.minus(Duration.ofDays(7)));   // its start has passed
        Long notStarted = queuePending(recurrenceId, date.plusDays(7), start.plus(Duration.ofDays(7)));  // an old rule's later slot

        int queued = planner.enqueueAfterConfigurationChange(groupId);

        assertThat(queued).isEqualTo(1);
        assertThat(queueRepository.findById(started).orElseThrow()).satisfies(item -> {
            assertThat(item.getStatus()).isEqualTo(GroupSessionGenerationItem.Status.IGNORED);
            assertThat(item.getIgnoredReason()).isEqualTo(GroupSessionGenerationItem.IgnoredReason.OUTDATED);
        });
        assertThat(queueRepository.findById(notStarted).orElseThrow()).satisfies(item -> {
            assertThat(item.getStatus()).isEqualTo(GroupSessionGenerationItem.Status.IGNORED);
            assertThat(item.getIgnoredReason()).isEqualTo(GroupSessionGenerationItem.IgnoredReason.SUPERSEDED);
        });
        assertThat(queueRepository.findAll()).filteredOn(i -> i.getStatus() == GroupSessionGenerationItem.Status.PENDING)
                .singleElement().satisfies(item -> {
                    assertThat(item.getOccurrenceDate()).isEqualTo(date);
                    assertThat(item.getTargetStart()).isEqualTo(start);
                });
    }

    @Test
    void aPendingSlot_isReusedWhenTheTimeIsEditedTheSameDay_andItsOrderKeyIsRefreshed() {
        Instant start = slotStart();
        Long recurrenceId = savedRecurrence(start);
        LocalDate date = LocalDate.ofInstant(start, ZoneOffset.UTC);
        Long itemId = queuePending(recurrenceId, date, start.minus(Duration.ofHours(1)));                // the old time

        int queued = planner.enqueueAfterConfigurationChange(groupId);

        assertThat(queued).isZero();                                                                     // no new row
        assertThat(queueRepository.findAll()).singleElement().satisfies(item -> {
            assertThat(item.getId()).isEqualTo(itemId);
            assertThat(item.getStatus()).isEqualTo(GroupSessionGenerationItem.Status.PENDING);
            assertThat(item.getTargetStart()).isEqualTo(start);
        });
    }

    @Test
    void reviving_isACompareAndSet_onlyOneCallerRevivesAFailedSlot() {
        Instant start = slotStart();
        Long recurrenceId = savedRecurrence(start);
        LocalDate date = LocalDate.ofInstant(start, ZoneOffset.UTC);
        Long itemId = queueRepository.save(GroupSessionGenerationItem.builder().recurrenceId(recurrenceId).occurrenceDate(date)
                .targetStart(start).status(GroupSessionGenerationItem.Status.FAILED).attempts(5).lastError("boom")
                .nextAttemptAt(Instant.now().minusSeconds(999)).build()).getId();

        int first = queueWriter.revive(recurrenceId, date, start, Instant.now());
        int second = queueWriter.revive(recurrenceId, date, start, Instant.now());

        assertThat(first).isEqualTo(1);
        assertThat(second).isZero();
        GroupSessionGenerationItem item = queueRepository.findById(itemId).orElseThrow();
        assertThat(item.getStatus()).isEqualTo(GroupSessionGenerationItem.Status.PENDING);
        assertThat(item.getAttempts()).isZero();
        assertThat(item.getLastError()).isNull();

        // A slot that already has its session (DONE) is never revived.
        LocalDate other = date.plusDays(7);
        Long doneId = queueRepository.save(GroupSessionGenerationItem.builder().recurrenceId(recurrenceId).occurrenceDate(other)
                .targetStart(start.plus(Duration.ofDays(7))).status(GroupSessionGenerationItem.Status.DONE)
                .nextAttemptAt(Instant.now()).build()).getId();
        assertThat(queueWriter.revive(recurrenceId, other, start.plus(Duration.ofDays(7)), Instant.now())).isZero();
        assertThat(queueRepository.findById(doneId).orElseThrow().getStatus()).isEqualTo(GroupSessionGenerationItem.Status.DONE);
        // ... and its order key is never rewritten either (only a PENDING slot's is).
        assertThat(queueWriter.refreshTarget(recurrenceId, other, start, Instant.now())).isZero();
        assertThat(queueRepository.findById(doneId).orElseThrow().getTargetStart()).isEqualTo(start.plus(Duration.ofDays(7)));
    }

    @Test
    void insertingTheSameSlotTwice_failsOnTheUniqueKey_andLeavesTheFirstRowIntact() {
        Instant start = slotStart();
        Long recurrenceId = savedRecurrence(start);
        LocalDate date = LocalDate.ofInstant(start, ZoneOffset.UTC);

        queueWriter.insert(recurrenceId, date, start, Instant.now());

        assertThatThrownBy(() -> queueWriter.insert(recurrenceId, date, start, Instant.now()))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(queueRepository.findAll()).hasSize(1);
    }

    @Test
    void twoPlannersQueueingTheSameSlotAtOnce_bothFinish_andOneRowResults() throws Exception {
        Instant start = slotStart();
        savedRecurrence(start);
        CyclicBarrier together = new CyclicBarrier(2);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<Integer>> results = new ArrayList<>();
            for (int i = 0; i < 2; i++) {
                results.add(pool.submit(() -> {
                    together.await(10, TimeUnit.SECONDS);
                    return planner.enqueueAfterConfigurationChange(groupId);
                }));
            }
            int total = 0;
            for (Future<Integer> result : results) {
                total += result.get(30, TimeUnit.SECONDS);      // a lost race must not surface as an exception
            }
            assertThat(total).isEqualTo(1);                      // one of them queued it
        } finally {
            pool.shutdownNow();
        }
        assertThat(queueRepository.findAll()).hasSize(1);
    }

    // ---- SESSION-GROUP-5 review: FOR UPDATE SKIP LOCKED ---------------------------------------------------------------------

    @Test
    void aSlotAnotherRunnerHolds_isSkippedAtOnce_notBuiltTwice_andItsFailureIsNotCounted_thenGeneratedWhenFree() throws Exception {
        Instant start = slotStart();
        Long recurrenceId = savedRecurrence(start);
        Long itemId = queuePending(recurrenceId, LocalDate.ofInstant(start, ZoneOffset.UTC), start);
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        Future<?> holder;
        try {
            // Runner A: holds the slot's row lock inside an open transaction.
            holder = pool.submit(() -> new TransactionTemplate(transactionManager).executeWithoutResult(status -> {
                queueRepository.findByIdForUpdateSkipLocked(itemId).orElseThrow();
                locked.countDown();
                try {
                    release.await(60, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                }
            }));
            assertThat(locked.await(20, TimeUnit.SECONDS)).isTrue();

            // Runner B meanwhile: the slot is skipped at once (this would time out if B waited for the lock), nothing is built,
            // and the failure it would have recorded is left to the runner that holds the slot.
            Future<Integer> other = pool.submit(() -> {
                generator.generate(itemId);
                generator.recordFailure(itemId, "boom");
                return runner.processDue();
            });
            other.get(20, TimeUnit.SECONDS);
            assertThat(regularSessions()).isEmpty();
            assertThat(queueRepository.findById(itemId).orElseThrow().getAttempts()).isZero();
            assertThat(queueRepository.findById(itemId).orElseThrow().getStatus()).isEqualTo(GroupSessionGenerationItem.Status.PENDING);
        } finally {
            release.countDown();
            pool.shutdown();
        }
        holder.get(30, TimeUnit.SECONDS);

        // Free again: the next run generates it, once.
        runner.processDue();
        assertThat(regularSessions()).hasSize(1);
        assertThat(queueRepository.findById(itemId).orElseThrow().getStatus()).isEqualTo(GroupSessionGenerationItem.Status.DONE);
    }

    @Test
    void theDatabaseItself_refusesTwoRegularSessionsForTheSameRecurrenceAndDate() {
        Long recurrenceId = recurrenceRepository.save(GroupSessionRecurrence.builder().groupId(groupId).mode(RecurrenceMode.WEEKLY)
                .dayKey(1).startTime(LocalTime.of(18, 0)).durationMinutes(90).locationId(locationId).draft(false).build()).getId();
        LocalDate day = LocalDate.now(ZoneOffset.UTC).plusDays(3);
        sessionRepository.saveAndFlush(regular(recurrenceId, day, "One"));

        assertThatThrownBy(() -> sessionRepository.saveAndFlush(regular(recurrenceId, day, "Two")))
                .isInstanceOf(DataIntegrityViolationException.class);
        // Custom sessions (no recurrence) and another date are never constrained.
        sessionRepository.saveAndFlush(regular(recurrenceId, day.plusDays(7), "Next week"));
        sessionRepository.saveAndFlush(regular(null, null, "Custom A"));
        sessionRepository.saveAndFlush(regular(null, null, "Custom B"));
        assertThat(sessionRepository.count()).isEqualTo(4);
    }

    private Session regular(Long recurrenceId, LocalDate occurrenceDate, String title) {
        Long postId = postRepository.save(com.sportconnect.social.post.entity.Post.builder().userId(ownerId).groupId(null)
                .postType(com.sportconnect.social.post.api.dto.PostType.SESSION_POST).content("Session: " + title)
                .visibility("private").isActive(true).build()).getId();
        return Session.builder().title(title).groupId(groupId).isPublic(false).postId(postId)
                .sessionType(SessionType.GROUP_RECURRING).createdBy(ownerId).sportId(sportId).locationId(locationId)
                .scheduledStart(Instant.now().plus(Duration.ofDays(2))).scheduledEndAt(Instant.now().plus(Duration.ofDays(2)).plusSeconds(5400))
                .status(SessionStatus.SCHEDULED).capacity(10).feeType(FeeType.FREE).initialSlot(0).gameMood(5)
                .recurrenceId(recurrenceId).occurrenceDate(occurrenceDate).build();
    }
}
