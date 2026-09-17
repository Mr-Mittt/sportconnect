package com.sportconnect.integration;

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

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Real end-to-end coverage for SESSION-27's {@code /upcoming} and {@code /history} endpoints —
 * specifically the parts {@code SessionServiceImplSpec} (which mocks {@code SessionRepository})
 * cannot prove: that the JPQL/native queries themselves return the right rows, in the right order,
 * against a real H2-backed DB round trip. In particular the {@code PREPARING}→{@code SCHEDULED}→
 * {@code ONGOING} tiebreak on a shared {@code scheduledStart}, and the {@code dateCount} native
 * query's {@code GROUP BY}/{@code LIMIT}/{@code before}-cursor paging — same rationale
 * {@code ProcessedMessageRepository.insertIfAbsent}'s own Javadoc gives for why a native query
 * needs a real DB round trip, not a mocked-repository spec, to mean anything.
 *
 * <p>No comment/like path is exercised here, so unlike {@code SessionSystemCommentIntegrationTest}/
 * {@code SessionPostAccessGateIntegrationTest} this extends plain {@link BaseIT} rather than
 * {@link RedisBaseIT} — nothing in {@code getUpcomingSessions}/{@code getSessionHistory(Dates)}
 * touches {@code StringRedisTemplate}. Session fixtures are inserted directly via repositories
 * (a synthetic, merely-unique {@code postId} — no real {@code Post} row is needed since these
 * endpoints never read the session's comment thread), same precedent as those two classes.
 */
class SessionListingIntegrationTest extends BaseIT {

    @Autowired
    private SessionRepository sessionRepository;

    @Autowired
    private SessionParticipantRepository sessionParticipantRepository;

    @Autowired
    private UserRepository userRepository;

    private final AtomicLong postIdSeq = new AtomicLong(1);

    private UUID callerId;

    @BeforeEach
    @Override
    public void baseSetup() {
        super.baseSetup();
        callerId = createUser("caller").getId();
    }

    @AfterEach
    void cleanup() {
        sessionParticipantRepository.deleteAll();
        sessionRepository.deleteAll();
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

    /** locationId/feeType left null for PREPARING, matching SESSION-24's real invariant.
     * SESSION-33: scheduledStart is now Instant — this fixture still takes a wall-clock
     * LocalDateTime for every call site's readability, converting via the JVM's own zone only
     * here at the write. */
    private Long createSession(SessionStatus status, LocalDateTime scheduledStart) {
        Session session = Session.builder()
                .groupId(null)
                .postId(postIdSeq.getAndIncrement())
                .sessionType(SessionType.STANDALONE)
                .createdBy(callerId)
                .sportId(1L)
                .locationId(status == SessionStatus.PREPARING ? null : 1L)
                .scheduledStart(scheduledStart.atZone(ZoneId.systemDefault()).toInstant())
                .status(status)
                .capacity(9999)
                .feeType(status == SessionStatus.PREPARING ? null : FeeType.FREE)
                .initialSlot(0)
                .autoApprove(true)
                .build();
        return sessionRepository.save(session).getId();
    }

    /** Same shape as {@link #createSession}, but group-linked — no FK to a real {@code Group} row
     * since SESSION-11 dropped cross-domain FKs on session tables, so a synthetic id is enough to
     * prove {@code /upcoming}/{@code /history} include a group-linked session exactly like a
     * standalone one (neither endpoint filters on {@code groupId}). */
    private Long createGroupLinkedSession(SessionStatus status, LocalDateTime scheduledStart) {
        Session session = Session.builder()
                .groupId(999L)
                .postId(postIdSeq.getAndIncrement())
                .sessionType(SessionType.GROUP_RECURRING)
                .createdBy(callerId)
                .sportId(1L)
                .locationId(status == SessionStatus.PREPARING ? null : 1L)
                .scheduledStart(scheduledStart.atZone(ZoneId.systemDefault()).toInstant())
                .status(status)
                .capacity(9999)
                .feeType(status == SessionStatus.PREPARING ? null : FeeType.FREE)
                .initialSlot(0)
                .autoApprove(true)
                .build();
        return sessionRepository.save(session).getId();
    }

    private void participate(Long sessionId, ParticipantStatus status) {
        sessionParticipantRepository.save(SessionParticipant.builder()
                .sessionId(sessionId)
                .userId(callerId)
                .status(status)
                .build());
    }

    // ── /upcoming ────────────────────────────────────────────────────────────

    @Test
    void upcoming_ordersScheduledStartAscThenPreparingBeforeScheduledBeforeOngoingOnATie() throws Exception {
        LocalDateTime tiedStart = LocalDateTime.now().plusDays(1).withNano(0);
        Long ongoingId = createSession(SessionStatus.ONGOING, tiedStart);
        Long preparingId = createSession(SessionStatus.PREPARING, tiedStart);
        Long scheduledId = createSession(SessionStatus.SCHEDULED, tiedStart);
        participate(ongoingId, ParticipantStatus.JOINED);
        participate(preparingId, ParticipantStatus.JOINED);
        participate(scheduledId, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/upcoming"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(3))
                .andExpect(jsonPath("$.data.content[0].id").value(preparingId))
                .andExpect(jsonPath("$.data.content[1].id").value(scheduledId))
                .andExpect(jsonPath("$.data.content[2].id").value(ongoingId));
    }

    @Test
    void upcoming_scheduledStartTakesPrecedenceOverTheStatusTiebreakWhenTimesDiffer() throws Exception {
        // The tie test above holds scheduledStart identical across rows, so it can't tell "scheduledStart
        // primary, status secondary" apart from the reverse — a query with the two criteria swapped
        // would pass it too. This is the discriminating case: an earlier ONGOING session (tiebreak
        // rank 2, "last") must still sort before a later PREPARING one (rank 0, "first") once their
        // scheduledStart genuinely differs.
        LocalDateTime earlier = LocalDateTime.now().plusHours(1);
        LocalDateTime later = LocalDateTime.now().plusDays(1);
        Long earlierOngoingId = createSession(SessionStatus.ONGOING, earlier);
        Long laterPreparingId = createSession(SessionStatus.PREPARING, later);
        participate(earlierOngoingId, ParticipantStatus.JOINED);
        participate(laterPreparingId, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/upcoming"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[0].id").value(earlierOngoingId))
                .andExpect(jsonPath("$.data.content[1].id").value(laterPreparingId));
    }

    @Test
    void upcoming_excludesRequestedParticipantAndNonUpcomingSessionStatuses() throws Exception {
        LocalDateTime start = LocalDateTime.now().plusDays(1);
        Long joinedId = createSession(SessionStatus.SCHEDULED, start);
        Long requestedId = createSession(SessionStatus.SCHEDULED, start.plusHours(1));
        Long completedId = createSession(SessionStatus.COMPLETED, start.minusDays(5));
        participate(joinedId, ParticipantStatus.JOINED);
        participate(requestedId, ParticipantStatus.REQUESTED);
        participate(completedId, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/upcoming"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(joinedId));
    }

    @Test
    void upcoming_includesGroupLinkedSessionsAlongsideStandaloneOnes() throws Exception {
        LocalDateTime start = LocalDateTime.now().plusDays(1);
        Long standaloneId = createSession(SessionStatus.SCHEDULED, start);
        Long groupLinkedId = createGroupLinkedSession(SessionStatus.SCHEDULED, start.plusHours(1));
        participate(standaloneId, ParticipantStatus.JOINED);
        participate(groupLinkedId, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/upcoming"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[0].id").value(standaloneId))
                .andExpect(jsonPath("$.data.content[1].id").value(groupLinkedId));
    }

    @Test
    void upcoming_realPaginationSurfacesRowsPastTheFirstPage() throws Exception {
        // Regression coverage for the bug this ticket was filed to fix: the old /mine merge's
        // implicit, unrequested page 0 silently dropped anything past it (a real session, id 45,
        // never appeared). Three sessions, page size 2 — the third must be reachable on page 1.
        LocalDateTime start = LocalDateTime.now().plusDays(1);
        Long firstId = createSession(SessionStatus.SCHEDULED, start);
        Long secondId = createSession(SessionStatus.SCHEDULED, start.plusHours(1));
        Long thirdId = createSession(SessionStatus.SCHEDULED, start.plusHours(2));
        participate(firstId, ParticipantStatus.JOINED);
        participate(secondId, ParticipantStatus.JOINED);
        participate(thirdId, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/upcoming").param("page", "0").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[0].id").value(firstId))
                .andExpect(jsonPath("$.data.content[1].id").value(secondId))
                .andExpect(jsonPath("$.data.totalElements").value(3));

        mockMvc.perform(get("/api/sessions/upcoming").param("page", "1").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(thirdId));
    }

    @Test
    void upcoming_returnsEmptyPageNotErrorWhenCallerHasNoUpcomingSessions() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/upcoming"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(0))
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }

    @Test
    void upcoming_withDateNarrowsToThatCalendarDayOnly() throws Exception {
        LocalDateTime targetDay = LocalDateTime.of(2026, 9, 20, 10, 0);
        Long onDayId = createSession(SessionStatus.SCHEDULED, targetDay);
        Long otherDayId = createSession(SessionStatus.SCHEDULED, targetDay.plusDays(1));
        participate(onDayId, ParticipantStatus.JOINED);
        participate(otherDayId, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/upcoming").param("date", "2026-09-20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(onDayId));
    }

    // ── /history?date ───────────────────────────────────────────────────────

    @Test
    void history_withDateReturnsJoinedOnlyNewestFirstWithinTheDay() throws Exception {
        LocalDateTime day = LocalDateTime.of(2026, 9, 14, 9, 0);
        Long earlierId = createSession(SessionStatus.COMPLETED, day);
        Long laterId = createSession(SessionStatus.CANCELLED, day.plusHours(3));
        Long invitedOnlyId = createSession(SessionStatus.COMPLETED, day.plusHours(1));
        participate(earlierId, ParticipantStatus.JOINED);
        participate(laterId, ParticipantStatus.JOINED);
        participate(invitedOnlyId, ParticipantStatus.INVITED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history").param("date", "2026-09-14"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[0].id").value(laterId))
                .andExpect(jsonPath("$.data.content[1].id").value(earlierId));
    }

    @Test
    void history_includesGroupLinkedSessionsAlongsideStandaloneOnes() throws Exception {
        LocalDateTime day = LocalDateTime.of(2026, 9, 14, 9, 0);
        Long standaloneId = createSession(SessionStatus.COMPLETED, day);
        Long groupLinkedId = createGroupLinkedSession(SessionStatus.CANCELLED, day.plusHours(2));
        participate(standaloneId, ParticipantStatus.JOINED);
        participate(groupLinkedId, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history").param("date", "2026-09-14"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[0].id").value(groupLinkedId))
                .andExpect(jsonPath("$.data.content[1].id").value(standaloneId));
    }

    @Test
    void history_dateRealPaginationSurfacesRowsPastTheFirstPage() throws Exception {
        LocalDateTime day = LocalDateTime.of(2026, 9, 14, 9, 0);
        Long firstId = createSession(SessionStatus.COMPLETED, day);
        Long secondId = createSession(SessionStatus.COMPLETED, day.plusHours(1));
        Long thirdId = createSession(SessionStatus.COMPLETED, day.plusHours(2));
        participate(firstId, ParticipantStatus.JOINED);
        participate(secondId, ParticipantStatus.JOINED);
        participate(thirdId, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        // DESC order: thirdId, secondId, firstId — page size 2 puts firstId alone on page 1.
        mockMvc.perform(get("/api/sessions/history")
                        .param("date", "2026-09-14").param("page", "0").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[0].id").value(thirdId))
                .andExpect(jsonPath("$.data.content[1].id").value(secondId));

        mockMvc.perform(get("/api/sessions/history")
                        .param("date", "2026-09-14").param("page", "1").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(firstId));
    }

    @Test
    void history_withDateReturnsEmptyPageNotErrorWhenNoMatchingSessions() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history").param("date", "2026-09-14"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(0))
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }

    // ── /history?dateCount ──────────────────────────────────────────────────

    @Test
    void history_dateCountReturnsDistinctDatesMostRecentFirstWithCounts() throws Exception {
        Long d1a = createSession(SessionStatus.COMPLETED, LocalDateTime.of(2026, 9, 14, 9, 0));
        Long d1b = createSession(SessionStatus.CANCELLED, LocalDateTime.of(2026, 9, 14, 15, 0));
        Long d2 = createSession(SessionStatus.COMPLETED, LocalDateTime.of(2026, 9, 10, 9, 0));
        participate(d1a, ParticipantStatus.JOINED);
        participate(d1b, ParticipantStatus.JOINED);
        participate(d2, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history").param("dateCount", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dates.length()").value(2))
                .andExpect(jsonPath("$.data.dates[0].date").value("2026-09-14"))
                .andExpect(jsonPath("$.data.dates[0].count").value(2))
                .andExpect(jsonPath("$.data.dates[1].date").value("2026-09-10"))
                .andExpect(jsonPath("$.data.dates[1].count").value(1))
                .andExpect(jsonPath("$.data.hasMore").value(false));
    }

    @Test
    void history_dateCountHasMoreTrueAndBeforeCursorPagesStrictlyOlder() throws Exception {
        Long d1 = createSession(SessionStatus.COMPLETED, LocalDateTime.of(2026, 9, 14, 9, 0));
        Long d2 = createSession(SessionStatus.COMPLETED, LocalDateTime.of(2026, 9, 10, 9, 0));
        Long d3 = createSession(SessionStatus.COMPLETED, LocalDateTime.of(2026, 9, 5, 9, 0));
        participate(d1, ParticipantStatus.JOINED);
        participate(d2, ParticipantStatus.JOINED);
        participate(d3, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history").param("dateCount", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dates.length()").value(2))
                .andExpect(jsonPath("$.data.dates[0].date").value("2026-09-14"))
                .andExpect(jsonPath("$.data.dates[1].date").value("2026-09-10"))
                .andExpect(jsonPath("$.data.hasMore").value(true));

        mockMvc.perform(get("/api/sessions/history").param("dateCount", "2").param("before", "2026-09-10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dates.length()").value(1))
                .andExpect(jsonPath("$.data.dates[0].date").value("2026-09-05"))
                .andExpect(jsonPath("$.data.hasMore").value(false));
    }

    @Test
    void history_dateCountHasMoreFalseWhenExactlyDateCountDatesExist() throws Exception {
        // Off-by-one guard on the "fetch dateCount + 1 rows" pattern: exactly dateCount distinct
        // dates available must report hasMore=false, not true.
        Long d1 = createSession(SessionStatus.COMPLETED, LocalDateTime.of(2026, 9, 14, 9, 0));
        Long d2 = createSession(SessionStatus.COMPLETED, LocalDateTime.of(2026, 9, 10, 9, 0));
        Long d3 = createSession(SessionStatus.COMPLETED, LocalDateTime.of(2026, 9, 5, 9, 0));
        participate(d1, ParticipantStatus.JOINED);
        participate(d2, ParticipantStatus.JOINED);
        participate(d3, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history").param("dateCount", "3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dates.length()").value(3))
                .andExpect(jsonPath("$.data.hasMore").value(false));
    }

    @Test
    void history_dateCountReturnsEmptyNotErrorWhenNoHistoryExists() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history").param("dateCount", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dates.length()").value(0))
                .andExpect(jsonPath("$.data.hasMore").value(false));
    }

    // ── /history param-combination 400s ────────────────────────────────────

    @Test
    void history_rejectsBothDateAndDateCountTogether() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history").param("date", "2026-09-14").param("dateCount", "5"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void history_rejectsNeitherDateNorDateCount() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void history_rejectsBeforeWithoutDateCount() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history").param("date", "2026-09-14").param("before", "2026-09-10"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void history_rejectsNonPositiveDateCount() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history").param("dateCount", "0"))
                .andExpect(status().isBadRequest());
    }
}
