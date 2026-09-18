package com.sportconnect.integration;

import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.entity.UserSportProfile;
import com.sportconnect.sport.repository.SportRepository;
import com.sportconnect.sport.repository.UserSportProfileRepository;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Real end-to-end coverage for SESSION-25's {@code GET /api/sessions/discover} — specifically the
 * part {@code SessionServiceImplSpec} (which mocks {@code SessionRepository}) cannot prove: that
 * {@code findDiscoverSessions}'s JPQL — every {@code (:param IS NULL OR ...)} optional filter, the
 * {@code openSlots} correlated-subquery result variable referenced from {@code ORDER BY}, and the
 * {@code CAST(... AS date/time)} date/time-of-day filters — actually executes and returns the right
 * rows, in the right order, against a real DB round trip. Added after Phase 5 live verification
 * against real Postgres caught a bug (a bare {@code :param IS NULL} failing Postgres's parameter-type
 * inference) that neither the mocked Spock specs nor a green {@code :server:test} run could have
 * caught — this class is the permanent regression guard for the query logic itself. It does
 * <strong>not</strong> reproduce the Postgres-specific parameter-typing class of bug (H2's parameter
 * binding doesn't share Postgres's extended-protocol type-inference quirk) — that risk is only ever
 * caught by testing against real Postgres, which is what Phase 5 did manually; see
 * {@code session-impl/CLAUDE.md}'s Gotchas bullet.
 *
 * <p>Discover requires the caller to hold an active {@code UserSportProfile} for an active
 * {@code Sport} ({@code UserSportProfileServiceImpl.getUserProfiles} filters out any profile whose
 * sport isn't currently active, cache-backed via {@code SportLookupCache}) — unlike
 * {@code SessionListingIntegrationTest}'s {@code /upcoming}/{@code /history} (purely
 * participant-scoped, no sport gating), so this class needs the same {@code Sport}/
 * {@code UserSportProfile} fixture + cache-eviction dance as {@code SportActiveGateIntegrationTest}.
 *
 * <p><b>SESSION-35 (2026-09-18 scope addition): {@code date} is now a required param</b> on this
 * endpoint. Every test below that doesn't care about date/time filtering specifically passes
 * {@link #DEFAULT_DATE} (the calendar date {@link #sessionBuilder}'s default {@code scheduledStart}
 * falls on) plus {@code viewerZoneId=}{@link #JVM_ZONE}, so the required param doesn't accidentally
 * exclude its own fixtures. This replaced the old implicit {@code scheduledStart >= now()} default
 * that applied when a caller omitted both {@code date} and {@code startTimeFilter} — that case can
 * no longer happen, so the tests that specifically covered it were removed or rewritten (see
 * {@code date_isRequiredRejectsBeingOmitted} and the {@code startTimeFilter} section below).
 */
class SessionDiscoverIntegrationTest extends BaseIT {

    @Autowired
    private SessionRepository sessionRepository;

    @Autowired
    private SessionParticipantRepository sessionParticipantRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SportRepository sportRepository;

    @Autowired
    private UserSportProfileRepository profileRepository;

    @Autowired
    private CacheManager cacheManager;

    private final AtomicLong postIdSeq = new AtomicLong(1);

    private UUID callerId;
    private UUID creatorId;
    private Long sportId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();

        callerId = createUser("d25caller").getId();
        creatorId = createUser("d25creator").getId();

        sportId = sportRepository.save(Sport.builder()
                .name("SESSION-25 Badminton " + UUID.randomUUID())
                .isActive(true)
                .build()).getId();
        evictSportCache();

        profileRepository.save(UserSportProfile.builder()
                .userId(callerId)
                .sportId(sportId)
                .skillLevel("Intermediate")
                .isActive(true)
                .build());
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
        evictSportCache();
    }

    private void clearAll() {
        sessionParticipantRepository.deleteAll();
        sessionRepository.deleteAll();
        profileRepository.deleteAll();
        sportRepository.deleteAll();
        userRepository.deleteAll();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
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

    /** Every field defaultable/overridable via the fluent setters below — created by
     * {@code creatorId} on {@code sportId} by default, matching what {@code callerId}'s
     * profile/discover call is scoped to. */
    private Session.SessionBuilder sessionBuilder() {
        return Session.builder()
                .groupId(null)
                .postId(postIdSeq.getAndIncrement())
                .sessionType(SessionType.STANDALONE)
                .createdBy(creatorId)
                .sportId(sportId)
                .locationId(1L)
                .scheduledStart(instant(LocalDateTime.now().plusDays(1)))
                .status(SessionStatus.SCHEDULED)
                .capacity(10)
                .feeType(FeeType.FREE)
                .initialSlot(0)
                .autoApprove(true);
    }

    private Long save(Session.SessionBuilder builder) {
        return sessionRepository.save(builder.build()).getId();
    }

    /** SESSION-33: scheduledStart is now Instant — this fixture still builds wall-clock values
     * via LocalDateTime for readability (.withHour/.withMinute chains, .toLocalDate() for the
     * date param), converting only at the point of setting the entity field. Uses the JVM's own
     * zone; SESSION-35: a test whose date/startTimeFilter assertion depends on this zone must pass
     * {@code viewerZoneId=ZoneId.systemDefault().getId()} explicitly (see JVM_ZONE below) — the
     * endpoint itself defaults to UTC when viewerZoneId is omitted, not the JVM's zone. */
    private static Instant instant(LocalDateTime localDateTime) {
        return localDateTime.atZone(ZoneId.systemDefault()).toInstant();
    }

    /** SESSION-35: the zone {@link #instant} builds fixture wall-clock values in — pass as
     * {@code viewerZoneId} on any request whose date/startTimeFilter assertion depends on that
     * same wall-clock reading, since the endpoint itself defaults to UTC, not the JVM's zone. */
    private static final String JVM_ZONE = ZoneId.systemDefault().getId();

    /** SESSION-35: the calendar date (in {@link #JVM_ZONE}) {@link #sessionBuilder}'s default
     * {@code scheduledStart} (now + 1 day) falls on — pass as {@code date} alongside
     * {@code viewerZoneId=}{@link #JVM_ZONE} on any request whose fixtures rely on that default
     * and aren't otherwise testing date/time filtering, now that {@code date} is required. */
    private static final LocalDate DEFAULT_DATE = LocalDate.now().plusDays(1);

    private void participate(Long sessionId, UUID userId, ParticipantStatus status) {
        sessionParticipantRepository.save(SessionParticipant.builder()
                .sessionId(sessionId)
                .userId(userId)
                .status(status)
                .build());
    }

    // ── Baseline / exclusion preconditions ─────────────────────────────────

    @Test
    void baseline_excludesCallerCreatedAndAlreadyJoinedSessions() throws Exception {
        Long othersId = save(sessionBuilder());
        save(sessionBuilder().createdBy(callerId));
        Long alreadyJoinedId = save(sessionBuilder());
        participate(alreadyJoinedId, callerId, ParticipantStatus.JOINED);
        Long previouslyLeftId = save(sessionBuilder());
        participate(previouslyLeftId, callerId, ParticipantStatus.LEFT);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[*].id").value(containsInAnyOrder(
                        othersId.intValue(), previouslyLeftId.intValue())));
    }

    @Test
    void baseline_excludesSessionsOutsideTheCallersActiveSports() throws Exception {
        Long otherSportId = sportRepository.save(Sport.builder()
                .name("SESSION-25 Tennis " + UUID.randomUUID()).isActive(true).build()).getId();
        evictSportCache();
        save(sessionBuilder().sportId(otherSportId));
        Long matchingId = save(sessionBuilder());

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(matchingId));
    }

    // ── date required + default status list ─────────────────────────────────

    @Test
    void date_isRequiredRejectsBeingOmitted() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void defaultStatuses_includesPreparingScheduledOngoingOnlyExcludingCancelledAndCompleted() throws Exception {
        Long preparingId = save(sessionBuilder().status(SessionStatus.PREPARING).locationId(null).feeType(null));
        Long scheduledId = save(sessionBuilder().status(SessionStatus.SCHEDULED));
        Long ongoingId = save(sessionBuilder().status(SessionStatus.ONGOING));
        save(sessionBuilder().status(SessionStatus.CANCELLED));
        save(sessionBuilder().status(SessionStatus.COMPLETED));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(3))
                .andExpect(jsonPath("$.data.content[*].id").value(containsInAnyOrder(
                        preparingId.intValue(), scheduledId.intValue(), ongoingId.intValue())));
    }

    @Test
    void status_explicitListOverridesTheDefaultAndNarrowsToOnlyThoseValues() throws Exception {
        Long scheduledId = save(sessionBuilder().status(SessionStatus.SCHEDULED));
        save(sessionBuilder().status(SessionStatus.ONGOING));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE)
                        .param("status", "SCHEDULED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(scheduledId));
    }

    @Test
    void status_rejectsAValueOutsidePreparingScheduledOngoing() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString())
                        .param("status", "CANCELLED"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void dateFilter_aPastDateStillMatchesNoHiddenNowFloor() throws Exception {
        LocalDateTime pastDay = LocalDateTime.now().minusDays(10).withHour(10).withMinute(0);
        Long pastId = save(sessionBuilder().scheduledStart(instant(pastDay)));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", pastDay.toLocalDate().toString())
                        .param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(pastId));
    }

    /** Regression coverage for a real bug this class caught: {@code date} used to be implemented
     * as {@code CAST(s.scheduledStart AS date) = :date}, which silently read the wrong calendar
     * day for a session scheduled in the first few hours of the local day — see
     * {@code SessionRepository.findDiscoverSessions}' Javadoc. Fixed by switching to a half-open
     * {@code [dayStart, dayEnd)} range against the plain {@code scheduledStart} path expression.
     * This test uses an early-morning time specifically because that's the exact case that broke —
     * a late-morning/afternoon time (as the other date tests use) doesn't cross the day boundary
     * this bug depends on. */
    @Test
    void dateFilter_matchesAnEarlyMorningSessionOnTheCorrectCalendarDay() throws Exception {
        LocalDateTime earlyMorning = LocalDateTime.now().plusDays(3).withHour(3).withMinute(0);
        Long earlyMorningId = save(sessionBuilder().scheduledStart(instant(earlyMorning)));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", earlyMorning.toLocalDate().toString())
                        .param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(earlyMorningId));
    }

    /** SESSION-35 — `date` is now a required, load-bearing param rather than one optional filter
     * among several; this was never directly proven even before that (every existing `date` test
     * saves only the one session expected to match). Confirms `date` genuinely excludes a session
     * on a different calendar day, not just that a matching one is included. */
    @Test
    void dateFilter_excludesASessionOnADifferentDate() throws Exception {
        LocalDateTime day = LocalDateTime.now().plusDays(1);
        Long onDateId = save(sessionBuilder().scheduledStart(instant(day)));
        save(sessionBuilder().scheduledStart(instant(day.plusDays(1))));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", day.toLocalDate().toString())
                        .param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(onDateId));
    }

    // ── title / locationId / feeType / maxFeeAmountVnd / minOpenSlots ──────

    @Test
    void titleFilter_isCaseInsensitiveSubstringMatch() throws Exception {
        Long matchId = save(sessionBuilder().title("Sunday Badminton Meetup"));
        save(sessionBuilder().title("Morning Practice"));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE)
                        .param("title", "sunday"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(matchId));
    }

    @Test
    void locationIdFilter_exactMatchOnly() throws Exception {
        Long matchId = save(sessionBuilder().locationId(42L));
        save(sessionBuilder().locationId(7L));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE)
                        .param("locationId", "42"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(matchId));
    }

    @Test
    void feeTypeFilter_exactMatchOnly() throws Exception {
        Long freeId = save(sessionBuilder().feeType(FeeType.FREE));
        save(sessionBuilder().feeType(FeeType.FIXED).feeAmountVnd(50000L));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE)
                        .param("feeType", "FREE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(freeId));
    }

    @Test
    void maxFeeAmountVndFilter_excludesOverBudgetAndExcludesNullFeeAmountRows() throws Exception {
        // FREE has a null feeAmountVnd — SQL "NULL <= x" is not true, so it's excluded too, matching
        // the ticket's own "meaningful only when feeType=FIXED" wording. Confirmed live in Phase 5.
        Long withinBudgetId = save(sessionBuilder().feeType(FeeType.FIXED).feeAmountVnd(40000L));
        save(sessionBuilder().feeType(FeeType.FIXED).feeAmountVnd(60000L));
        save(sessionBuilder().feeType(FeeType.FREE));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE)
                        .param("maxFeeAmountVnd", "50000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(withinBudgetId));
    }

    @Test
    void minOpenSlotsFilter_qualifiesOnlyWhenRemainingOpenSlotsStrictlyExceedsIt() throws Exception {
        // capacity=10, initialSlot=0, 0 real JOINED participants -> openSlots=10.
        Long roomyId = save(sessionBuilder().capacity(10));
        // capacity=5 -> openSlots=5; minOpenSlots=5 must NOT qualify (5-5=0, not >0).
        save(sessionBuilder().capacity(5));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE)
                        .param("minOpenSlots", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(roomyId));
    }

    @Test
    void minOpenSlotsFilter_accountsForRealJoinedParticipantsAndInitialSlot() throws Exception {
        // capacity=10, initialSlot=2, 3 real JOINED participants -> openSlots = 10-2-3 = 5.
        Long sessionId = save(sessionBuilder().capacity(10).initialSlot(2));
        participate(sessionId, creatorId, ParticipantStatus.JOINED);
        participate(sessionId, createUser("filler1").getId(), ParticipantStatus.JOINED);
        participate(sessionId, createUser("filler2").getId(), ParticipantStatus.JOINED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE)
                        .param("minOpenSlots", "4"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(sessionId));
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE)
                        .param("minOpenSlots", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(0));
    }

    // ── startTimeFilter / startTime ─────────────────────────────────────────
    // SESSION-35: date is required, and dayStart/dayEnd + the startTime* clauses are ANDed
    // together — startTimeFilter can no longer match "any date, just this time-of-day" the way it
    // used to when date was omittable; it now only narrows further within the one required date.
    // Every test below puts its fixtures on the same calendar day it filters by.

    @Test
    void startTimeFilter_afterOrEqual_matchesOnlyTimeOfDayAtOrAfterGivenTime() throws Exception {
        LocalDateTime day = LocalDateTime.now().plusDays(1);
        Long eveningId = save(sessionBuilder().scheduledStart(instant(day.withHour(18).withMinute(0))));
        save(sessionBuilder().scheduledStart(instant(day.withHour(9).withMinute(0))));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", day.toLocalDate().toString())
                        .param("startTimeFilter", "AFTER_OR_EQUAL").param("startTime", "12:00:00")
                        .param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(eveningId));
    }

    @Test
    void startTimeFilter_beforeOrEqual_matchesOnlyTimeOfDayAtOrBeforeGivenTime() throws Exception {
        LocalDateTime day = LocalDateTime.now().plusDays(1);
        save(sessionBuilder().scheduledStart(instant(day.withHour(18).withMinute(0))));
        Long morningId = save(sessionBuilder().scheduledStart(instant(day.withHour(9).withMinute(0))));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", day.toLocalDate().toString())
                        .param("startTimeFilter", "BEFORE_OR_EQUAL").param("startTime", "12:00:00")
                        .param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(morningId));
    }

    /** SESSION-35 — locks in the actual semantic change made when {@code date} became required:
     * a session matching {@code startTimeFilter}'s time-of-day on a <em>different</em> calendar day
     * than the required {@code date} must now be excluded, not just that a same-day match is
     * included (every other test in this section only proves the latter). Without this, a
     * regression back to "any day, just this time-of-day" filtering would go undetected. */
    @Test
    void startTimeFilter_excludesAMatchingTimeOfDayOnADifferentDateThanTheRequiredDate() throws Exception {
        LocalDateTime day = LocalDateTime.now().plusDays(1);
        Long onDateId = save(sessionBuilder().scheduledStart(instant(day.withHour(18).withMinute(0))));
        // Same time-of-day (18:00, matches AFTER_OR_EQUAL 12:00) but the day after — would have
        // matched under the old "any date" startTimeFilter semantics; must be excluded now.
        save(sessionBuilder().scheduledStart(instant(day.plusDays(1).withHour(18).withMinute(0))));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", day.toLocalDate().toString())
                        .param("startTimeFilter", "AFTER_OR_EQUAL").param("startTime", "12:00:00")
                        .param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(onDateId));
    }

    /** Regression coverage for a real bug this class caught: a natively-bound {@code LocalTime}
     * JDBC parameter compared against {@code CAST(s.scheduledStart AS time)} silently evaluated
     * wrong for time-of-day values close to midnight, on both H2 and real Postgres — see
     * {@code SessionRepository.findDiscoverSessions}' Javadoc. Fixed by passing the time as a
     * formatted {@code String} instead of a native {@code LocalTime}. Covers exactly the boundary
     * that broke: {@code AFTER_OR_EQUAL} against {@code 00:00:00} (midnight) itself. */
    @Test
    void startTimeFilter_afterOrEqual_matchesAtExactlyMidnight() throws Exception {
        LocalDateTime day = LocalDateTime.now().plusDays(1);
        Long eveningId = save(sessionBuilder().scheduledStart(instant(day.withHour(18).withMinute(0))));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", day.toLocalDate().toString())
                        .param("startTimeFilter", "AFTER_OR_EQUAL").param("startTime", "00:00:00")
                        .param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(eveningId));
    }

    /** SESSION-35 — proves startTimeFilter is genuinely evaluated in viewerZoneId, not the JVM's
     * own zone: a session at 09:00 in one zone reads as a different time-of-day (and a different
     * calendar date) in another, so the same BEFORE_OR_EQUAL 10:00 threshold matches under one
     * viewerZoneId/date pair and not the other — each request's date is computed in its own
     * viewerZoneId, per that zone's actual calendar day for this session's real instant. */
    @Test
    void startTimeFilter_evaluatesAgainstTheGivenViewerZoneIdNotTheServerZone() throws Exception {
        // 09:00 Asia/Tokyo (UTC+9, no DST) is a late-evening time the previous calendar day in
        // America/New_York regardless of DST season, so this assertion doesn't depend on which
        // DST season "tomorrow" falls in.
        Instant nineAmTokyo = LocalDateTime.now().plusDays(1).withHour(9).withMinute(0)
                .atZone(ZoneId.of("Asia/Tokyo")).toInstant();
        Long sessionId = save(sessionBuilder().scheduledStart(nineAmTokyo));
        LocalDate tokyoDate = nineAmTokyo.atZone(ZoneId.of("Asia/Tokyo")).toLocalDate();
        LocalDate nyDate = nineAmTokyo.atZone(ZoneId.of("America/New_York")).toLocalDate();

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", tokyoDate.toString())
                        .param("startTimeFilter", "BEFORE_OR_EQUAL").param("startTime", "10:00:00")
                        .param("viewerZoneId", "Asia/Tokyo"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(sessionId));
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", nyDate.toString())
                        .param("startTimeFilter", "BEFORE_OR_EQUAL").param("startTime", "10:00:00")
                        .param("viewerZoneId", "America/New_York"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(0));
    }

    @Test
    void startTimeFilter_rejectsAnInvalidViewerZoneId() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString())
                        .param("startTimeFilter", "AFTER_OR_EQUAL").param("startTime", "09:00:00")
                        .param("viewerZoneId", "Not/AZone"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void startTimeFilter_rejectsBeingGivenWithoutStartTime() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString())
                        .param("startTimeFilter", "AFTER_OR_EQUAL"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void startTime_rejectsBeingGivenWithoutStartTimeFilter() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString())
                        .param("startTime", "10:00:00"))
                .andExpect(status().isBadRequest());
    }

    // ── Validation: negative numeric filters ────────────────────────────────

    @Test
    void minOpenSlots_rejectsNegativeValue() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString())
                        .param("minOpenSlots", "-1"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void maxFeeAmountVnd_rejectsNegativeValue() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString())
                        .param("maxFeeAmountVnd", "-1"))
                .andExpect(status().isBadRequest());
    }

    // ── Sort: scheduledStart ASC, then open slots ASC, then createdAt ASC ──

    @Test
    void sort_ordersByScheduledStartAscendingPrimarily() throws Exception {
        Instant start = instant(LocalDateTime.now().plusDays(1));
        Long laterId = save(sessionBuilder().scheduledStart(start.plusSeconds(2 * 3600)));
        Long earlierId = save(sessionBuilder().scheduledStart(start));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", start.atZone(ZoneId.systemDefault()).toLocalDate().toString())
                        .param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[0].id").value(earlierId))
                .andExpect(jsonPath("$.data.content[1].id").value(laterId));
    }

    @Test
    void sort_onATiedScheduledStartOrdersByRemainingOpenSlotsAscending() throws Exception {
        Instant tiedStart = instant(LocalDateTime.now().plusDays(1).withNano(0));
        // Same scheduledStart, different capacity -> different openSlots (10 vs 3).
        Long moreOpenId = save(sessionBuilder().scheduledStart(tiedStart).capacity(10));
        Long fewerOpenId = save(sessionBuilder().scheduledStart(tiedStart).capacity(3));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", tiedStart.atZone(ZoneId.systemDefault()).toLocalDate().toString())
                        .param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[0].id").value(fewerOpenId))
                .andExpect(jsonPath("$.data.content[1].id").value(moreOpenId));
    }

    @Test
    void sort_onATiedScheduledStartAndOpenSlotsOrdersByCreatedAtAscending() throws Exception {
        // Session.createdAt is @CreationTimestamp (Hibernate/JVM-generated at insert, not
        // caller-settable), so proving this tiebreak needs two genuinely sequential inserts with a
        // real clock gap between them rather than a constructed value — the small sleep is
        // deliberate, not incidental.
        Instant tiedStart = instant(LocalDateTime.now().plusDays(1).withNano(0));
        Long firstCreatedId = save(sessionBuilder().scheduledStart(tiedStart).capacity(10));
        Thread.sleep(20);
        Long secondCreatedId = save(sessionBuilder().scheduledStart(tiedStart).capacity(10));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", tiedStart.atZone(ZoneId.systemDefault()).toLocalDate().toString())
                        .param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[0].id").value(firstCreatedId))
                .andExpect(jsonPath("$.data.content[1].id").value(secondCreatedId));
    }

    // ── Combined filters + empty-page-on-no-match ───────────────────────────

    @Test
    void combinedFilters_areAndedTogether() throws Exception {
        Long matchId = save(sessionBuilder().title("Sunday Badminton").feeType(FeeType.FIXED).feeAmountVnd(30000L));
        save(sessionBuilder().title("Sunday Badminton").feeType(FeeType.FREE)); // title matches, fee doesn't
        save(sessionBuilder().title("Weekday Practice").feeType(FeeType.FIXED).feeAmountVnd(30000L)); // fee matches, title doesn't

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE)
                        .param("title", "sunday").param("feeType", "FIXED").param("maxFeeAmountVnd", "40000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(matchId));
    }

    @Test
    void noMatchingFilterCombination_returnsEmptyPageNotError() throws Exception {
        save(sessionBuilder().title("Sunday Badminton"));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE)
                        .param("title", "nonexistent-title-xyz"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(0))
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }
}
