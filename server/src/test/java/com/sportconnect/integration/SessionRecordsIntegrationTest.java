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
import com.sportconnect.session.record.SessionRecordRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
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

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-50 - real-pipeline coverage of the session result records: a real {@code MockMvc} request
 * through {@code SessionRecordController}, {@code SessionRecordServiceImpl}, {@code SessionRecordGate},
 * {@code GroupServiceImpl}, {@code SportServiceImpl}, the request-size filter and
 * {@code GlobalExceptionHandler}, against the real (H2) schema. Covers the access boundary, the
 * status and 24-hour window, the limits, the change-set lifecycle, retries, and
 * parallel change sets. Note: this suite runs on H2, so the parallel tests prove the portable JPA
 * logic and not PostgreSQL's row-lock behaviour.
 */
class SessionRecordsIntegrationTest extends BaseIT {

    private static final Integer ROLE_OWNER = 1;
    private static final Integer ROLE_MEMBER = 3;

    @Autowired private SessionRepository sessionRepository;
    @Autowired private SessionParticipantRepository participantRepository;
    @Autowired private SessionRecordRepository recordRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private GroupMemberRepository groupMemberRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private SportRepository sportRepository;
    @Autowired private CacheManager cacheManager;

    private final AtomicLong postIdSeq = new AtomicLong(1);

