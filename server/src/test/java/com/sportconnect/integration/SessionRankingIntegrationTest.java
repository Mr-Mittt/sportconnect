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
import com.sportconnect.session.record.SessionRecordRepository;
import com.sportconnect.session.record.SessionRecordVerificationRepository;
import com.sportconnect.session.repository.SessionOutboxEventRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.social.post.api.dto.PostType;
import com.sportconnect.social.post.entity.Post;
import com.sportconnect.social.post.repository.CommentRepository;
import com.sportconnect.social.post.repository.PostRepository;
import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.repository.SportRepository;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-72: ranking games through the real pipeline (MockMvc, the real gates, services, H2 schema and
 * {@code GlobalExceptionHandler}): propose, confirm, the derived state, edits that make confirmations stale, the status
 * and window rules (a game can be set up in a {@code SCHEDULED} session), who is told, and two confirmations at once.
 *
 * <p>Each request carries its own bearer token, so one test can act as several players (unlike {@code authenticateAs}).
 * This suite runs on H2 in one JVM: the parallel tests prove the portable JPA and row-lock logic with real threads, not
 * PostgreSQL's own behaviour.
 */
class SessionRankingIntegrationTest extends RedisBaseIT {

    private static final Integer ROLE_OWNER = 1;
    private static final Integer ROLE_MEMBER = 3;
    private static final String EVENT = "session.record.verification_requested";

    @Autowired private SessionRepository sessionRepository;
    @Autowired private SessionParticipantRepository participantRepository;
    @Autowired private SessionRecordRepository recordRepository;
    @Autowired private SessionRecordVerificationRepository verificationRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private GroupMemberRepository groupMemberRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private SportRepository sportRepository;
    @Autowired private CacheManager cacheManager;
    @Autowired private PostRepository postRepository;
    @Autowired private CommentRepository commentRepository;
    @Autowired private SessionOutboxEventRepository outboxRepository;

