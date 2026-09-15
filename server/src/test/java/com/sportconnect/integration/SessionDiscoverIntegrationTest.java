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

import java.time.LocalDateTime;
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
                .scheduledStart(LocalDateTime.now().plusDays(1))
                .status(SessionStatus.SCHEDULED)
                .capacity(10)
                .feeType(FeeType.FREE)
                .initialSlot(0)
                .autoApprove(true);
    }

    private Long save(Session.SessionBuilder builder) {
        return sessionRepository.save(builder.build()).getId();
    }

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
        mockMvc.perform(get("/api/sessions/discover"))
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
        mockMvc.perform(get("/api/sessions/discover"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(matchingId));
    }

    // ── Default status list + now() lower bound ────────────────────────────

    @Test
    void defaultStatuses_includesPreparingScheduledOngoingOnlyExcludingCancelledAndCompleted() throws Exception {
        Long preparingId = save(sessionBuilder().status(SessionStatus.PREPARING).locationId(null).feeType(null));
        Long scheduledId = save(sessionBuilder().status(SessionStatus.SCHEDULED));
        Long ongoingId = save(sessionBuilder().status(SessionStatus.ONGOING));
        save(sessionBuilder().status(SessionStatus.CANCELLED));
        save(sessionBuilder().status(SessionStatus.COMPLETED));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover"))
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
        mockMvc.perform(get("/api/sessions/discover").param("status", "SCHEDULED"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(scheduledId));
    }

    @Test
    void status_rejectsAValueOutsidePreparingScheduledOngoing() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover").param("status", "CANCELLED"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void defaultLowerBound_excludesAPastSessionWhenNeitherDateNorStartTimeFilterGiven() throws Exception {
        save(sessionBuilder().scheduledStart(LocalDateTime.now().minusDays(1)));
        Long futureId = save(sessionBuilder().scheduledStart(LocalDateTime.now().plusDays(1)));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(futureId));
    }

    @Test
    void dateFilter_optsOutOfTheNowLowerBoundSoAPastDateStillMatches() throws Exception {
        LocalDateTime pastDay = LocalDateTime.now().minusDays(10).withHour(10).withMinute(0);
        Long pastId = save(sessionBuilder().scheduledStart(pastDay));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", pastDay.toLocalDate().toString()))
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
        Long earlyMorningId = save(sessionBuilder().scheduledStart(earlyMorning));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", earlyMorning.toLocalDate().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(earlyMorningId));
    }

    // ── title / locationId / feeType / maxFeeAmountVnd / minOpenSlots ──────

    @Test
    void titleFilter_isCaseInsensitiveSubstringMatch() throws Exception {
        Long matchId = save(sessionBuilder().title("Sunday Badminton Meetup"));
        save(sessionBuilder().title("Morning Practice"));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover").param("title", "sunday"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(matchId));
    }

    @Test
    void locationIdFilter_exactMatchOnly() throws Exception {
        Long matchId = save(sessionBuilder().locationId(42L));
        save(sessionBuilder().locationId(7L));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover").param("locationId", "42"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(matchId));
    }

    @Test
    void feeTypeFilter_exactMatchOnly() throws Exception {
        Long freeId = save(sessionBuilder().feeType(FeeType.FREE));
        save(sessionBuilder().feeType(FeeType.FIXED).feeAmountVnd(50000L));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover").param("feeType", "FREE"))
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
        mockMvc.perform(get("/api/sessions/discover").param("maxFeeAmountVnd", "50000"))
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
        mockMvc.perform(get("/api/sessions/discover").param("minOpenSlots", "5"))
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
        mockMvc.perform(get("/api/sessions/discover").param("minOpenSlots", "4"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(sessionId));
        mockMvc.perform(get("/api/sessions/discover").param("minOpenSlots", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(0));
    }

    // ── startTimeFilter / startTime ─────────────────────────────────────────

    @Test
    void startTimeFilter_afterOrEqual_matchesOnlyTimeOfDayAtOrAfterGivenTimeRegardlessOfDate() throws Exception {
        Long eveningId = save(sessionBuilder()
                .scheduledStart(LocalDateTime.now().plusDays(1).withHour(18).withMinute(0)));
        save(sessionBuilder().scheduledStart(LocalDateTime.now().plusDays(2).withHour(9).withMinute(0)));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("startTimeFilter", "AFTER_OR_EQUAL").param("startTime", "12:00:00"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(eveningId));
    }

    @Test
    void startTimeFilter_beforeOrEqual_matchesOnlyTimeOfDayAtOrBeforeGivenTime() throws Exception {
        save(sessionBuilder().scheduledStart(LocalDateTime.now().plusDays(1).withHour(18).withMinute(0)));
        Long morningId = save(sessionBuilder()
                .scheduledStart(LocalDateTime.now().plusDays(2).withHour(9).withMinute(0)));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("startTimeFilter", "BEFORE_OR_EQUAL").param("startTime", "12:00:00"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(morningId));
    }

    @Test
    void startTimeFilter_optsOutOfTheNowLowerBoundJustLikeDateDoes() throws Exception {
        LocalDateTime pastEvening = LocalDateTime.now().minusDays(5).withHour(18).withMinute(0);
        Long pastId = save(sessionBuilder().scheduledStart(pastEvening));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("startTimeFilter", "AFTER_OR_EQUAL").param("startTime", "00:00:00"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(pastId));
    }

    /** Regression coverage for a real bug this class caught: a natively-bound {@code LocalTime}
     * JDBC parameter compared against {@code CAST(s.scheduledStart AS time)} silently evaluated
     * wrong for time-of-day values close to midnight, on both H2 and real Postgres — see
     * {@code SessionRepository.findDiscoverSessions}' Javadoc. Fixed by passing the time as a
     * formatted {@code String} instead of a native {@code LocalTime}. Covers exactly the boundary
     * that broke: {@code AFTER_OR_EQUAL} against {@code 00:00:00} (midnight) itself. */
    @Test
    void startTimeFilter_afterOrEqual_matchesAtExactlyMidnight() throws Exception {
        Long eveningId = save(sessionBuilder()
                .scheduledStart(LocalDateTime.now().plusDays(1).withHour(18).withMinute(0)));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("startTimeFilter", "AFTER_OR_EQUAL").param("startTime", "00:00:00"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(eveningId));
    }

    @Test
    void startTimeFilter_rejectsBeingGivenWithoutStartTime() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover").param("startTimeFilter", "AFTER_OR_EQUAL"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void startTime_rejectsBeingGivenWithoutStartTimeFilter() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover").param("startTime", "10:00:00"))
                .andExpect(status().isBadRequest());
    }

    // ── Validation: negative numeric filters ────────────────────────────────

    @Test
    void minOpenSlots_rejectsNegativeValue() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover").param("minOpenSlots", "-1"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void maxFeeAmountVnd_rejectsNegativeValue() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover").param("maxFeeAmountVnd", "-1"))
                .andExpect(status().isBadRequest());
    }

    // ── Sort: scheduledStart ASC, then open slots ASC, then createdAt ASC ──

    @Test
    void sort_ordersByScheduledStartAscendingPrimarily() throws Exception {
        LocalDateTime start = LocalDateTime.now().plusDays(1);
        Long laterId = save(sessionBuilder().scheduledStart(start.plusHours(2)));
        Long earlierId = save(sessionBuilder().scheduledStart(start));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[0].id").value(earlierId))
                .andExpect(jsonPath("$.data.content[1].id").value(laterId));
    }

    @Test
    void sort_onATiedScheduledStartOrdersByRemainingOpenSlotsAscending() throws Exception {
        LocalDateTime tiedStart = LocalDateTime.now().plusDays(1).withNano(0);
        // Same scheduledStart, different capacity -> different openSlots (10 vs 3).
        Long moreOpenId = save(sessionBuilder().scheduledStart(tiedStart).capacity(10));
        Long fewerOpenId = save(sessionBuilder().scheduledStart(tiedStart).capacity(3));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover"))
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
        LocalDateTime tiedStart = LocalDateTime.now().plusDays(1).withNano(0);
        Long firstCreatedId = save(sessionBuilder().scheduledStart(tiedStart).capacity(10));
        Thread.sleep(20);
        Long secondCreatedId = save(sessionBuilder().scheduledStart(tiedStart).capacity(10));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover"))
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
                        .param("title", "sunday").param("feeType", "FIXED").param("maxFeeAmountVnd", "40000"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(matchId));
    }

    @Test
    void noMatchingFilterCombination_returnsEmptyPageNotError() throws Exception {
        save(sessionBuilder().title("Sunday Badminton"));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover").param("title", "nonexistent-title-xyz"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(0))
                .andExpect(jsonPath("$.data.totalElements").value(0));
    }
}
