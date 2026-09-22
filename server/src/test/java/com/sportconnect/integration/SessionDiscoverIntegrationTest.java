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
                .isPublic(true)
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

    /** SESSION-37 — a wall-clock time later today, for tests proving {@code date == today}'s
     * {@code now()} floor still includes a not-yet-started session. {@code now().plusHours(2)}
     * alone can cross midnight when the suite runs late at night (found while verifying
     * SESSION-38); clamping to 23:59 keeps it on today regardless. Deliberately not
     * {@code LocalTime.MAX} (23:59:59.999999999) either — empirically, that exact value doesn't
     * round-trip through the H2 {@code TIMESTAMP WITH TIME ZONE} column reliably (a real,
     * reproducible JDBC/Hibernate precision quirk at the nanosecond edge, not a logic error —
     * confirmed by replicating the service's own Instant math standalone, which showed the value
     * correctly inside [now(), dayEnd) before it ever reached the database). 23:59:00 has no
     * fractional seconds at all, so there's no rounding edge to hit. */
    private static LocalDateTime laterToday() {
        LocalDateTime candidate = LocalDateTime.now().plusHours(2);
        return candidate.toLocalDate().equals(LocalDate.now())
                ? candidate
                : LocalDate.now().atTime(23, 59);
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
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[*].id").value(containsInAnyOrder(
                        othersId.intValue(), previouslyLeftId.intValue())));
    }

    /** SESSION-42 — widened from JOINED-only: a session the caller already REQUESTED to join or
     * was INVITED to shouldn't still surface as newly discoverable either. */
    @Test
    void baseline_excludesAlreadyRequestedAndInvitedSessionsToo() throws Exception {
        Long othersId = save(sessionBuilder());
        Long alreadyRequestedId = save(sessionBuilder());
        participate(alreadyRequestedId, callerId, ParticipantStatus.REQUESTED);
        Long alreadyInvitedId = save(sessionBuilder());
        participate(alreadyInvitedId, callerId, ParticipantStatus.INVITED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(othersId));
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

    /** SESSION-37 — {@code findDiscoverSessions}' query base moved from {@code groupId IS NULL} to
     * {@code isPublic = true}; this proves the new column is actually what gates a group-linked
     * session out, not just that the old {@code groupId} shape still happens to agree with it. A
     * group-linked session that is (hypothetically) {@code isPublic = true} is still included —
     * not reachable via any real API path today ({@code Session}'s own Javadoc notes a group
     * session becoming independently public is "a real future feature, not built here"), but the
     * query doesn't know or care how the row got that way, so this proves the gate is future-proof
     * against that feature landing without silently starting to exclude those sessions too
     * (2026-09-22 addition, prompted by a review comment). */
    @Test
    void isPublicFilter_excludesPrivateGroupLinkedSessionButIncludesPublicGroupLinkedSession() throws Exception {
        Long standaloneId = save(sessionBuilder());
        save(sessionBuilder().groupId(99L).isPublic(false));
        Long publicGroupLinkedId = save(sessionBuilder().groupId(98L).isPublic(true));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[*].id").value(containsInAnyOrder(
                        standaloneId.intValue(), publicGroupLinkedId.intValue())));
    }

    // ── date required + default status list ─────────────────────────────────

    @Test
    void date_isRequiredRejectsBeingOmitted() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover"))
                .andExpect(status().isBadRequest());
    }

    /** SESSION-37 — ONGOING is no longer part of the default status list. */
    @Test
    void defaultStatuses_includesPreparingScheduledOnlyExcludingOngoingCancelledAndCompleted() throws Exception {
        Long preparingId = save(sessionBuilder().status(SessionStatus.PREPARING).locationId(null).feeType(null));
        Long scheduledId = save(sessionBuilder().status(SessionStatus.SCHEDULED));
        save(sessionBuilder().status(SessionStatus.ONGOING));
        save(sessionBuilder().status(SessionStatus.CANCELLED));
        save(sessionBuilder().status(SessionStatus.COMPLETED));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[*].id").value(containsInAnyOrder(
                        preparingId.intValue(), scheduledId.intValue())));
    }

    @Test
    void status_explicitListOverridesTheDefaultAndNarrowsToOnlyThoseValues() throws Exception {
        Long scheduledId = save(sessionBuilder().status(SessionStatus.SCHEDULED));
        save(sessionBuilder().status(SessionStatus.PREPARING).locationId(null).feeType(null));

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

    /** SESSION-37 — an explicit ONGOING is never a 400 (unlike a genuinely invalid value), but
     * it's silently stripped out before querying. */
    @Test
    void status_explicitOngoingIsStrippedNotRejectedAndNarrowsAlongsideOtherValues() throws Exception {
        Long scheduledId = save(sessionBuilder().status(SessionStatus.SCHEDULED));
        save(sessionBuilder().status(SessionStatus.ONGOING));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE)
                        .param("status", "SCHEDULED").param("status", "ONGOING"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(scheduledId));
    }

    /** SESSION-37 — stripping ONGOING out of a status list containing only ONGOING falls back to
     * the default list, never an empty result. */
    @Test
    void status_onlyOngoingFallsBackToTheDefaultListRatherThanAnEmptyResult() throws Exception {
        Long scheduledId = save(sessionBuilder().status(SessionStatus.SCHEDULED));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE)
                        .param("status", "ONGOING"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(scheduledId));
    }

    /** SESSION-37 — supersedes the old exact-day behavior this test name described: a past
     * {@code date} is now silently clamped to today's own semantics (a real {@code now()} floor),
     * so a session actually scheduled on that past day is excluded, not matched. */
    @Test
    void dateFilter_aPastDateClampsToTodayExcludingASessionActuallyOnThatPastDay() throws Exception {
        LocalDateTime pastDay = LocalDateTime.now().minusDays(10).withHour(10).withMinute(0);
        save(sessionBuilder().scheduledStart(instant(pastDay)));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", pastDay.toLocalDate().toString())
                        .param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(0));
    }

    /** SESSION-37 — a past {@code date} clamps to today, so a session actually scheduled later
     * today still matches even though the request named an earlier day. See {@link #laterToday()}
     * for why this doesn't use a bare {@code now().plusHours(2)}. */
    @Test
    void dateFilter_aPastDateClampedToTodayStillMatchesASessionLaterToday() throws Exception {
        LocalDateTime later = laterToday();
        Long laterTodayId = save(sessionBuilder().scheduledStart(instant(later)));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", LocalDate.now().minusDays(10).toString())
                        .param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(laterTodayId));
    }

    /** SESSION-37 — {@code date == today} floors at {@code now()}, excluding a session that
     * already started earlier today (unlike SESSION-35's plain exact-day match, which had no such
     * floor). Uses {@code LocalTime.MIDNIGHT} rather than {@code now().minusHours(2)} — the latter
     * can cross into yesterday when run early in the morning, same boundary-crossing class of flake
     * as the "later today" tests below; midnight is always "earlier today" (<= any real
     * {@code now()} the same day) and never yesterday. */
    @Test
    void dateFilter_todayExcludesASessionThatAlreadyStartedEarlierToday() throws Exception {
        LocalDateTime earlier = LocalDate.now().atStartOfDay();
        save(sessionBuilder().scheduledStart(instant(earlier)));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", LocalDate.now().toString())
                        .param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(0));
    }

    /** SESSION-37 — {@code date == today} still matches a session later today, just not one
     * that's already started. See {@link #laterToday()} for why this doesn't use a bare
     * {@code now().plusHours(2)}. */
    @Test
    void dateFilter_todayIncludesASessionLaterToday() throws Exception {
        LocalDateTime later = laterToday();
        Long laterTodayId = save(sessionBuilder().scheduledStart(instant(later)));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", LocalDate.now().toString())
                        .param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(laterTodayId));
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
    void locationIdFilter_singleValueIsExactMatch() throws Exception {
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

    /** 2026-09-22 — locationId widened from single-value to multi-value, OR-combined, for parity
     * with /discover/counts (which shipped the multi-value shape first). */
    @Test
    void locationIdFilter_multipleValuesAreOrCombined() throws Exception {
        Long match1Id = save(sessionBuilder().locationId(42L));
        Long match2Id = save(sessionBuilder().locationId(7L));
        save(sessionBuilder().locationId(13L));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE)
                        .param("locationId", "42", "7"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(2))
                .andExpect(jsonPath("$.data.content[*].id").value(containsInAnyOrder(
                        match1Id.intValue(), match2Id.intValue())));
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

    /** SESSION-37 — startTimeFilter/startTime are no longer a strict pair: startTimeFilter alone
     * is a no-op (never a 400), same as if neither were given. */
    @Test
    void startTimeFilter_givenWithoutStartTimeHasNoEffectNotA400() throws Exception {
        LocalDateTime day = LocalDateTime.now().plusDays(1);
        Long morningId = save(sessionBuilder().scheduledStart(instant(day.withHour(9).withMinute(0))));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", day.toLocalDate().toString()).param("viewerZoneId", JVM_ZONE)
                        .param("startTimeFilter", "AFTER_OR_EQUAL"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(morningId));
    }

    /** SESSION-37 — startTime given alone defaults its direction to AFTER_OR_EQUAL, never a 400. */
    @Test
    void startTime_givenWithoutStartTimeFilterDefaultsToAfterOrEqual() throws Exception {
        LocalDateTime day = LocalDateTime.now().plusDays(1);
        Long eveningId = save(sessionBuilder().scheduledStart(instant(day.withHour(18).withMinute(0))));
        save(sessionBuilder().scheduledStart(instant(day.withHour(9).withMinute(0))));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", day.toLocalDate().toString()).param("viewerZoneId", JVM_ZONE)
                        .param("startTime", "12:00:00"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.content[0].id").value(eveningId));
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

    // ── Pagination: default page size ───────────────────────────────────────

    /** SESSION-37 — default page size dropped from 20 to 10. */
    @Test
    void pageSize_defaultsTo10() throws Exception {
        for (int i = 0; i < 11; i++) {
            save(sessionBuilder());
        }

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover")
                        .param("date", DEFAULT_DATE.toString()).param("viewerZoneId", JVM_ZONE))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content.length()").value(10))
                .andExpect(jsonPath("$.data.totalElements").value(11));
    }

    // ── Sort: scheduledStart ASC, then open slots ASC, then createdAt ASC ──

    @Test
    void sort_ordersByScheduledStartAscendingPrimarily() throws Exception {
        // Pre-existing flake found while verifying SESSION-38 (unrelated to that ticket): anchoring
        // start to now().plusDays(1) preserves the current time-of-day, so adding 2 hours on top
        // could cross into a third calendar day whenever the suite runs late enough at night —
        // pushing laterId outside date's single-day window and failing this assertion. Anchoring to
        // a fixed, safe hour (08:00) instead makes the +2h offset never cross midnight.
        Instant start = instant(LocalDateTime.now().plusDays(1).withHour(8).withMinute(0).withSecond(0).withNano(0));
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
