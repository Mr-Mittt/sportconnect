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
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.repository.SessionOutboxEventRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.session.service.SessionGenerationService;
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
import org.springframework.test.web.servlet.ResultActions;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-GROUP-12 through the real pipeline (real Spring wiring, real database, real exception mapping).
 *
 * <ul>
 *   <li>Part C: the group endpoints {@code /today}, {@code /later}, {@code /history/dates} and {@code /history}: the member gate,
 *       the status filter, the overlap rule, the order, the 30-day window with {@code hasMore}, the end date of a session with
 *       no end, and the viewer's zone.</li>
 *   <li>Part A: a group session is on the Upcoming, Requested and History lists only while the caller is a member of the active
 *       group.</li>
 *   <li>Part B: a cancelled session always has an end time.</li>
 * </ul>
 * Times are laid out from the start of today in the viewer's zone, read from the real clock, so a run that crosses midnight
 * in that zone could fail once; it does not need a fixed clock.
 */
class SessionGroupListsIntegrationTest extends RedisBaseIT {

    private static final Integer OWNER_ROLE_ID = 1;
    private static final Integer MEMBER_ROLE_ID = 3;
    private static final String ZONE = "Asia/Ho_Chi_Minh";
    private static final ZoneId ZONE_ID = ZoneId.of(ZONE);

    @Autowired private SessionRepository sessionRepository;
    @Autowired private SessionParticipantRepository participantRepository;
    @Autowired private SessionOutboxEventRepository outboxRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private GroupMemberRepository groupMemberRepository;
    @Autowired private PostRepository postRepository;
    @Autowired private CommentRepository commentRepository;
    @Autowired private SportRepository sportRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private CacheManager cacheManager;
    @Autowired private SessionGenerationService sessionGenerationService;

