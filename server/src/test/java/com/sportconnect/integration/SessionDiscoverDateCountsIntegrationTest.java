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

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Real end-to-end coverage for SESSION-39's {@code GET /api/sessions/discover/counts} —
 * specifically what {@code SessionServiceImplSpec} (which mocks {@code SessionRepository}) cannot
 * prove: that {@code findDiscoverDateCounts}'s native query (the ADR's benchmarked "Query C" shape
 * — {@code AT TIME ZONE} + {@code TO_CHAR} + ordinal {@code GROUP BY 1}, combined with {@code
 * discoverSessions}' own {@code MOD}-based {@code startTimeFilter} mechanism and the multi-value
 * {@code locationId IN (:locationIds)} clause) actually executes and returns the right per-date
 * counts against a real DB round trip, and that {@code SessionServiceImpl}'s backfill logic fills
 * in every date the query's own {@code GROUP BY} silently omits. Same shape/rationale as {@code
 * SessionDiscoverIntegrationTest} — see that class's Javadoc for why a mocked Spock spec alone
 * can't catch this class of bug (a real one was found via that exact method, for the sibling
 * {@code /discover} endpoint).
 *
 * <p>Every test here passes {@code viewerZoneId=UTC} explicitly and anchors fixtures to UTC
 * calendar dates, rather than the JVM's own zone (unlike {@code SessionDiscoverIntegrationTest}'s
 * {@code JVM_ZONE} convention) — this endpoint's default {@code viewerZoneId} is UTC, and pinning
 * fixtures to that same zone keeps the test host's own timezone irrelevant.
 */
class SessionDiscoverDateCountsIntegrationTest extends BaseIT {

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

        callerId = createUser("d39caller").getId();
        creatorId = createUser("d39creator").getId();

        sportId = sportRepository.save(Sport.builder()
                .name("SESSION-39 Badminton " + UUID.randomUUID())
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

    private Session.SessionBuilder sessionBuilder() {
        return Session.builder()
                .groupId(null)
                .isPublic(true)
                .postId(postIdSeq.getAndIncrement())
                .sessionType(SessionType.STANDALONE)
                .createdBy(creatorId)
                .sportId(sportId)
                .locationId(1L)
                .scheduledStart(laterTodayUtc())
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

    private static LocalDate todayUtc() {
        return LocalDate.now(ZoneOffset.UTC);
    }

    /** A session time later today (UTC) — clamps to 23:59 UTC if "now + 2h" would cross into
     * tomorrow, same wraparound-safety rationale as {@code SessionDiscoverIntegrationTest
     * .laterToday()}. */
    private static Instant laterTodayUtc() {
        Instant candidate = Instant.now().plus(Duration.ofHours(2));
        return LocalDate.ofInstant(candidate, ZoneOffset.UTC).equals(todayUtc())
                ? candidate
                : todayUtc().atTime(23, 59).atZone(ZoneOffset.UTC).toInstant();
    }

    /** A session time earlier today (UTC) that has already started — clamps to 00:01 UTC if
     * "now - 1h" would cross into yesterday. */
    private static Instant earlierTodayUtc() {
        Instant candidate = Instant.now().minus(Duration.ofHours(1));
        return LocalDate.ofInstant(candidate, ZoneOffset.UTC).equals(todayUtc())
                ? candidate
                : todayUtc().atTime(0, 1).atZone(ZoneOffset.UTC).toInstant();
    }

    private static Instant atNoonUtc(LocalDate date) {
        return date.atTime(12, 0).atZone(ZoneOffset.UTC).toInstant();
    }

    // ── Default window (no date given) ───────────────────────────────────────

    @Test
    void noDateGiven_defaultsToTodayPlusNext7DaysAndBackfillsZeroCounts() throws Exception {
        save(sessionBuilder());
        save(sessionBuilder());
        save(sessionBuilder().scheduledStart(atNoonUtc(todayUtc().plusDays(1))));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover/counts").param("viewerZoneId", "UTC"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.counts.length()").value(8))
                .andExpect(jsonPath("$.data.counts[0].date").value(todayUtc().toString()))
                .andExpect(jsonPath("$.data.counts[0].count").value(2))
                .andExpect(jsonPath("$.data.counts[1].date").value(todayUtc().plusDays(1).toString()))
                .andExpect(jsonPath("$.data.counts[1].count").value(1))
                .andExpect(jsonPath("$.data.counts[7].date").value(todayUtc().plusDays(7).toString()))
                .andExpect(jsonPath("$.data.counts[7].count").value(0));
    }

    // ── Explicit date list ───────────────────────────────────────────────────