    private UUID hostId;
    private UUID aliceId;      // JOINED in both sessions, group member
    private UUID bobId;        // JOINED in both sessions, group member
    private UUID carolId;      // group member only: never joined any session
    private UUID requestedId;  // REQUESTED in the standalone session
    private UUID outsiderId;
    private Long sportId;
    private Long groupId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        hostId = createUser("host");
        aliceId = createUser("alice");
        bobId = createUser("bob");
        carolId = createUser("carol");
        requestedId = createUser("requested");
        outsiderId = createUser("outsider");
        sportId = sportRepository.save(Sport.builder().name("SESSION-50 " + UUID.randomUUID()).isActive(true)
                .resultSchema(Map.of("kind", "MATCH", "maxRecords", 100)).build()).getId();
        evictSportCache();
        groupId = groupRepository.save(Group.builder().groupName("Records " + UUID.randomUUID())
                .createdBy(hostId).isPrivate(true).isActive(true).build()).getId();
        addGroupMember(hostId, ROLE_OWNER);
        addGroupMember(aliceId, ROLE_MEMBER);
        addGroupMember(bobId, ROLE_MEMBER);
        addGroupMember(carolId, ROLE_MEMBER);
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
        evictSportCache();
    }

    private void clearAll() {
        recordRepository.deleteAll();
        participantRepository.deleteAll();
        sessionRepository.deleteAll();
        groupMemberRepository.deleteAll();
        groupRepository.deleteAll();
        userRepository.deleteAll();
        sportRepository.deleteAll();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
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

    private void addGroupMember(UUID userId, Integer roleId) {
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(userId).roleId(roleId).build());
    }

    private void join(Long sessionId, UUID userId, ParticipantStatus status) {
        participantRepository.save(SessionParticipant.builder().sessionId(sessionId).userId(userId).status(status).build());
    }

    /** A session whose end is {@code endsInSeconds} from now (negative: it ended that long ago). */
    private Long seedSession(Long sessionGroupId, SessionStatus status, long endsInSeconds) {
        Instant end = Instant.now().plusSeconds(endsInSeconds);
        Long id = sessionRepository.save(Session.builder().title("Records session")
                .groupId(sessionGroupId)
                .isPublic(sessionGroupId == null)
                .postId(postIdSeq.getAndIncrement())
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
        join(id, hostId, ParticipantStatus.JOINED);
        join(id, aliceId, ParticipantStatus.JOINED);
        join(id, bobId, ParticipantStatus.JOINED);
        return id;
    }

    private Long ongoingStandalone() {
        Long id = seedSession(null, SessionStatus.ONGOING, 3600);
        join(id, requestedId, ParticipantStatus.REQUESTED);
        return id;
    }

    private Long ongoingGroup() {
        return seedSession(groupId, SessionStatus.ONGOING, 3600);
    }

    private Map<String, Object> add(UUID ref, List<UUID> players, Map<String, Object> data) {
        return Map.of("clientRef", ref.toString(), "playerIds", players.stream().map(UUID::toString).toList(), "data", data);
    }

    private Map<String, Object> add(List<UUID> players) {
        return add(UUID.randomUUID(), players, Map.of("winner", 1));
    }

    private String changes(List<Map<String, Object>> adds, List<Map<String, Object>> updates, List<Long> deletes) throws Exception {
        return toJson(Map.of("add", adds, "update", updates, "delete", deletes));
    }

    private String addChange(UUID... players) throws Exception {
        return changes(List.of(add(List.of(players))), List.of(), List.of());
    }

    private org.springframework.test.web.servlet.ResultActions send(Long sessionId, String body) throws Exception {
        return mockMvc.perform(post("/api/sessions/{id}/records/changes", sessionId)
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    // -- access boundary ------------------------------------------------------------------------

    @Test
    void standaloneJoinedParticipant_canAddAndReadRecords() throws Exception {
        Long sessionId = ongoingStandalone();
        authenticateAs(aliceId);

        MvcResult added = send(sessionId, addChange(aliceId, bobId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.results[0].status").value("CREATED"))
                .andExpect(jsonPath("$.data.records.length()").value(1))
                .andExpect(jsonPath("$.data.records[0].data.winner").value(1))
                .andExpect(jsonPath("$.data.records[0].createdBy").value(aliceId.toString()))
                .andReturn();
        long id = json(added).at("/data/results/0/id").asLong();

        mockMvc.perform(get("/api/sessions/{id}/records", sessionId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].id").value(id))
                .andExpect(jsonPath("$.data[0].data.winner").value(1))
                .andExpect(jsonPath("$.data[0].players").doesNotExist());
    }

    @Test
    void groupMemberWhoNeverJoined_canLogForTheGroupSession_withJoinedPlayers() throws Exception {
        Long sessionId = ongoingGroup();
        authenticateAs(carolId);

        send(sessionId, addChange(aliceId, bobId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.results[0].status").value("CREATED"));
    }

    @Test
    void groupMemberWhoNeverJoined_cannotBeNamedAsAPlayer() throws Exception {
        Long sessionId = ongoingGroup();
        authenticateAs(aliceId);

        send(sessionId, addChange(aliceId, carolId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.results[0].status").value("REJECTED"))
                .andExpect(jsonPath("$.data.results[0].errorCode").value("SESSION_RECORD_PLAYER_NOT_JOINED"));
        assertThat(recordRepository.count()).isZero();
    }

    @Test
    void outsider_isForbiddenFromAStandaloneSession() throws Exception {
        Long sessionId = ongoingStandalone();
        authenticateAs(outsiderId);

        send(sessionId, addChange(aliceId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_NOT_ALLOWED"));
        assertThat(recordRepository.count()).isZero();
    }

    @Test
    void requestedParticipant_isForbiddenFromReadingAStandaloneSession() throws Exception {
        Long sessionId = ongoingStandalone();
        authenticateAs(requestedId);

        mockMvc.perform(get("/api/sessions/{id}/records", sessionId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_NOT_ALLOWED"));
    }

    @Test
    void requestedParticipant_isForbiddenFromWriting() throws Exception {
        Long sessionId = ongoingStandalone();
        authenticateAs(requestedId);

        send(sessionId, addChange(aliceId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_NOT_ALLOWED"));
    }

    @Test
    void nonMember_isForbiddenFromAGroupSession() throws Exception {
        Long sessionId = ongoingGroup();
        authenticateAs(outsiderId);

        mockMvc.perform(get("/api/sessions/{id}/records", sessionId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_NOT_ALLOWED"));
    }

    @Test
    void missingSession_is404SessionNotFound() throws Exception {
        authenticateAs(aliceId);

        send(999999L, addChange(aliceId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SESSION_NOT_FOUND"));
    }

    @Test
    void sessionOfADeletedGroup_is404SessionNotFound() throws Exception {
        Long sessionId = ongoingGroup();
        Group group = groupRepository.findById(groupId).orElseThrow();
        group.setIsActive(false);
        groupRepository.save(group);
        authenticateAs(aliceId);

        send(sessionId, addChange(aliceId))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SESSION_NOT_FOUND"));
    }

    // -- status, window, sport ------------------------------------------------------------------

    @Test
    void sessionThatIsNotOngoingOrCompleted_isNotLoggable() throws Exception {
        for (SessionStatus status : List.of(SessionStatus.PREPARING, SessionStatus.SCHEDULED, SessionStatus.CANCELLED)) {
            Long sessionId = seedSession(null, status, 3600);
            authenticateAs(aliceId);
            send(sessionId, addChange(aliceId))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_NOT_LOGGABLE"));
        }
        assertThat(recordRepository.count()).isZero();
    }

    @Test
    void completedSession_23HoursAfterItsEnd_stillAcceptsChanges() throws Exception {
        Long sessionId = seedSession(null, SessionStatus.COMPLETED, -Duration.ofHours(23).toSeconds());
        authenticateAs(aliceId);

        send(sessionId, addChange(aliceId, bobId)).andExpect(status().isOk());
    }

    @Test
    void completedSession_25HoursAfterItsEnd_refusesAddsUpdatesAndDeletes() throws Exception {
        Long sessionId = seedSession(null, SessionStatus.COMPLETED, -Duration.ofHours(25).toSeconds());
        authenticateAs(aliceId);

        send(sessionId, addChange(aliceId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_WINDOW_CLOSED"));
        send(sessionId, changes(List.of(), List.of(), List.of(1L)))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_WINDOW_CLOSED"));
    }

    @Test
    void readsStayOpenAfterTheWindow() throws Exception {
        Long sessionId = seedSession(null, SessionStatus.COMPLETED, -Duration.ofHours(48).toSeconds());
        authenticateAs(aliceId);

        mockMvc.perform(get("/api/sessions/{id}/records", sessionId)).andExpect(status().isOk());
    }

    @Test
    void sportWithoutAResultSchema_isNotLoggable() throws Exception {
        Long sessionId = ongoingStandalone();
        Sport sport = sportRepository.findById(sportId).orElseThrow();
        sport.setResultSchema(null);
        sportRepository.save(sport);
        evictSportCache();
        authenticateAs(aliceId);

        send(sessionId, addChange(aliceId))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_NOT_LOGGABLE"));
    }

    // -- limits ---------------------------------------------------------------------------------

    @Test
    void changeSetPastTheSportsMaxRecords_storesWhatFitsAndRejectsTheRest() throws Exception {
        Long sessionId = ongoingStandalone();
        Sport sport = sportRepository.findById(sportId).orElseThrow();
        sport.setResultSchema(Map.of("kind", "MATCH", "maxRecords", 2));
        sportRepository.save(sport);
        evictSportCache();
        authenticateAs(aliceId);

        send(sessionId, changes(List.of(add(List.of(aliceId)), add(List.of(bobId)), add(List.of(hostId))), List.of(), List.of()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.results[0].status").value("CREATED"))
                .andExpect(jsonPath("$.data.results[1].status").value("CREATED"))
                .andExpect(jsonPath("$.data.results[2].status").value("REJECTED"))
                .andExpect(jsonPath("$.data.results[2].errorCode").value("SESSION_RECORD_LIMIT_REACHED"))
                .andExpect(jsonPath("$.data.results[2].errorParams.maxRecords").value(2));
        assertThat(recordRepository.count()).isEqualTo(2);
    }

    @Test
    void recordLargerThan4KB_isRejectedAlone_andTheValidOneBesideItIsStored() throws Exception {
        Long sessionId = ongoingStandalone();
        authenticateAs(aliceId);

        send(sessionId, changes(List.of(add(UUID.randomUUID(), List.of(aliceId), Map.of("note", "x".repeat(5000))),
                add(List.of(bobId))), List.of(), List.of()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.results[0].status").value("REJECTED"))
                .andExpect(jsonPath("$.data.results[0].errorCode").value("SESSION_RECORD_TOO_LARGE"))
                .andExpect(jsonPath("$.data.results[0].errorParams.maxBytes").value(4096))
                .andExpect(jsonPath("$.data.results[1].status").value("CREATED"));
        assertThat(recordRepository.count()).isEqualTo(1);
    }

    @Test
    void theRecordAfterTheSportsMaxRecords_isRefusedCountingTheStoredOnes() throws Exception {
        Long sessionId = ongoingStandalone();
        Sport sport = sportRepository.findById(sportId).orElseThrow();
        sport.setResultSchema(Map.of("kind", "MATCH", "maxRecords", 2));
        sportRepository.save(sport);
        evictSportCache();
        authenticateAs(aliceId);

        send(sessionId, addChange(aliceId)).andExpect(status().isOk());
        send(sessionId, addChange(bobId)).andExpect(status().isOk());

        // The 3rd record, in a request of its own, counts the two already stored.
        send(sessionId, addChange(aliceId, bobId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.results[0].status").value("REJECTED"))
                .andExpect(jsonPath("$.data.results[0].errorCode").value("SESSION_RECORD_LIMIT_REACHED"))
                .andExpect(jsonPath("$.data.results[0].errorParams.maxRecords").value(2));
        assertThat(recordRepository.count()).isEqualTo(2);
    }

    @Test
    void requestBodyOver64KB_isRefusedBeforeParsing() throws Exception {
        Long sessionId = ongoingStandalone();
        authenticateAs(aliceId);
        String body = "{\"add\":[],\"padding\":\"" + "x".repeat(70 * 1024) + "\"}";

        send(sessionId, body)
                .andExpect(status().isPayloadTooLarge())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECORD_TOO_LARGE"));
    }

    @Test
    void oneInvalidRecord_isReportedAndTheValidOnesAreStored() throws Exception {
        Long sessionId = ongoingStandalone();
        authenticateAs(aliceId);
        // The first add is fine; the second names a player who never joined.
        String body = changes(List.of(add(List.of(aliceId, bobId)), add(List.of(aliceId, outsiderId))), List.of(), List.of());

        send(sessionId, body)
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.results[0].status").value("CREATED"))
                .andExpect(jsonPath("$.data.results[1].status").value("REJECTED"))
                .andExpect(jsonPath("$.data.results[1].clientRef").isNotEmpty())
                .andExpect(jsonPath("$.data.results[1].errorCode").value("SESSION_RECORD_PLAYER_NOT_JOINED"))
                .andExpect(jsonPath("$.data.records.length()").value(1));
        assertThat(recordRepository.count()).isEqualTo(1);
    }

    // -- lifecycle, retries --------------------------------------------------------------

    @Test
    void addUpdateDelete_lifecycle_restoresAsNewRecord() throws Exception {
        Long sessionId = ongoingStandalone();
        authenticateAs(aliceId);

        long id = json(send(sessionId, addChange(aliceId, bobId)).andExpect(status().isOk()).andReturn())
                .at("/data/results/0/id").asLong();

        send(sessionId, changes(List.of(), List.of(Map.of("id", id, "playerIds", List.of(aliceId.toString()),
                "data", Map.of("winner", 2))), List.of()))
                .andExpect(jsonPath("$.data.results[0].status").value("UPDATED"))
                .andExpect(jsonPath("$.data.results[0].id").value(id))
                .andExpect(jsonPath("$.data.records[0].data.winner").value(2));

        send(sessionId, changes(List.of(), List.of(), List.of(id)))
                .andExpect(jsonPath("$.data.results[0].status").value("DELETED"))
                .andExpect(jsonPath("$.data.records.length()").value(0));

        // Deleting it again changes nothing and is not an error.
        send(sessionId, changes(List.of(), List.of(), List.of(id)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.results[0].status").value("UNCHANGED"));

        // An update arriving after the delete restores it as a new record (the later request wins).
        MvcResult restored = send(sessionId, changes(List.of(), List.of(Map.of("id", id, "playerIds",
                List.of(aliceId.toString(), bobId.toString()), "data", Map.of("winner", 1))), List.of()))
                .andExpect(jsonPath("$.data.results[0].status").value("RESTORED"))
                .andExpect(jsonPath("$.data.records.length()").value(1))
                .andReturn();
        assertThat(json(restored).at("/data/results/0/id").asLong()).isNotEqualTo(id);

        // The deleted record is gone for good: one live row, under the new id, no trace of the old one.
        assertThat(recordRepository.findBySessionIdOrderByIdAsc(sessionId))
                .extracting(com.sportconnect.session.record.SessionRecord::getId)
                .containsExactly(json(restored).at("/data/results/0/id").asLong());
    }

    @Test
    void updateThenDelete_endsDeleted_andDeleteThenUpdate_endsRestored() throws Exception {
        Long sessionId = ongoingStandalone();
        authenticateAs(aliceId);
        long id = json(send(sessionId, addChange(aliceId)).andReturn()).at("/data/results/0/id").asLong();
        Map<String, Object> update = Map.of("id", id, "playerIds", List.of(aliceId.toString()), "data", Map.of("winner", 2));

        // update then delete (two requests in that order) -> gone
        send(sessionId, changes(List.of(), List.of(update), List.of())).andExpect(status().isOk());
        send(sessionId, changes(List.of(), List.of(), List.of(id))).andExpect(status().isOk());
        assertThat(recordRepository.count()).isZero();

        // delete then update -> one live record again, under a new id
        send(sessionId, changes(List.of(), List.of(update), List.of())).andExpect(status().isOk());
        assertThat(recordRepository.count()).isEqualTo(1);
    }

    @Test
    void anIdBothUpdatedAndDeletedInOneChangeSet_isDeleted() throws Exception {
        Long sessionId = ongoingStandalone();
        authenticateAs(aliceId);
        long id = json(send(sessionId, addChange(aliceId)).andReturn()).at("/data/results/0/id").asLong();

        send(sessionId, changes(List.of(), List.of(Map.of("id", id, "playerIds", List.of(aliceId.toString()),
                "data", Map.of("winner", 2))), List.of(id)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.results[0].status").value("UNCHANGED"))
                .andExpect(jsonPath("$.data.results[1].status").value("DELETED"))
                .andExpect(jsonPath("$.data.records.length()").value(0));
    }

    @Test
    void retriedAddWithTheSameClientRef_createsNoDuplicate() throws Exception {
        Long sessionId = ongoingStandalone();
        authenticateAs(aliceId);
        String body = addChange(aliceId, bobId);

        long first = json(send(sessionId, body).andExpect(status().isOk()).andReturn()).at("/data/results/0/id").asLong();
        MvcResult retry = send(sessionId, body).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.results[0].status").value("UNCHANGED"))
                .andReturn();

        assertThat(json(retry).at("/data/results/0/id").asLong()).isEqualTo(first);
        assertThat(recordRepository.count()).isEqualTo(1);
    }

    @Test
    void mixedChangeSet_appliesAddsUpdatesAndDeletesTogether() throws Exception {
        Long sessionId = ongoingStandalone();
        authenticateAs(aliceId);
        MvcResult seeded = send(sessionId, changes(List.of(add(List.of(aliceId)), add(List.of(bobId))), List.of(), List.of()))
                .andReturn();
        long keep = json(seeded).at("/data/results/0/id").asLong();
        long drop = json(seeded).at("/data/results/1/id").asLong();

        send(sessionId, changes(List.of(add(List.of(hostId))),
                List.of(Map.of("id", keep, "playerIds", List.of(aliceId.toString()), "data", Map.of("winner", 2))),
                List.of(drop)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.results[0].status").value("CREATED"))
                .andExpect(jsonPath("$.data.results[1].status").value("UPDATED"))
                .andExpect(jsonPath("$.data.results[2].status").value("DELETED"))
                .andExpect(jsonPath("$.data.records.length()").value(2));
    }

    // -- concurrency ----------------------------------------------------------------------------

    @Test
    void parallelChangeSets_allSucceedWithDistinctIds() throws Exception {
        Long sessionId = ongoingStandalone();
        int threads = 8;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            List<Callable<Integer>> jobs = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                String body = addChange(i % 2 == 0 ? aliceId : bobId);
                jobs.add(() -> {
                    authenticateAs(aliceId);
                    MvcResult result = send(sessionId, body).andReturn();
                    return result.getResponse().getStatus();
                });
            }
            List<Integer> statuses = new ArrayList<>();
            for (Future<Integer> f : pool.invokeAll(jobs)) {
                statuses.add(f.get());
            }
            assertThat(statuses).containsOnly(200);
        } finally {
            pool.shutdownNow();
        }

        Set<Long> ids = new HashSet<>();
        recordRepository.findBySessionIdOrderByIdAsc(sessionId).forEach(r -> ids.add(r.getId()));
        assertThat(ids).hasSize(threads);
    }

    @Test
    void parallelUpdateAndDeleteOfTheSameRecord_neverError_andEndConsistent() throws Exception {
        Long sessionId = ongoingStandalone();
        long id = recordRepository.save(com.sportconnect.session.record.SessionRecord.builder()
                .sessionId(sessionId).data(Map.of("winner", 1))
                .clientRequestId(UUID.randomUUID()).createdBy(aliceId).createdAt(Instant.now())
                .updatedBy(aliceId).updatedAt(Instant.now()).build()).getId();
        String update = changes(List.of(), List.of(Map.of("id", id, "playerIds", List.of(aliceId.toString()),
                "data", Map.of("winner", 2))), List.of());
        String delete = changes(List.of(), List.of(), List.of(id));

        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Callable<Integer>> jobs = List.of(
                    () -> { authenticateAs(aliceId); return send(sessionId, update).andReturn().getResponse().getStatus(); },
                    () -> { authenticateAs(bobId); return send(sessionId, delete).andReturn().getResponse().getStatus(); });
            for (Future<Integer> f : pool.invokeAll(jobs)) {
                assertThat(f.get()).isEqualTo(200);
            }
        } finally {
            pool.shutdownNow();
        }

        // Either order is valid: deleted (update first) or restored as a single new record (delete first).
        assertThat(recordRepository.countBySessionId(sessionId)).isBetween(0L, 1L);
    }
}