    private UUID ownerId;
    private UUID memberId;
    private UUID outsiderId;
    private Long sportId;
    private Long groupId;
    private Long otherGroupId;
    /** The start of today in {@link #ZONE}. */
    private Instant todayStart;

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        ownerId = createUserWithRoles(true, "USER");
        memberId = createUserWithRoles(true, "USER");
        outsiderId = createUserWithRoles(true, "USER");
        sportId = sportRepository.save(Sport.builder().name("SESSION-GROUP-12 " + UUID.randomUUID()).isActive(true).build()).getId();
        evictSportCache();
        groupId = groupRepository.save(Group.builder().groupName("SESSION-GROUP-12 " + UUID.randomUUID())
                .createdBy(ownerId).isPrivate(true).isActive(true).sportId(sportId).build()).getId();
        otherGroupId = groupRepository.save(Group.builder().groupName("SESSION-GROUP-12 other " + UUID.randomUUID())
                .createdBy(ownerId).isPrivate(true).isActive(true).sportId(sportId).build()).getId();
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(ownerId).roleId(OWNER_ROLE_ID).build());
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(memberId).roleId(MEMBER_ROLE_ID).build());
        todayStart = LocalDate.now(ZONE_ID).atStartOfDay(ZONE_ID).toInstant();
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
    }

    private void clearAll() {
        // Other test classes share this database and some leave rows that point at sessions: remove them first.
        outboxRepository.deleteAll();
        commentRepository.deleteAll();
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

    private Instant hoursFromTodayStart(long hours) {
        return todayStart.plus(Duration.ofHours(hours));
    }

    /** A session of {@code group} (null = standalone) with an explicit start and end (null end = no duration). */
    private Long seed(Long group, SessionStatus status, Instant start, Instant end, String title) {
        Long postId = postRepository.save(Post.builder().userId(ownerId).groupId(null).postType(PostType.SESSION_POST)
                .content("Session: fixture").visibility("private").isActive(true).build()).getId();
        return sessionRepository.save(Session.builder().title(title)
                .groupId(group).isPublic(group == null).postId(postId)
                .sessionType(group == null ? SessionType.STANDALONE : SessionType.GROUP_RECURRING)
                .createdBy(ownerId).sportId(sportId).locationId(1L)
                .scheduledStart(start).scheduledEndAt(end)
                .status(status).capacity(10).feeType(FeeType.FREE).initialSlot(0).gameMood(5).autoApprove(true)
                .build()).getId();
    }

    private ResultActions listGroup(UUID userId, String path, String query) throws Exception {
        return mockMvc.perform(get("/api/sessions/group/{id}" + path + query, groupId).header("Authorization", bearer(userId)));
    }

    private List<String> titles(ResultActions result) throws Exception {
        JsonNode content = objectMapper.readTree(result.andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
                .get("data").get("content");
        List<String> titles = new ArrayList<>();
        content.forEach(node -> titles.add(node.get("title").asText()));
        return titles;
    }

    private JsonNode data(ResultActions result) throws Exception {
        return objectMapper.readTree(result.andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data");
    }

    private static final String ALL_STATUSES = "status=ONGOING&status=SCHEDULED&status=PREPARING&status=COMPLETED&status=CANCELLED";

    /** Everything that touches today, one of each kind, plus neighbours that must stay out. */
    private void seedAroundToday() {
        seed(groupId, SessionStatus.ONGOING, hoursFromTodayStart(-2), hoursFromTodayStart(3), "yesterday-spans-into-today");
        seed(groupId, SessionStatus.SCHEDULED, hoursFromTodayStart(10), hoursFromTodayStart(11), "today-scheduled");
        seed(groupId, SessionStatus.SCHEDULED, hoursFromTodayStart(22), hoursFromTodayStart(26), "today-spans-into-tomorrow");
        seed(groupId, SessionStatus.PREPARING, hoursFromTodayStart(12), null, "today-preparing");
        seed(groupId, SessionStatus.COMPLETED, hoursFromTodayStart(2), hoursFromTodayStart(3), "today-completed");
        seed(groupId, SessionStatus.COMPLETED, hoursFromTodayStart(-3), hoursFromTodayStart(0), "ended-at-midnight");
        seed(groupId, SessionStatus.CANCELLED, hoursFromTodayStart(5), hoursFromTodayStart(5), "today-cancelled");
        // Not today: ended yesterday, starts exactly at the start of tomorrow, starts later tomorrow.
        seed(groupId, SessionStatus.COMPLETED, hoursFromTodayStart(-5), hoursFromTodayStart(-4), "yesterday-only");
        seed(groupId, SessionStatus.SCHEDULED, hoursFromTodayStart(24), hoursFromTodayStart(25), "tomorrow-at-midnight");
        seed(groupId, SessionStatus.SCHEDULED, hoursFromTodayStart(30), hoursFromTodayStart(31), "tomorrow-later");
        // Never in this group's lists: another group's session and a standalone one.
        seed(otherGroupId, SessionStatus.SCHEDULED, hoursFromTodayStart(10), hoursFromTodayStart(11), "other-group");
        seed(null, SessionStatus.SCHEDULED, hoursFromTodayStart(10), hoursFromTodayStart(11), "standalone");
    }

    // ── part C: /today ───────────────────────────────────────────────────────

    @Test
    void today_returnsEverySessionWhosePlayingTimeOverlapsToday_inTheFixedStatusOrder() throws Exception {
        seedAroundToday();

        assertThat(titles(listGroup(memberId, "/today", "?viewerZoneId=" + ZONE + "&" + ALL_STATUSES))).containsExactly(
                "yesterday-spans-into-today", "today-scheduled", "today-spans-into-tomorrow", "today-preparing",
                "ended-at-midnight", "today-completed", "today-cancelled");
    }

    @Test
    void today_followsTheStatusFilter_andTheCallersOwnSortIsIgnored() throws Exception {
        seedAroundToday();

        assertThat(titles(listGroup(memberId, "/today", "?viewerZoneId=" + ZONE
                + "&status=ONGOING&status=SCHEDULED&status=PREPARING&sort=title,desc")))
                .containsExactly("yesterday-spans-into-today", "today-scheduled", "today-spans-into-tomorrow", "today-preparing");
        // Comma-separated works as well as repeated.
        assertThat(titles(listGroup(memberId, "/today", "?viewerZoneId=" + ZONE + "&status=CANCELLED,COMPLETED")))
                .containsExactly("ended-at-midnight", "today-completed", "today-cancelled");
    }

    @Test
    void today_isReadInTheViewersZone() throws Exception {
        seedAroundToday();
        // The same instants read in a zone 15 hours behind Ho Chi Minh: its "today" is another window.
        ZoneId la = ZoneId.of("America/Los_Angeles");
        Instant laStart = LocalDate.now(la).atStartOfDay(la).toInstant();
        Instant laEnd = LocalDate.now(la).plusDays(1).atStartOfDay(la).toInstant();
        List<String> expected = new ArrayList<>();
        sessionRepository.findAll().stream()
                .filter(s -> groupId.equals(s.getGroupId()))
                .filter(s -> s.getScheduledStart().isBefore(laEnd)
                        && !(s.getScheduledEndAt() == null ? s.getScheduledStart() : s.getScheduledEndAt()).isBefore(laStart))
                .forEach(s -> expected.add(s.getTitle()));

        assertThat(titles(listGroup(memberId, "/today", "?viewerZoneId=America/Los_Angeles&" + ALL_STATUSES)))
                .containsExactlyInAnyOrderElementsOf(expected);
    }

    @Test
    void today_needsStatusAndAZone_andRefusesAnInvalidOne() throws Exception {
        seedAroundToday();

        listGroup(memberId, "/today", "?viewerZoneId=" + ZONE).andExpect(status().isBadRequest());
        listGroup(memberId, "/today", "?" + ALL_STATUSES).andExpect(status().isBadRequest());
        listGroup(memberId, "/today", "?viewerZoneId=Not/AZone&status=ONGOING").andExpect(status().isBadRequest());
        listGroup(memberId, "/today", "?viewerZoneId=" + ZONE + "&status=NEXT").andExpect(status().isBadRequest());
    }

    // ── part C: /later ───────────────────────────────────────────────────────

    @Test
    void later_startsAtTheStartOfTomorrow_soonestFirst_withTheAllowedStatusesOnly() throws Exception {
        seedAroundToday();
        seed(groupId, SessionStatus.CANCELLED, hoursFromTodayStart(50), hoursFromTodayStart(50), "later-cancelled");
        seed(groupId, SessionStatus.PREPARING, hoursFromTodayStart(40), null, "later-preparing");

        assertThat(titles(listGroup(memberId, "/later", "?viewerZoneId=" + ZONE + "&status=PREPARING&status=SCHEDULED")))
                .containsExactly("tomorrow-at-midnight", "tomorrow-later", "later-preparing");
        assertThat(titles(listGroup(memberId, "/later", "?viewerZoneId=" + ZONE + "&status=PREPARING&status=SCHEDULED&status=CANCELLED&sort=title,desc")))
                .containsExactly("tomorrow-at-midnight", "tomorrow-later", "later-preparing", "later-cancelled");
    }

    @Test
    void later_isPaged_andRefusesAStatusItDoesNotServe() throws Exception {
        seedAroundToday();

        assertThat(titles(listGroup(memberId, "/later", "?viewerZoneId=" + ZONE + "&status=SCHEDULED&size=1&page=1")))
                .containsExactly("tomorrow-later");
        listGroup(memberId, "/later", "?viewerZoneId=" + ZONE + "&status=ONGOING").andExpect(status().isBadRequest());
        listGroup(memberId, "/later", "?viewerZoneId=" + ZONE + "&status=COMPLETED").andExpect(status().isBadRequest());
    }

    // ── part C: /history/dates and /history ──────────────────────────────────

    private void seedFinished() {
        seed(groupId, SessionStatus.COMPLETED, hoursFromTodayStart(-24 + 20), hoursFromTodayStart(-2), "yesterday-late");
        seed(groupId, SessionStatus.COMPLETED, hoursFromTodayStart(-24 + 8), hoursFromTodayStart(-24 + 10), "yesterday-early");
        // A cancelled draft: no duration, so its end is its start (what every cancel path now sets).
        seed(groupId, SessionStatus.CANCELLED, hoursFromTodayStart(-3 * 24 + 10), hoursFromTodayStart(-3 * 24 + 10), "cancelled-3d");
        // A completed session with no duration at all: placed by its start.
        seed(groupId, SessionStatus.COMPLETED, hoursFromTodayStart(-5 * 24 + 9), null, "completed-no-end-5d");
        // 31 days ago: outside the first 30-day window.
        seed(groupId, SessionStatus.COMPLETED, hoursFromTodayStart(-31 * 24 + 5), hoursFromTodayStart(-31 * 24 + 6), "completed-31d");
        // Ended today: it is in /today, never in the history.
        seed(groupId, SessionStatus.COMPLETED, hoursFromTodayStart(0), hoursFromTodayStart(1), "completed-today");
        // Edges: ending exactly at the start of today is today's (the history stops at the day before); ending exactly at the
        // first instant of the 30-day window is inside that window.
        seed(groupId, SessionStatus.COMPLETED, hoursFromTodayStart(-1), hoursFromTodayStart(0), "completed-ends-at-midnight");
        seed(groupId, SessionStatus.COMPLETED, hoursFromTodayStart(-30 * 24 - 1), hoursFromTodayStart(-30 * 24), "completed-at-window-start");
    }

    private LocalDate dayOffset(int days) {
        return LocalDate.now(ZONE_ID).plusDays(days);
    }

    @Test
    void historyDates_listsThe30DaysEndingYesterday_byEndDate_withCounts_andSaysThereIsMore() throws Exception {
        seedFinished();

        JsonNode first = data(listGroup(memberId, "/history/dates", "?viewerZoneId=" + ZONE + "&status=COMPLETED"));
        assertThat(first.get("dates")).hasSize(3);
        assertThat(first.get("dates").get(0).get("date").asText()).isEqualTo(dayOffset(-1).toString());
        assertThat(first.get("dates").get(0).get("count").asInt()).isEqualTo(2);
        assertThat(first.get("dates").get(1).get("date").asText()).isEqualTo(dayOffset(-5).toString());
        assertThat(first.get("dates").get(1).get("count").asInt()).isEqualTo(1);
        // The session ending exactly at the window's first instant is in this window, not the next.
        assertThat(first.get("dates").get(2).get("date").asText()).isEqualTo(dayOffset(-30).toString());
        assertThat(first.get("dates").get(2).get("count").asInt()).isEqualTo(1);
        assertThat(first.get("hasMore").asBoolean()).isTrue();
        assertThat(first.get("nextBefore").asText()).isEqualTo(dayOffset(-30).toString());

        // The window before it holds the 31-days-ago session, and nothing is older.
        JsonNode second = data(listGroup(memberId, "/history/dates",
                "?viewerZoneId=" + ZONE + "&status=COMPLETED&before=" + first.get("nextBefore").asText()));
        assertThat(second.get("dates")).hasSize(1);
        assertThat(second.get("dates").get(0).get("date").asText()).isEqualTo(dayOffset(-31).toString());
        assertThat(second.get("hasMore").asBoolean()).isFalse();
    }

    @Test
    void historyDates_countsACancelledDraftOnItsStartDate_whenCancelledIsAsked() throws Exception {
        seedFinished();

        JsonNode both = data(listGroup(memberId, "/history/dates", "?viewerZoneId=" + ZONE + "&status=COMPLETED&status=CANCELLED"));
        List<String> dates = new ArrayList<>();
        both.get("dates").forEach(node -> dates.add(node.get("date").asText()));
        assertThat(dates).containsExactly(dayOffset(-1).toString(), dayOffset(-3).toString(), dayOffset(-5).toString(),
                dayOffset(-30).toString());

        JsonNode onlyCancelled = data(listGroup(memberId, "/history/dates", "?viewerZoneId=" + ZONE + "&status=CANCELLED"));
        assertThat(onlyCancelled.get("dates")).hasSize(1);
        assertThat(onlyCancelled.get("hasMore").asBoolean()).isFalse();
    }

    @Test
    void historyDates_anEmptyWindowWithOlderSessions_isEmptyButHasMore() throws Exception {
        seedFinished();

        JsonNode window = data(listGroup(memberId, "/history/dates",
                "?viewerZoneId=" + ZONE + "&status=COMPLETED&before=" + dayOffset(-10) + "&days=10"));
        assertThat(window.get("dates")).isEmpty();
        assertThat(window.get("hasMore").asBoolean()).isTrue();
        assertThat(window.get("nextBefore").asText()).isEqualTo(dayOffset(-20).toString());
    }

    @Test
    void historyDates_refusesABadStatus_aBadDays_andALaterBeforeIsReadAsToday() throws Exception {
        seedFinished();

        listGroup(memberId, "/history/dates", "?viewerZoneId=" + ZONE + "&status=SCHEDULED").andExpect(status().isBadRequest());
        listGroup(memberId, "/history/dates", "?viewerZoneId=" + ZONE + "&status=COMPLETED&days=0").andExpect(status().isBadRequest());
        JsonNode future = data(listGroup(memberId, "/history/dates",
                "?viewerZoneId=" + ZONE + "&status=COMPLETED&before=" + dayOffset(10)));
        assertThat(future.get("dates")).hasSize(3);
        assertThat(future.get("nextBefore").asText()).isEqualTo(dayOffset(-30).toString());
    }

    @Test
    void history_listsOneEndDate_newestEndFirst_andNeverToday() throws Exception {
        seedFinished();
        String yesterday = dayOffset(-1).toString();

        assertThat(titles(listGroup(memberId, "/history", "?viewerZoneId=" + ZONE + "&status=COMPLETED&date=" + yesterday + "&sort=title,asc")))
                .containsExactly("yesterday-late", "yesterday-early");
        assertThat(titles(listGroup(memberId, "/history", "?viewerZoneId=" + ZONE + "&status=CANCELLED&date=" + dayOffset(-3))))
                .containsExactly("cancelled-3d");
        assertThat(titles(listGroup(memberId, "/history", "?viewerZoneId=" + ZONE + "&status=COMPLETED&date=" + dayOffset(-5))))
                .containsExactly("completed-no-end-5d");
        listGroup(memberId, "/history", "?viewerZoneId=" + ZONE + "&status=COMPLETED&date=" + dayOffset(0)).andExpect(status().isBadRequest());
        listGroup(memberId, "/history", "?viewerZoneId=" + ZONE + "&status=ONGOING&date=" + yesterday).andExpect(status().isBadRequest());
    }

    @Test
    void history_isPaged() throws Exception {
        seedFinished();
        String yesterday = dayOffset(-1).toString();

        assertThat(titles(listGroup(memberId, "/history", "?viewerZoneId=" + ZONE + "&status=COMPLETED&date=" + yesterday + "&size=1&page=1")))
                .containsExactly("yesterday-early");
    }

    // ── part C: the gate, on every endpoint ──────────────────────────────────

    @Test
    void everyGroupListRefusesANonMember_with403_andAMissingGroupAnswersTheSame() throws Exception {
        seedAroundToday();
        String zone = "viewerZoneId=" + ZONE;

        for (String path : List.of("/today?" + zone + "&status=ONGOING", "/later?" + zone + "&status=SCHEDULED",
                "/history/dates?" + zone + "&status=COMPLETED", "/history?" + zone + "&status=COMPLETED&date=" + dayOffset(-1))) {
            mockMvc.perform(get("/api/sessions/group/{id}" + path, groupId).header("Authorization", bearer(outsiderId)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_MEMBER_REQUIRED"));
            mockMvc.perform(get("/api/sessions/group/{id}" + path, 999_999L).header("Authorization", bearer(memberId)))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_MEMBER_REQUIRED"));
        }
        // The gate comes before the service's own validation: a non-member learns nothing from a 400 about the zone.
        listGroup(outsiderId, "/today", "?viewerZoneId=Not/AZone&status=ONGOING").andExpect(status().isForbidden());
    }

    @Test
    void theBucketParameterIsGone_thePlainListKeepsEveryStatusOfThisGroupOnly() throws Exception {
        seedAroundToday();

        // The plain list ignores the old parameter.
        assertThat(titles(listGroup(memberId, "", "?bucket=HISTORY"))).hasSize(10);
        assertThat(titles(listGroup(memberId, "", ""))).doesNotContain("other-group", "standalone").hasSize(10);
    }

    // ── part A: the caller's own lists hide a group they have left ───────────

    /** The caller leaves the group: their membership row goes, their participant rows are left as they are. */
    private void leaveGroup(UUID userId) {
        groupMemberRepository.delete(groupMemberRepository.findByGroupIdAndUserId(groupId, userId).orElseThrow());
    }

    private Long joined(Long sessionId, UUID userId, ParticipantStatus status) {
        return participantRepository.save(SessionParticipant.builder().sessionId(sessionId).userId(userId).status(status).build()).getId();
    }

    private List<String> mine(UUID userId, String path) throws Exception {
        return titles(mockMvc.perform(get(path).header("Authorization", bearer(userId))));
    }

    @Test
    void upcomingAndRequested_showAGroupSessionOnlyWhileTheCallerIsAMemberOfTheActiveGroup() throws Exception {
        Long groupSession = seed(groupId, SessionStatus.SCHEDULED, hoursFromTodayStart(30), hoursFromTodayStart(31), "group-upcoming");
        Long requested = seed(groupId, SessionStatus.SCHEDULED, hoursFromTodayStart(32), hoursFromTodayStart(33), "group-requested");
        Long standalone = seed(null, SessionStatus.SCHEDULED, hoursFromTodayStart(34), hoursFromTodayStart(35), "standalone-upcoming");
        joined(groupSession, memberId, ParticipantStatus.JOINED);
        joined(requested, memberId, ParticipantStatus.REQUESTED);
        joined(standalone, memberId, ParticipantStatus.JOINED);

        assertThat(mine(memberId, "/api/sessions/upcoming")).containsExactly("group-upcoming", "standalone-upcoming");
        assertThat(mine(memberId, "/api/sessions/requested")).containsExactly("group-requested");

        // Leaving the group leaves the participant rows alone: the lists must still stop showing the group's sessions.
        leaveGroup(memberId);
        assertThat(participantRepository.findAll()).hasSize(3);
        assertThat(mine(memberId, "/api/sessions/upcoming")).containsExactly("standalone-upcoming");
        assertThat(mine(memberId, "/api/sessions/requested")).isEmpty();

        // Rejoining brings them back (nothing was deleted).
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(memberId).roleId(MEMBER_ROLE_ID).build());
        assertThat(mine(memberId, "/api/sessions/upcoming")).containsExactly("group-upcoming", "standalone-upcoming");
        assertThat(mine(memberId, "/api/sessions/requested")).containsExactly("group-requested");

        // A deleted (inactive) group takes its sessions off too, whatever the membership rows say.
        Group group = groupRepository.findById(groupId).orElseThrow();
        group.setIsActive(false);
        groupRepository.save(group);
        assertThat(mine(memberId, "/api/sessions/upcoming")).containsExactly("standalone-upcoming");
    }

    @Test
    void upcomingByDate_alsoHidesTheGroupSessionsOfAGroupTheCallerLeft() throws Exception {
        LocalDate day = dayOffset(2);
        Instant start = day.atTime(10, 0).atZone(ZONE_ID).toInstant();
        joined(seed(groupId, SessionStatus.SCHEDULED, start, start.plusSeconds(3600), "group-that-day"), memberId, ParticipantStatus.JOINED);
        joined(seed(null, SessionStatus.SCHEDULED, start, start.plusSeconds(3600), "standalone-that-day"), memberId, ParticipantStatus.JOINED);
        String path = "/api/sessions/upcoming?date=" + day + "&viewerZoneId=" + ZONE;

        assertThat(mine(memberId, path)).containsExactlyInAnyOrder("group-that-day", "standalone-that-day");
        leaveGroup(memberId);
        assertThat(mine(memberId, path)).containsExactly("standalone-that-day");
    }

    @Test
    void history_andItsDateCounts_hideTheGroupSessionsOfAGroupTheCallerLeft() throws Exception {
        LocalDate day = dayOffset(-2);
        Instant start = day.atTime(10, 0).atZone(ZONE_ID).toInstant();
        joined(seed(groupId, SessionStatus.COMPLETED, start, start.plusSeconds(3600), "group-done"), memberId, ParticipantStatus.JOINED);
        joined(seed(null, SessionStatus.COMPLETED, start, start.plusSeconds(3600), "standalone-done"), memberId, ParticipantStatus.JOINED);
        String list = "/api/sessions/history?sportId=" + sportId + "&date=" + day + "&viewerZoneId=" + ZONE;
        String dates = "/api/sessions/history?sportId=" + sportId + "&dateCount=10&viewerZoneId=" + ZONE;

        assertThat(mine(memberId, list)).containsExactlyInAnyOrder("group-done", "standalone-done");
        assertThat(data(mockMvc.perform(get(dates).header("Authorization", bearer(memberId)))).get("dates").get(0).get("count").asInt()).isEqualTo(2);

        leaveGroup(memberId);
        assertThat(mine(memberId, list)).containsExactly("standalone-done");
        assertThat(data(mockMvc.perform(get(dates).header("Authorization", bearer(memberId)))).get("dates").get(0).get("count").asInt()).isEqualTo(1);
    }

    @Test
    void aCallerInNoGroupStillSeesTheirStandaloneSessions() throws Exception {
        joined(seed(null, SessionStatus.SCHEDULED, hoursFromTodayStart(30), hoursFromTodayStart(31), "standalone-only"), outsiderId, ParticipantStatus.JOINED);

        assertThat(mine(outsiderId, "/api/sessions/upcoming")).containsExactly("standalone-only");
    }

    // ── part B: a cancelled session always has an end time ───────────────────

    @Test
    void cancelling_aSessionWithNoDuration_setsItsEndToItsStart_andKeepsAnEndItHas() throws Exception {
        Instant start = hoursFromTodayStart(40);
        Long noEnd = seed(groupId, SessionStatus.PREPARING, start, null, "draft");
        Long withEnd = seed(groupId, SessionStatus.SCHEDULED, start, start.plusSeconds(5400), "scheduled");

        mockMvc.perform(post("/api/sessions/{id}/cancel", noEnd).header("Authorization", bearer(ownerId))
                .contentType("application/json").content("{}")).andExpect(status().isOk());
        mockMvc.perform(post("/api/sessions/{id}/cancel", withEnd).header("Authorization", bearer(ownerId))
                .contentType("application/json").content("{}")).andExpect(status().isOk());

        assertThat(sessionRepository.findById(noEnd).orElseThrow().getScheduledEndAt()).isEqualTo(start);
        assertThat(sessionRepository.findById(withEnd).orElseThrow().getScheduledEndAt()).isEqualTo(start.plusSeconds(5400));
    }

    @Test
    void theAutomaticCancelOfAnUnpreparedDraft_setsItsEndToItsStart() {
        Instant start = Instant.now().minus(Duration.ofHours(2)).truncatedTo(ChronoUnit.MILLIS);
        Long draft = seed(groupId, SessionStatus.PREPARING, start, null, "unprepared");

        sessionGenerationService.cancelUnpreparedSessions();

        Session cancelled = sessionRepository.findById(draft).orElseThrow();
        assertThat(cancelled.getStatus()).isEqualTo(SessionStatus.CANCELLED);
        assertThat(cancelled.getScheduledEndAt()).isEqualTo(start);
    }

    @Test
    void aCancelledDraftIsPlacedInTheHistoryByItsStartDate() throws Exception {
        Instant start = hoursFromTodayStart(-2 * 24 + 10);
        Long draft = seed(groupId, SessionStatus.PREPARING, start, null, "old-draft");

        sessionGenerationService.cancelUnpreparedSessions();

        assertThat(titles(listGroup(memberId, "/history", "?viewerZoneId=" + ZONE + "&status=CANCELLED&date=" + dayOffset(-2))))
                .containsExactly("old-draft");
        assertThat(sessionRepository.findById(draft).orElseThrow().getScheduledEndAt()).isEqualTo(start);
    }
}