    @Test
    void date_explicitListFiltersToGivenDatesOnlyAndDropsPastDatesSilently() throws Exception {
        LocalDate dayAfterTomorrow = todayUtc().plusDays(2);
        save(sessionBuilder());
        save(sessionBuilder().scheduledStart(atNoonUtc(dayAfterTomorrow)));
        // A date not requested — must not appear in the response at all.
        save(sessionBuilder().scheduledStart(atNoonUtc(todayUtc().plusDays(1))));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover/counts")
                        .param("viewerZoneId", "UTC")
                        .param("date", todayUtc().minusDays(3).toString(), todayUtc().toString(), dayAfterTomorrow.toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.counts.length()").value(2))
                .andExpect(jsonPath("$.data.counts[0].date").value(todayUtc().toString()))
                .andExpect(jsonPath("$.data.counts[0].count").value(1))
                .andExpect(jsonPath("$.data.counts[1].date").value(dayAfterTomorrow.toString()))
                .andExpect(jsonPath("$.data.counts[1].count").value(1));
    }

    @Test
    void date_allValuesInThePastReturnsAnEmptyCountsListWithoutError() throws Exception {
        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover/counts")
                        .param("viewerZoneId", "UTC")
                        .param("date", todayUtc().minusDays(1).toString(), todayUtc().minusDays(10).toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.counts.length()").value(0));
    }

    @Test
    void date_moreThanEightValuesIsBadRequest() throws Exception {
        String[] dates = new String[9];
        for (int i = 0; i < 9; i++) {
            dates[i] = todayUtc().plusDays(i).toString();
        }

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover/counts")
                        .param("viewerZoneId", "UTC")
                        .param("date", dates))
                .andExpect(status().isBadRequest());
    }

    // ── date == today floors at now() ────────────────────────────────────────

    @Test
    void today_floorsAtNowExcludingASessionThatAlreadyStartedEarlierToday() throws Exception {
        save(sessionBuilder().scheduledStart(earlierTodayUtc()));
        save(sessionBuilder().scheduledStart(laterTodayUtc()));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover/counts")
                        .param("viewerZoneId", "UTC").param("date", todayUtc().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.counts.length()").value(1))
                .andExpect(jsonPath("$.data.counts[0].count").value(1));
    }

    // ── isPublic gating (SESSION-37) ─────────────────────────────────────────

    /** The gate is genuinely {@code is_public}, not {@code group_id IS NULL} — a private
     * group-linked session (today's only real shape) is excluded, but a group-linked session
     * that is (hypothetically) {@code isPublic = true} is still counted. {@code Session}'s own
     * Javadoc notes a group session becoming independently public is "a real future feature, not
     * built here" — this fixture isn't reachable via any real API path today (no production code
     * sets {@code isPublic = true} with a non-null {@code groupId}), but the query itself doesn't
     * know or care how the row got that way, so this proves the query is future-proof against
     * that feature landing without silently starting to exclude those sessions too. */
    @Test
    void isPublicFilter_excludesPrivateGroupLinkedSessionButIncludesPublicGroupLinkedSession() throws Exception {
        save(sessionBuilder());
        save(sessionBuilder().groupId(99L).isPublic(false));
        save(sessionBuilder().groupId(98L).isPublic(true));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover/counts")
                        .param("viewerZoneId", "UTC").param("date", todayUtc().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.counts[0].count").value(2));
    }

    // ── locationId: multi-value, OR-combined (scope change) ─────────────────

    @Test
    void locationId_multipleValuesAreOrCombined() throws Exception {
        save(sessionBuilder().locationId(1L));
        save(sessionBuilder().locationId(2L));
        save(sessionBuilder().locationId(3L));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover/counts")
                        .param("viewerZoneId", "UTC").param("date", todayUtc().toString())
                        .param("locationId", "1", "2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.counts[0].count").value(2));
    }

    // ── sportId gating ────────────────────────────────────────────────────────

    @Test
    void sportId_notOneOfTheCallersActiveSportsBackfillsZeroWithoutError() throws Exception {
        save(sessionBuilder());

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover/counts")
                        .param("viewerZoneId", "UTC").param("date", todayUtc().toString())
                        .param("sportId", "999999"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.counts.length()").value(1))
                .andExpect(jsonPath("$.data.counts[0].count").value(0));
    }

    // ── default status list (SESSION-37: PREPARING/SCHEDULED, excludes ONGOING) ─

    @Test
    void defaultStatuses_excludesOngoingCancelledAndCompleted() throws Exception {
        save(sessionBuilder().status(SessionStatus.PREPARING).locationId(null).feeType(null));
        save(sessionBuilder().status(SessionStatus.SCHEDULED));
        save(sessionBuilder().status(SessionStatus.ONGOING));
        save(sessionBuilder().status(SessionStatus.CANCELLED));
        save(sessionBuilder().status(SessionStatus.COMPLETED));

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover/counts")
                        .param("viewerZoneId", "UTC").param("date", todayUtc().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.counts[0].count").value(2));
    }

    // ── caller-exclusion (own/already-joined sessions) ───────────────────────

    @Test
    void baseline_excludesCallerCreatedAndAlreadyJoinedSessions() throws Exception {
        save(sessionBuilder());
        save(sessionBuilder().createdBy(callerId));
        Long alreadyJoinedId = save(sessionBuilder());
        participate(alreadyJoinedId, callerId, ParticipantStatus.JOINED);
        Long previouslyLeftId = save(sessionBuilder());
        participate(previouslyLeftId, callerId, ParticipantStatus.LEFT);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover/counts")
                        .param("viewerZoneId", "UTC").param("date", todayUtc().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.counts[0].count").value(2));
    }

    /** SESSION-42 — widened from JOINED-only: a session the caller already REQUESTED to join or
     * was INVITED to shouldn't count as discoverable either. */
    @Test
    void baseline_excludesAlreadyRequestedAndInvitedSessionsToo() throws Exception {
        save(sessionBuilder());
        Long alreadyRequestedId = save(sessionBuilder());
        participate(alreadyRequestedId, callerId, ParticipantStatus.REQUESTED);
        Long alreadyInvitedId = save(sessionBuilder());
        participate(alreadyInvitedId, callerId, ParticipantStatus.INVITED);

        authenticateAs(callerId);
        mockMvc.perform(get("/api/sessions/discover/counts")
                        .param("viewerZoneId", "UTC").param("date", todayUtc().toString()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.counts[0].count").value(1));
    }
}
