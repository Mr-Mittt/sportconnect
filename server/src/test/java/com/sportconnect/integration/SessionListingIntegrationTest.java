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

import java.time.Instant;
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
                .isPublic(true)
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

    /** SESSION-34 — same shape as {@link #createSession}, but takes a precomputed {@link Instant}
     * directly (not a wall-clock {@link LocalDateTime} converted via the JVM's own zone) so
     * dateCount zone tests can control exactly which UTC instant — and therefore which calendar
     * date under a given {@code viewerZoneId} — a session lands on, independent of whatever zone
     * this test JVM happens to run in. */
    private Long createSessionAtInstant(SessionStatus status, Instant scheduledStart) {
        Session session = Session.builder()
                .groupId(null)
                .isPublic(true)
                .postId(postIdSeq.getAndIncrement())
                .sessionType(SessionType.STANDALONE)
                .createdBy(callerId)
                .sportId(1L)
                .locationId(status == SessionStatus.PREPARING ? null : 1L)
                .scheduledStart(scheduledStart)
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
                .isPublic(false)
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

    // ── /upcoming?date + viewerZoneId (SESSION-35) ─────────────────────────

    @Test
    void upcoming_dateBucketsByUtcWhenViewerZoneIdOmitted() throws Exception {
        Instant scheduledStart = Instant.parse("2026-09-20T05:00:00Z");
        Long sessionId = createSessionAtInstant(SessionStatus.SCHEDULED, scheduledStart);
        participate(sessionId, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/upcoming").param("date", "2026-09-20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(sessionId));
    }

    @Test
    void upcoming_dateWithViewerZoneIdNarrowsToThatCalendarDayInTheGivenZone() throws Exception {
        // 2026-09-20 05:00 UTC is 2026-09-19 22:00 in Los Angeles (PDT, UTC-7).
        Instant scheduledStart = Instant.parse("2026-09-20T05:00:00Z");
        Long sessionId = createSessionAtInstant(SessionStatus.SCHEDULED, scheduledStart);
        participate(sessionId, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/upcoming")
                        .param("date", "2026-09-19")
                        .param("viewerZoneId", "America/Los_Angeles"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(sessionId));
        mockMvc.perform(get("/api/sessions/upcoming").param("date", "2026-09-19"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(0));
    }

    @Test
    void upcoming_dateRejectsAnInvalidViewerZoneId() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/upcoming")
                        .param("date", "2026-09-20")
                        .param("viewerZoneId", "Not/AZone"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void upcoming_rejectsViewerZoneIdWithoutDate() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/upcoming").param("viewerZoneId", "America/Los_Angeles"))
                .andExpect(status().isBadRequest());
    }

    // ── /requested (SESSION-42) ─────────────────────────────────────────────

    @Test
    void requested_includesPreparingScheduledOngoingButExcludesCancelledAndCompleted() throws Exception {
        LocalDateTime start = LocalDateTime.now().plusDays(1);
        Long preparingId = createSession(SessionStatus.PREPARING, start);
        Long scheduledId = createSession(SessionStatus.SCHEDULED, start.plusHours(1));
        Long ongoingId = createSession(SessionStatus.ONGOING, start.plusHours(2));
        Long completedId = createSession(SessionStatus.COMPLETED, start.minusDays(5));
        Long cancelledId = createSession(SessionStatus.CANCELLED, start.plusHours(3));
        participate(preparingId, ParticipantStatus.REQUESTED);
        participate(scheduledId, ParticipantStatus.REQUESTED);
        participate(ongoingId, ParticipantStatus.REQUESTED);
        participate(completedId, ParticipantStatus.REQUESTED);
        participate(cancelledId, ParticipantStatus.REQUESTED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/requested"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(3))
                .andExpect(jsonPath("$.data.content[0].id").value(preparingId))
                .andExpect(jsonPath("$.data.content[1].id").value(scheduledId))
                .andExpect(jsonPath("$.data.content[2].id").value(ongoingId));
    }

    /** A REQUESTED row surviving into ONGOING/CANCELLED/COMPLETED is a real, accepted gap
     * (SESSION-42's own ticket doc) — this test exists to prove {@code /requested} itself behaves
     * as designed (non-terminal only), not that the underlying gap is closed. */
    @Test
    void requested_excludesJoinedAndInvitedParticipantRows() throws Exception {
        LocalDateTime start = LocalDateTime.now().plusDays(1);
        Long requestedId = createSession(SessionStatus.SCHEDULED, start);
        Long joinedId = createSession(SessionStatus.SCHEDULED, start.plusHours(1));
        Long invitedId = createSession(SessionStatus.SCHEDULED, start.plusHours(2));
        participate(requestedId, ParticipantStatus.REQUESTED);
        participate(joinedId, ParticipantStatus.JOINED);
        participate(invitedId, ParticipantStatus.INVITED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/requested"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(requestedId));
    }

    @Test
    void requested_includesGroupLinkedSessionsAlongsideStandaloneOnes() throws Exception {
        LocalDateTime start = LocalDateTime.now().plusDays(1);
        Long standaloneId = createSession(SessionStatus.SCHEDULED, start);
        Long groupLinkedId = createGroupLinkedSession(SessionStatus.SCHEDULED, start.plusHours(1));
        participate(standaloneId, ParticipantStatus.REQUESTED);
        participate(groupLinkedId, ParticipantStatus.REQUESTED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/requested"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[0].id").value(standaloneId))
                .andExpect(jsonPath("$.data.content[1].id").value(groupLinkedId));
    }

    @Test
    void requested_doesNotLeakAnotherUsersRequestedRow() throws Exception {
        UUID otherUserId = createUser("d42other").getId();
        LocalDateTime start = LocalDateTime.now().plusDays(1);
        Long sessionId = createSession(SessionStatus.SCHEDULED, start);
        sessionParticipantRepository.save(SessionParticipant.builder()
                .sessionId(sessionId)
                .userId(otherUserId)
                .status(ParticipantStatus.REQUESTED)
                .build());

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/requested"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(0));
    }

    @Test
    void requested_realPaginationSurfacesRowsPastTheFirstPage() throws Exception {
        LocalDateTime start = LocalDateTime.now().plusDays(1);
        Long firstId = createSession(SessionStatus.SCHEDULED, start);
        Long secondId = createSession(SessionStatus.SCHEDULED, start.plusHours(1));
        Long thirdId = createSession(SessionStatus.SCHEDULED, start.plusHours(2));
        participate(firstId, ParticipantStatus.REQUESTED);
        participate(secondId, ParticipantStatus.REQUESTED);
        participate(thirdId, ParticipantStatus.REQUESTED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/requested").param("page", "0").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[0].id").value(firstId))
                .andExpect(jsonPath("$.data.content[1].id").value(secondId))
                .andExpect(jsonPath("$.data.totalElements").value(3));

        mockMvc.perform(get("/api/sessions/requested").param("page", "1").param("size", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(thirdId));
    }

    @Test
    void requested_returnsEmptyPageNotErrorWhenCallerHasNoRequestedSessions() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/requested"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(0))
                .andExpect(jsonPath("$.data.totalElements").value(0));
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
    void history_dateCountBucketsByUtcWhenViewerZoneIdOmitted() throws Exception {
        // 23:30 UTC bucketed under any positive-offset zone (e.g. the server's own ambient zone)
        // would roll onto the 15th — omitting viewerZoneId must bucket by plain UTC, not by
        // whatever zone this test JVM happens to be running in.
        Long sessionId = createSessionAtInstant(SessionStatus.COMPLETED, Instant.parse("2026-09-14T23:30:00Z"));
        participate(sessionId, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history").param("dateCount", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dates.length()").value(1))
                .andExpect(jsonPath("$.data.dates[0].date").value("2026-09-14"))
                .andExpect(jsonPath("$.data.dates[0].count").value(1));
    }

    @Test
    void history_dateCountBucketsByViewerZoneIdWhenProvided() throws Exception {
        // 2026-09-15 05:00 UTC is 2026-09-14 22:00 in Los Angeles (PDT, UTC-7) — the same session
        // must bucket onto a different calendar date depending on whether viewerZoneId is given.
        Instant scheduledStart = Instant.parse("2026-09-15T05:00:00Z");
        Long sessionId = createSessionAtInstant(SessionStatus.COMPLETED, scheduledStart);
        participate(sessionId, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history").param("dateCount", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dates[0].date").value("2026-09-15"));
        mockMvc.perform(get("/api/sessions/history")
                        .param("dateCount", "5")
                        .param("viewerZoneId", "America/Los_Angeles"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dates.length()").value(1))
                .andExpect(jsonPath("$.data.dates[0].date").value("2026-09-14"));
    }

    @Test
    void history_dateCountMergesSessionsAcrossUtcDayBoundaryUnderTheSameViewerZone() throws Exception {
        // Two sessions on different UTC calendar dates (14th and 15th) both fall on LA's 14th —
        // proves GROUP BY 1 actually re-aggregates rows whose bucket changed, not just passes a
        // single row through unchanged.
        Long sessionA = createSessionAtInstant(SessionStatus.COMPLETED, Instant.parse("2026-09-14T23:00:00Z"));
        Long sessionB = createSessionAtInstant(SessionStatus.CANCELLED, Instant.parse("2026-09-15T01:00:00Z"));
        participate(sessionA, ParticipantStatus.JOINED);
        participate(sessionB, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history").param("dateCount", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dates.length()").value(2))
                .andExpect(jsonPath("$.data.dates[0].date").value("2026-09-15"))
                .andExpect(jsonPath("$.data.dates[1].date").value("2026-09-14"));
        mockMvc.perform(get("/api/sessions/history")
                        .param("dateCount", "5")
                        .param("viewerZoneId", "America/Los_Angeles"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dates.length()").value(1))
                .andExpect(jsonPath("$.data.dates[0].date").value("2026-09-14"))
                .andExpect(jsonPath("$.data.dates[0].count").value(2));
    }

    @Test
    void history_dateCountBeforeCursorRespectsViewerZoneId() throws Exception {
        // Both sessions are constructed so their LA-local date is the 10th/14th respectively, even
        // though their raw UTC instants land on different (later) calendar days — the before cursor
        // must compare using the same viewerZoneId-shifted date, not the raw UTC one.
        Long older = createSessionAtInstant(SessionStatus.COMPLETED, Instant.parse("2026-09-10T06:00:00Z"));
        Long newer = createSessionAtInstant(SessionStatus.COMPLETED, Instant.parse("2026-09-15T05:00:00Z"));
        participate(older, ParticipantStatus.JOINED);
        participate(newer, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history")
                        .param("dateCount", "5")
                        .param("viewerZoneId", "America/Los_Angeles"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dates.length()").value(2))
                .andExpect(jsonPath("$.data.dates[0].date").value("2026-09-14"))
                .andExpect(jsonPath("$.data.dates[1].date").value("2026-09-09"));
        mockMvc.perform(get("/api/sessions/history")
                        .param("dateCount", "5")
                        .param("before", "2026-09-14")
                        .param("viewerZoneId", "America/Los_Angeles"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dates.length()").value(1))
                .andExpect(jsonPath("$.data.dates[0].date").value("2026-09-09"));
    }

    @Test
    void history_dateCountRespectsDstTransitionInViewerZoneId() throws Exception {
        // 2026-11-01 09:00 UTC is the exact moment America/Los_Angeles falls back from PDT (UTC-7)
        // to PST (UTC-8) (1st Sunday of November). Just before it (still PDT), 07:15 UTC is
        // 2026-11-01 00:15 local — genuinely DST-aware conversion required, since naively applying
        // the day's *other* offset (PST, UTC-8) instead would misbucket this onto 2026-10-31.
        Long sessionId = createSessionAtInstant(SessionStatus.COMPLETED, Instant.parse("2026-11-01T07:15:00Z"));
        participate(sessionId, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history")
                        .param("dateCount", "5")
                        .param("viewerZoneId", "America/Los_Angeles"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dates.length()").value(1))
                .andExpect(jsonPath("$.data.dates[0].date").value("2026-11-01"));
    }

    @Test
    void history_dateCountIncludesGroupLinkedSessionsAlongsideStandaloneOnes() throws Exception {
        LocalDateTime day = LocalDateTime.of(2026, 9, 14, 9, 0);
        Long standaloneId = createSession(SessionStatus.COMPLETED, day);
        Long groupLinkedId = createGroupLinkedSession(SessionStatus.CANCELLED, day.plusHours(2));
        participate(standaloneId, ParticipantStatus.JOINED);
        participate(groupLinkedId, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history").param("dateCount", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.dates.length()").value(1))
                .andExpect(jsonPath("$.data.dates[0].date").value("2026-09-14"))
                .andExpect(jsonPath("$.data.dates[0].count").value(2));
    }

    @Test
    void history_dateCountRejectsInvalidViewerZoneId() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history")
                        .param("dateCount", "5")
                        .param("viewerZoneId", "Not/AZone"))
                .andExpect(status().isBadRequest());
    }

    // ── /history?date + viewerZoneId (SESSION-35) ──────────────────────────

    @Test
    void history_dateBucketsByUtcWhenViewerZoneIdOmitted() throws Exception {
        // 2026-09-15 05:00 UTC falls outside the 2026-09-15 [dayStart, dayEnd) range if bucketed by
        // any positive-offset zone — omitting viewerZoneId must use plain UTC, not the JVM's zone.
        Long sessionId = createSessionAtInstant(SessionStatus.COMPLETED, Instant.parse("2026-09-15T05:00:00Z"));
        participate(sessionId, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history").param("date", "2026-09-15"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(sessionId));
    }

    @Test
    void history_dateWithViewerZoneIdNarrowsToThatCalendarDayInTheGivenZone() throws Exception {
        // 2026-09-15 05:00 UTC is 2026-09-14 22:00 in Los Angeles (PDT, UTC-7) — date=2026-09-15
        // matches it only when evaluated in UTC (the default), not when evaluated in LA's zone.
        Instant scheduledStart = Instant.parse("2026-09-15T05:00:00Z");
        Long sessionId = createSessionAtInstant(SessionStatus.COMPLETED, scheduledStart);
        participate(sessionId, ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history")
                        .param("date", "2026-09-14")
                        .param("viewerZoneId", "America/Los_Angeles"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(sessionId));
        mockMvc.perform(get("/api/sessions/history")
                        .param("date", "2026-09-14"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(0));
    }

    @Test
    void history_dateRejectsAnInvalidViewerZoneId() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/history")
                        .param("date", "2026-09-14")
                        .param("viewerZoneId", "Not/AZone"))
                .andExpect(status().isBadRequest());
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