    private UUID hostId;       // JOINED, never named in a game
    private UUID aliceId;      // JOINED, a player
    private UUID bobId;        // JOINED, a player
    private UUID carolId;      // JOINED, a player
    private UUID danId;        // JOINED, a player
    private UUID neverJoinedId; // a member of the group only
    private UUID requestedId;  // REQUESTED in the standalone session
    private Long sportId;
    private Long groupId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        hostId = createUser("host");
        aliceId = createUser("alice");
        bobId = createUser("bob");
        carolId = createUser("carol");
        danId = createUser("dan");
        neverJoinedId = createUser("never");
        requestedId = createUser("requested");
        sportId = sportRepository.save(Sport.builder().name("SESSION-72 " + UUID.randomUUID()).isActive(true)
                .statisticsEnabled(true).resultSchema(badmintonSchema()).build()).getId();
        evictSportCache();
        groupId = groupRepository.save(Group.builder().groupName("Ranking " + UUID.randomUUID())
                .createdBy(hostId).isPrivate(true).isActive(true).build()).getId();
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(hostId).roleId(ROLE_OWNER).build());
        for (UUID member : List.of(aliceId, bobId, carolId, danId, neverJoinedId)) {
            groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(member).roleId(ROLE_MEMBER).build());
        }
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
        evictSportCache();
    }

    private void clearAll() {
        outboxRepository.deleteAll();
        commentRepository.deleteAll();
        verificationRepository.deleteAll();
        recordRepository.deleteAll();
        participantRepository.deleteAll();
        sessionRepository.deleteAll();
        groupMemberRepository.deleteAll();
        groupRepository.deleteAll();
        postRepository.deleteAll();
        userRepository.deleteAll();
        sportRepository.deleteAll();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    /** Badminton: doubles, one required score slot of 0 to 30. */
    private void switchStatistics(boolean on) {
        Sport sport = sportRepository.findById(sportId).orElseThrow();
        sport.setStatisticsEnabled(on);
        sportRepository.save(sport);
        evictSportCache();
    }

    private static Map<String, Object> badmintonSchema() {
        return Map.of("version", 1, "maxRecords", 100, "record", Map.of("data", Map.of(
                "type", "COMPETITIVE",
                "playersPerSide", Map.of("min", 1, "max", 2),
                "score", Map.of("slot", List.of(Map.of("required", true, "rule", ">=0&<=30"))))));
    }

    private UUID createUser(String label) {
        User user = new User();
        user.setUsername(label + "_" + UUID.randomUUID());
        user.setEmail(label + "_" + System.nanoTime() + "@example.com");
        user.setFirstName(label);
        user.setLastName("User");
        user.setIsEmailVerified(false);
        user.setIsActive(true);
        return userRepository.save(user).getId();
    }

    private void join(Long sessionId, UUID userId, ParticipantStatus status) {
        participantRepository.save(SessionParticipant.builder().sessionId(sessionId).userId(userId).status(status).build());
    }

    private Long sessionPostAnchor() {
        return postRepository.save(Post.builder().userId(hostId).groupId(null).postType(PostType.SESSION_POST)
                .content("Session: fixture").visibility("private").isActive(true).build()).getId();
    }

    /** A session whose end is {@code endsInSeconds} from now (negative: it ended that long ago); host and four players JOINED. */
    private Long seedSession(Long sessionGroupId, SessionStatus status, long endsInSeconds) {
        Instant end = Instant.now().plusSeconds(endsInSeconds);
        Long id = sessionRepository.save(Session.builder().title("Ranking session")
                .groupId(sessionGroupId)
                .isPublic(sessionGroupId == null)
                .postId(sessionPostAnchor())
                .sessionType(sessionGroupId == null ? SessionType.STANDALONE : SessionType.GROUP_RECURRING)
                .createdBy(hostId)
                .sportId(sportId)
                .locationId(1L)
                .scheduledStart(end.minus(Duration.ofHours(2)))
                .scheduledEndAt(end)
                .status(status)
                .capacity(9999)
                .feeType(FeeType.FREE)
                .initialSlot(0)
                .autoApprove(false)
                .build()).getId();
        for (UUID player : List.of(hostId, aliceId, bobId, carolId, danId)) {
            join(id, player, ParticipantStatus.JOINED);
        }
        join(id, requestedId, ParticipantStatus.REQUESTED);
        return id;
    }

    private Long ongoing() {
        return seedSession(null, SessionStatus.ONGOING, 3600);
    }

    private Map<String, Object> doubles(Integer first, Integer second) {
        List<Integer> a = new ArrayList<>();
        a.add(first);
        List<Integer> b = new ArrayList<>();
        b.add(second);
        return Map.of("teams", List.of(
                Map.of("players", List.of(aliceId.toString(), bobId.toString()), "scores", a),
                Map.of("players", List.of(carolId.toString(), danId.toString()), "scores", b)));
    }

    private static List<String> doublesPlayers(UUID... ids) {
        return java.util.Arrays.stream(ids).map(UUID::toString).toList();
    }

    private ResultActions as(UUID user, org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder builder) throws Exception {
        return mockMvc.perform(builder.header("Authorization", bearerFor(user, "USER")).contentType(MediaType.APPLICATION_JSON));
    }

    /** Adds one doubles game as {@code actor} and returns its record id. */
    private Long addGame(Long sessionId, UUID actor, Integer first, Integer second) throws Exception {
        Map<String, Object> add = Map.of("clientRef", UUID.randomUUID().toString(),
                "playerIds", doublesPlayers(aliceId, bobId, carolId, danId), "data", doubles(first, second));
        MvcResult result = as(actor, post("/api/sessions/{id}/records/changes", sessionId)
                .content(toJson(Map.of("add", List.of(add), "update", List.of(), "delete", List.of()))))
                .andExpect(status().isOk()).andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).path("data").path("results").get(0).path("id").asLong();
    }

    private ResultActions updateGame(Long sessionId, UUID actor, Long recordId, Integer first, Integer second) throws Exception {
        Map<String, Object> update = Map.of("id", recordId,
                "playerIds", doublesPlayers(aliceId, bobId, carolId, danId), "data", doubles(first, second));
        return as(actor, post("/api/sessions/{id}/records/changes", sessionId)
                .content(toJson(Map.of("add", List.of(), "update", List.of(update), "delete", List.of()))));
    }

    private ResultActions propose(Long sessionId, Long recordId, UUID actor) throws Exception {
        return as(actor, post("/api/sessions/{s}/records/{r}/ranking-request", sessionId, recordId));
    }

    private ResultActions verify(Long sessionId, Long recordId, UUID actor) throws Exception {
        return as(actor, post("/api/sessions/{s}/records/{r}/verify", sessionId, recordId));
    }

    private JsonNode ranking(Long sessionId, Long recordId, UUID actor) throws Exception {
        MvcResult result = as(actor, get("/api/sessions/{s}/records", sessionId)).andExpect(status().isOk()).andReturn();
        for (JsonNode record : objectMapper.readTree(result.getResponse().getContentAsString()).path("data")) {
            if (record.path("id").asLong() == recordId) {
                return record.path("ranking");
            }
        }
        throw new AssertionError("record " + recordId + " not listed");
    }

    private Set<UUID> confirmed(JsonNode ranking) {
        Set<UUID> ids = new HashSet<>();
        ranking.path("confirmedBy").forEach(n -> ids.add(UUID.fromString(n.asText())));
        return ids;
    }

    private List<SessionOutboxEvent> events() {
        return outboxRepository.findAll().stream().filter(e -> EVENT.equals(e.getEventType())).toList();
    }

    private Set<UUID> recipients() throws Exception {
        Set<UUID> ids = new HashSet<>();
        for (SessionOutboxEvent e : events()) {
            ids.add(UUID.fromString(objectMapper.readTree(e.getPayload()).path("recipientUserId").asText()));
        }
        return ids;
    }

    // ---- propose, confirm, the state -----------------------------------------------------------

    @Test
    void aPlayerProposes_theOtherThreeAreTold_andTheGameIsVerifiedWhenEveryoneConfirmed() throws Exception {
        Long sessionId = ongoing();
        Long recordId = addGame(sessionId, aliceId, 21, 18);

        propose(sessionId, recordId, aliceId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ranking.status").value("PROPOSED"))
                .andExpect(jsonPath("$.data.ranking.requestedBy").value(aliceId.toString()));

        assertThat(events()).hasSize(3);
        assertThat(recipients()).containsExactlyInAnyOrder(bobId, carolId, danId);
        assertThat(confirmed(ranking(sessionId, recordId, aliceId))).containsExactly(aliceId);

        verify(sessionId, recordId, bobId).andExpect(status().isOk());
        verify(sessionId, recordId, carolId).andExpect(status().isOk());
        assertThat(ranking(sessionId, recordId, hostId).path("status").asText()).isEqualTo("PROPOSED");

        verify(sessionId, recordId, danId)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ranking.status").value("VERIFIED"));
        assertThat(confirmed(ranking(sessionId, recordId, hostId))).containsExactlyInAnyOrder(aliceId, bobId, carolId, danId);
        assertThat(verificationRepository.count()).isEqualTo(4);
    }

    @Test
    void aGameNobodyProposed_isNormal_andConfirmingItIs409() throws Exception {
        Long sessionId = ongoing();
        Long recordId = addGame(sessionId, aliceId, 21, 18);

        assertThat(ranking(sessionId, recordId, aliceId).path("status").asText()).isEqualTo("NORMAL");
        verify(sessionId, recordId, bobId)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_NOT_PROPOSED"));
    }

    @Test
    void aSportWithStatisticsSwitchedOff_hasNoRankingGames_proposingAndConfirmingAre409UntilItIsSwitchedOn() throws Exception {
        Long sessionId = ongoing();
        Long recordId = addGame(sessionId, aliceId, 21, 18);       // logging a game does not depend on the switch

        switchStatistics(false);

        propose(sessionId, recordId, aliceId)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_RANKING_NOT_AVAILABLE"));
        verify(sessionId, recordId, bobId)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_RANKING_NOT_AVAILABLE"));
        assertThat(events()).isEmpty();
        assertThat(verificationRepository.count()).isZero();
        assertThat(ranking(sessionId, recordId, aliceId).path("status").asText()).isEqualTo("NORMAL");

        switchStatistics(true);

        propose(sessionId, recordId, aliceId).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ranking.status").value("PROPOSED"));
    }

    @Test
    void proposingTwice_changesNothingAndNotifiesNobodyAgain() throws Exception {
        Long sessionId = ongoing();
        Long recordId = addGame(sessionId, aliceId, 21, 18);

        propose(sessionId, recordId, aliceId).andExpect(status().isOk());
        propose(sessionId, recordId, bobId).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ranking.requestedBy").value(aliceId.toString()));

        assertThat(events()).hasSize(3);
    }

    @Test
    void aJoinedParticipantWhoIsNotAPlayer_canPropose_andIsNotAConfirmer() throws Exception {
        Long sessionId = ongoing();
        Long recordId = addGame(sessionId, aliceId, 21, 18);

        propose(sessionId, recordId, hostId).andExpect(status().isOk());
        verify(sessionId, recordId, hostId)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_VERIFY_NOT_A_PLAYER"));

        assertThat(recipients()).containsExactlyInAnyOrder(aliceId, bobId, carolId, danId);
        assertThat(verificationRepository.count()).isZero();
    }

    // ---- who may propose and confirm ------------------------------------------------------------

    @Test
    void aGroupMemberWhoNeverJoined_canReadButNotPropose() throws Exception {
        Long sessionId = seedSession(groupId, SessionStatus.ONGOING, 3600);
        Long recordId = addGame(sessionId, aliceId, 21, 18);

        as(neverJoinedId, get("/api/sessions/{s}/records", sessionId)).andExpect(status().isOk());
        propose(sessionId, recordId, neverJoinedId)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_RANKING_PROPOSER_NOT_JOINED"));

        assertThat(events()).isEmpty();
    }

    @Test
    void aRequestedParticipantAndAnOutsider_areRefusedByTheRecordsGate() throws Exception {
        Long sessionId = ongoing();
        Long recordId = addGame(sessionId, aliceId, 21, 18);
        UUID outsider = createUser("outsider");

        propose(sessionId, recordId, requestedId).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_NOT_ALLOWED"));
        propose(sessionId, recordId, outsider).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_NOT_ALLOWED"));
        verify(sessionId, recordId, outsider).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_NOT_ALLOWED"));
    }

    @Test
    void anUnknownRecord_andARecordOfAnotherSession_are404() throws Exception {
        Long sessionId = ongoing();
        Long otherSession = ongoing();
        Long recordInOther = addGame(otherSession, aliceId, 21, 18);

        propose(sessionId, 999999L, aliceId).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_NOT_FOUND"));
        propose(sessionId, recordInOther, aliceId).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_NOT_FOUND"));
        verify(sessionId, recordInOther, bobId).andExpect(status().isNotFound());
    }

    @Test
    void aDeactivatedPlayer_isNotNotified() throws Exception {
        Long sessionId = ongoing();
        Long recordId = addGame(sessionId, aliceId, 21, 18);
        User dan = userRepository.findById(danId).orElseThrow();
        dan.setIsActive(false);
        userRepository.save(dan);

        propose(sessionId, recordId, aliceId).andExpect(status().isOk());

        assertThat(recipients()).containsExactlyInAnyOrder(bobId, carolId);
    }

    // ---- status and window ----------------------------------------------------------------------

    @Test
    void aScheduledSession_acceptsAPlannedGame_whichIsProposedNow_andConfirmedOnceTheScoreIsIn() throws Exception {
        Long sessionId = seedSession(null, SessionStatus.SCHEDULED, 3600);
        Long recordId = addGame(sessionId, aliceId, null, null);

        propose(sessionId, recordId, aliceId).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.ranking.status").value("PROPOSED"));
        assertThat(recipients()).containsExactlyInAnyOrder(bobId, carolId, danId);
        assertThat(verificationRepository.count()).as("a game with no score has no confirmation yet").isZero();

        verify(sessionId, recordId, bobId)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_RANKING_NOT_RANKABLE"))
                .andExpect(jsonPath("$.errorParams.reason").value("NO_SCORE"));

        updateGame(sessionId, aliceId, recordId, 21, 15).andExpect(status().isOk());
        assertThat(events()).as("the score arriving asks the three others again").hasSize(6);

        for (UUID player : List.of(aliceId, bobId, carolId, danId)) {
            verify(sessionId, recordId, player).andExpect(status().isOk());
        }
        assertThat(ranking(sessionId, recordId, hostId).path("status").asText()).isEqualTo("VERIFIED");
    }

    @Test
    void aPreparingOrCancelledSession_isNotLoggable_andANotYetStartedOneIs() throws Exception {
        for (SessionStatus closed : List.of(SessionStatus.PREPARING, SessionStatus.CANCELLED)) {
            Long sessionId = seedSession(null, closed, 3600);
            propose(sessionId, 1L, aliceId).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_NOT_LOGGABLE"));
        }
    }

    @Test
    void theWindowClosesTwentyFourHoursAfterTheEnd_forProposingAndConfirming() throws Exception {
        Long sessionId = seedSession(null, SessionStatus.COMPLETED, -Duration.ofHours(23).toSeconds());
        Long recordId = addGame(sessionId, aliceId, 21, 18);
        propose(sessionId, recordId, aliceId).andExpect(status().isOk());

        sessionRepository.findAll().forEach(s -> {
            s.setScheduledEndAt(Instant.now().minus(Duration.ofHours(25)));
            sessionRepository.save(s);
        });

        verify(sessionId, recordId, bobId).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_WINDOW_CLOSED"));
        propose(sessionId, recordId, bobId).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_WINDOW_CLOSED"));
    }

    @Test
    void aScoredGameWhoseFirstTeamIsNotAhead_cannotBeProposed() throws Exception {
        Long sessionId = ongoing();
        Long recordId = addGame(sessionId, aliceId, 10, 21);

        propose(sessionId, recordId, aliceId)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_RANKING_NOT_RANKABLE"))
                .andExpect(jsonPath("$.errorParams.reason").value("FIRST_TEAM_NOT_AHEAD"));
        assertThat(ranking(sessionId, recordId, aliceId).path("status").asText()).isEqualTo("NORMAL");
    }

    // ---- an edit makes confirmations stale; a delete removes them ---------------------------------

    @Test
    void anEditAfterEveryoneConfirmed_makesTheConfirmationsStale_andAsksTheOthersAgain() throws Exception {
        Long sessionId = ongoing();
        Long recordId = addGame(sessionId, aliceId, 21, 18);
        propose(sessionId, recordId, aliceId).andExpect(status().isOk());
        for (UUID player : List.of(bobId, carolId, danId)) {
            verify(sessionId, recordId, player).andExpect(status().isOk());
        }
        assertThat(ranking(sessionId, recordId, hostId).path("status").asText()).isEqualTo("VERIFIED");
        int before = events().size();

        updateGame(sessionId, bobId, recordId, 21, 5).andExpect(status().isOk());

        JsonNode after = ranking(sessionId, recordId, hostId);
        assertThat(after.path("status").asText()).isEqualTo("PROPOSED");
        assertThat(confirmed(after)).isEmpty();
        assertThat(verificationRepository.count()).as("the old rows are stale, not deleted").isEqualTo(4);
        assertThat(events().size() - before).as("alice, carol and dan are asked again, not the editor").isEqualTo(3);

        for (UUID player : List.of(aliceId, bobId, carolId, danId)) {
            verify(sessionId, recordId, player).andExpect(status().isOk());
        }
        assertThat(ranking(sessionId, recordId, hostId).path("status").asText()).isEqualTo("VERIFIED");
        assertThat(verificationRepository.count()).as("a re-confirmation overwrites, it never adds").isEqualTo(4);
    }

    @Test
    void savingAGameUnchanged_keepsItsConfirmations() throws Exception {
        Long sessionId = ongoing();
        Long recordId = addGame(sessionId, aliceId, 21, 18);
        propose(sessionId, recordId, aliceId).andExpect(status().isOk());
        verify(sessionId, recordId, bobId).andExpect(status().isOk());
        int before = events().size();

        updateGame(sessionId, aliceId, recordId, 21, 18).andExpect(status().isOk());

        assertThat(confirmed(ranking(sessionId, recordId, hostId))).containsExactlyInAnyOrder(aliceId, bobId);
        assertThat(events().size()).isEqualTo(before);
    }

    @Test
    void deletingAGame_deletesItsConfirmations() throws Exception {
        Long sessionId = ongoing();
        Long recordId = addGame(sessionId, aliceId, 21, 18);
        propose(sessionId, recordId, aliceId).andExpect(status().isOk());
        verify(sessionId, recordId, bobId).andExpect(status().isOk());
        assertThat(verificationRepository.count()).isEqualTo(2);

        as(aliceId, post("/api/sessions/{id}/records/changes", sessionId)
                .content(toJson(Map.of("add", List.of(), "update", List.of(), "delete", List.of(recordId)))))
                .andExpect(status().isOk());

        assertThat(verificationRepository.count()).isZero();
    }

    // ---- two at once ------------------------------------------------------------------------------

    private <T> List<T> inParallel(List<Callable<T>> tasks) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(tasks.size());
        CyclicBarrier barrier = new CyclicBarrier(tasks.size());
        try {
            List<Future<T>> futures = new ArrayList<>();
            for (Callable<T> task : tasks) {
                futures.add(pool.submit(() -> {
                    barrier.await();
                    return task.call();
                }));
            }
            List<T> results = new ArrayList<>();
            for (Future<T> f : futures) {
                results.add(f.get());
            }
            return results;
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void threePlayersConfirmingAtTheSameInstant_allThreeAreStoredOnce() throws Exception {
        Long sessionId = ongoing();
        Long recordId = addGame(sessionId, aliceId, 21, 18);
        propose(sessionId, recordId, aliceId).andExpect(status().isOk());

        List<Integer> statuses = inParallel(List.of(
                () -> verify(sessionId, recordId, bobId).andReturn().getResponse().getStatus(),
                () -> verify(sessionId, recordId, carolId).andReturn().getResponse().getStatus(),
                () -> verify(sessionId, recordId, danId).andReturn().getResponse().getStatus()));

        assertThat(statuses).containsOnly(200);
        assertThat(verificationRepository.count()).isEqualTo(4);
        assertThat(ranking(sessionId, recordId, hostId).path("status").asText()).isEqualTo("VERIFIED");
    }

    @Test
    void theSamePlayerConfirmingTwiceAtTheSameInstant_leavesOneRowAndNoError() throws Exception {
        Long sessionId = ongoing();
        Long recordId = addGame(sessionId, aliceId, 21, 18);
        propose(sessionId, recordId, aliceId).andExpect(status().isOk());

        List<Integer> statuses = inParallel(List.of(
                () -> verify(sessionId, recordId, bobId).andReturn().getResponse().getStatus(),
                () -> verify(sessionId, recordId, bobId).andReturn().getResponse().getStatus()));

        assertThat(statuses).containsOnly(200);
        assertThat(verificationRepository.findAll().stream().filter(v -> v.getUserId().equals(bobId))).hasSize(1);
    }

    @Test
    void aConfirmRacingAnEdit_endsInEitherOrder_withoutAnErrorOrAWrongVerifiedState() throws Exception {
        Long sessionId = ongoing();
        Long recordId = addGame(sessionId, aliceId, 21, 18);
        propose(sessionId, recordId, aliceId).andExpect(status().isOk());

        List<Integer> statuses = inParallel(List.of(
                () -> verify(sessionId, recordId, bobId).andReturn().getResponse().getStatus(),
                () -> updateGame(sessionId, carolId, recordId, 21, 7).andReturn().getResponse().getStatus()));

        assertThat(statuses).containsOnly(200);
        JsonNode state = ranking(sessionId, recordId, hostId);
        assertThat(state.path("status").asText()).isEqualTo("PROPOSED");
        // alice confirmed revision 1; the edit made it stale. bob's confirmation counts only if it ran after the edit.
        assertThat(confirmed(state)).isSubsetOf(bobId);
        assertThat(recordRepository.findById(recordId).orElseThrow().getRevision()).isEqualTo(2);
    }
}
