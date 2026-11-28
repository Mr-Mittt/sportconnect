package com.sportconnect.integration;

import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberNumberCounterRepository;
import com.sportconnect.group.repository.GroupMemberNumberRepository;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.location.entity.Location;
import com.sportconnect.location.repository.LocationRepository;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.SeasonCollectionMode;
import com.sportconnect.session.api.dto.SeasonLinksRequest;
import com.sportconnect.session.api.dto.SeasonStatus;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.api.service.GroupSeasonService;
import com.sportconnect.session.entity.GroupSessionSettings;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.record.SessionRecord;
import com.sportconnect.session.record.SessionRecordRepository;
import com.sportconnect.session.repository.GroupSessionSettingsRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.session.season.GroupSeason;
import com.sportconnect.session.season.GroupSeasonRepository;
import com.sportconnect.session.season.GroupSeasonSession;
import com.sportconnect.session.season.GroupSeasonSessionRepository;
import com.sportconnect.session.season.SeasonTransitions;
import com.sportconnect.session.stats.GroupH2hDoc;
import com.sportconnect.session.stats.GroupMemberStats;
import com.sportconnect.session.stats.GroupMemberStatsRepository;
import com.sportconnect.session.stats.GroupStatsDoc;
import com.sportconnect.session.stats.GroupStatsRepository;
import com.sportconnect.session.stats.SeasonMemberStats;
import com.sportconnect.session.stats.SeasonMemberStatsRepository;
import com.sportconnect.session.stats.SeasonStats;
import com.sportconnect.session.stats.SeasonStatsCounter;
import com.sportconnect.session.stats.SeasonStatsRepository;
import com.sportconnect.session.stats.SessionStatsJobRepository;
import com.sportconnect.session.stats.SessionStatsRunner;
import com.sportconnect.session.stats.StatBoardChangeRepository;
import com.sportconnect.session.stats.StatBoardRunRepository;
import com.sportconnect.session.stats.UserSportStatsRepository;
import com.sportconnect.social.post.api.dto.PostType;
import com.sportconnect.social.post.api.dto.SystemCode;
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

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-55 slice 2: what a season counts, through the real Spring context and the H2 schema. A completed group session the statistics engine
 * counts is counted, in the same transaction, into every {@code ONGOING} or {@code COMPLETED} season that wants it (AUTO: its start inside the
 * season's range; MANUAL: linked), exactly as the group's own member row, partners and head-to-head are counted, through the season's own stat
 * list and whether or not the group's statistics switch is on. The season's ledger makes a repeat a no-op; unlinking a session subtracts exactly
 * what it added; finalising sweeps the sessions the engine has not counted yet straight into the season without touching their job row.
 *
 * <p>Seasons are written through the repository (the creation rules are {@code GroupSeasonIntegrationTest}'s), with their own stat list. Threads
 * on H2 in one JVM prove the portable lock and ledger logic, not PostgreSQL's own lock behaviour.
 */
class SeasonCountingIntegrationTest extends RedisBaseIT {

    private static final Integer ROLE_OWNER = 1;
    private static final Integer ROLE_ADMIN = 2;
    private static final Integer ROLE_MEMBER = 3;

    @Autowired private SessionStatsRunner runner;
    @Autowired private SeasonStatsCounter counter;
    @Autowired private com.sportconnect.session.season.SeasonRowLock rowLock;
    @Autowired private org.springframework.transaction.PlatformTransactionManager transactionManager;
    @Autowired private SeasonTransitions transitions;
    @Autowired private GroupSeasonService seasonService;
    @Autowired private GroupSeasonRepository seasonRepository;
    @Autowired private GroupSeasonSessionRepository linkRepository;
    @Autowired private SeasonMemberStatsRepository seasonMemberRepository;
    @Autowired private SeasonStatsRepository seasonH2hRepository;
    @Autowired private SessionStatsJobRepository jobRepository;
    @Autowired private UserSportStatsRepository userStatsRepository;
    @Autowired private GroupMemberStatsRepository groupMemberStatsRepository;
    @Autowired private GroupStatsRepository groupH2hRepository;
    @Autowired private GroupMemberNumberRepository memberNumberRepository;
    @Autowired private GroupMemberNumberCounterRepository memberNumberCounterRepository;
    @Autowired private StatBoardChangeRepository boardChangeRepository;
    @Autowired private StatBoardRunRepository boardRunRepository;
    @Autowired private SessionRepository sessionRepository;
    @Autowired private SessionParticipantRepository participantRepository;
    @Autowired private SessionRecordRepository recordRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private GroupSessionSettingsRepository groupSettingsRepository;
    @Autowired private GroupMemberRepository groupMemberRepository;
    @Autowired private LocationRepository locationRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private SportRepository sportRepository;
    @Autowired private PostRepository postRepository;
    @Autowired private CommentRepository commentRepository;
    @Autowired private CacheManager cacheManager;

    private UUID hostId;
    private UUID adminId;
    private UUID plainMemberId;
    private UUID aliceId;
    private UUID bobId;
    private UUID carolId;
    private UUID danId;
    private UUID outsiderId;
    private Long sportId;
    private Long groupId;
    private Long venueId;

    @BeforeEach
    void setUp() {
        clearAll();
        hostId = createUserWithRoles(true, "USER");
        adminId = createUserWithRoles(true, "USER");
        plainMemberId = createUserWithRoles(true, "USER");
        aliceId = createUser("alice");
        bobId = createUser("bob");
        carolId = createUser("carol");
        danId = createUser("dan");
        outsiderId = createUserWithRoles(true, "USER");
        sportId = sportRepository.save(Sport.builder().name("SESSION-55 stats " + UUID.randomUUID()).isActive(true)
                .statisticsEnabled(true).resultSchema(badmintonSchema()).build()).getId();
        evictSportCache();
        groupId = groupRepository.save(Group.builder().countryId(1L).regionId(1L).groupName("Season stats " + UUID.randomUUID())
                .createdBy(hostId).isPrivate(true).isActive(true).sportId(sportId).build()).getId();
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(hostId).roleId(ROLE_OWNER).build());
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(adminId).roleId(ROLE_ADMIN).build());
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(plainMemberId).roleId(ROLE_MEMBER).build());
        for (UUID member : List.of(aliceId, bobId, carolId, danId)) {
            groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(member).roleId(ROLE_MEMBER).build());
        }
        groupSettingsRepository.save(GroupSessionSettings.builder().groupId(groupId).statisticsEnabled(true).build());
        venueId = locationRepository.save(Location.builder().sportId(sportId).name("Venue " + UUID.randomUUID())
                .timezone("Asia/Ho_Chi_Minh").createdBy(hostId).build()).getId();
    }

    @AfterEach
    void tearDown() {
        clearAll();
    }

    private void clearAll() {
        seasonMemberRepository.deleteAll();
        seasonH2hRepository.deleteAll();
        linkRepository.deleteAll();
        seasonRepository.deleteAll();
        boardRunRepository.deleteAll();
        boardChangeRepository.deleteAll();
        groupH2hRepository.deleteAll();
        memberNumberRepository.deleteAll();
        memberNumberCounterRepository.deleteAll();
        groupMemberStatsRepository.deleteAll();
        userStatsRepository.deleteAll();
        jobRepository.deleteAll();
        commentRepository.deleteAll();
        recordRepository.deleteAll();
        participantRepository.deleteAll();
        sessionRepository.deleteAll();
        groupMemberRepository.deleteAll();
        groupSettingsRepository.deleteAll();
        groupRepository.deleteAll();
        locationRepository.deleteAll();
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

    // ---- the engine counts a session into the seasons that want it -----------------------------------------------------------

    @Test
    void anOngoingAutoSeason_countsASessionTheEngineCounts_asTheGroupDoes_andRemembersItInItsLedger() {
        GroupSeason season = season(SeasonStatus.ONGOING, SeasonCollectionMode.AUTO, -10, 10);
        Long sessionId = completedSession(2);
        Long won = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        Long lost = game(sessionId, List.of(carolId, danId), List.of(aliceId, bobId), 21, 18);

        assertThat(runner.processDue()).isEqualTo(1);

        GroupStatsDoc alice = seasonDoc(season.getId(), aliceId);
        assertThat(alice.counters().value("games")).isEqualTo(2.0);
        assertThat(alice.counters().value("wins")).isEqualTo(1.0);
        assertThat(alice.counters().value("scoreFor")).isEqualTo(39.0);
        assertThat(alice.counters().value("sessions")).isEqualTo(1.0);
        assertThat(alice.groupings().get("PARTNER")).hasSize(1);
        assertThat(alice.hasPointer(won)).isTrue();
        assertThat(alice.hasPointer(lost)).isTrue();
        // the group's own member row counts the same, through the group's list: the season is the same numbers for the same games
        GroupStatsDoc groupAlice = GroupStatsDoc.read(groupMemberStatsRepository.findByGroupIdAndSportId(groupId, sportId).stream()
                .filter(row -> row.getUserId().equals(aliceId)).findFirst().orElseThrow());
        assertThat(groupAlice.counters().encode()).isEqualTo(alice.counters().encode());
        // the head-to-head of the two pairs
        GroupH2hDoc h2h = GroupH2hDoc.read(seasonH2hRepository.findById(season.getId()).orElseThrow());
        assertThat(h2h.size()).isEqualTo(1);
        // the ledger holds the session with its records and the players given a sessions count
        Map<String, Object> entry = ledgerEntry(season.getId(), sessionId);
        assertThat((List<?>) entry.get("g")).hasSize(2);
        assertThat((List<?>) entry.get("p")).hasSize(5);   // the host and the four players were JOINED
        // the job row says the engine's own counting is untouched by the season
        assertThat(jobRepository.findById(sessionId).orElseThrow().getCounted()).isEqualTo(2);
    }

    @Test
    void aSeasonThatIsNotCounting_orWhoseRangeMissesTheSession_orWhoseModeIsManualWithNoLink_countsNothing() {
        GroupSeason scheduled = season(SeasonStatus.SCHEDULED, SeasonCollectionMode.AUTO, -10, 10);
        GroupSeason cancelled = season(SeasonStatus.CANCELLED, SeasonCollectionMode.AUTO, -10, 10);
        GroupSeason finalised = season(SeasonStatus.FINALISED, SeasonCollectionMode.AUTO, -10, 10);
        GroupSeason elsewhere = season(SeasonStatus.ONGOING, SeasonCollectionMode.AUTO, 3, 8);          // starts after the session
        GroupSeason manualNoLink = season(SeasonStatus.ONGOING, SeasonCollectionMode.MANUAL, -10, 10);
        GroupSeason counting = season(SeasonStatus.COMPLETED, SeasonCollectionMode.AUTO, -10, 10);     // COMPLETED still counts
        Long sessionId = completedSession(2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        runner.processDue();

        for (GroupSeason none : List.of(scheduled, cancelled, finalised, elsewhere, manualNoLink)) {
            assertThat(seasonMemberRepository.findBySeasonId(none.getId())).as("season %s", none.getStatus()).isEmpty();
            assertThat(reload(none.getId()).getCountedSessions()).isEmpty();
        }
        assertThat(seasonMemberRepository.findBySeasonId(counting.getId())).isNotEmpty();
    }

    @Test
    void aManualSeasonCountsOnlyTheSessionsLinkedToIt() {
        GroupSeason manual = season(SeasonStatus.ONGOING, SeasonCollectionMode.MANUAL, -10, 10);
        Long linked = completedSession(2);
        game(linked, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        Long notLinked = completedSession(3);
        game(notLinked, List.of(aliceId, bobId), List.of(carolId, danId), 21, 12);
        linkRepository.save(new GroupSeasonSession(manual.getId(), linked, hostId, Instant.now()));

        runner.processDue();

        assertThat(seasonDoc(manual.getId(), aliceId).counters().value("games")).isEqualTo(1.0);
        assertThat(reload(manual.getId()).getCountedSessions()).containsOnlyKeys(String.valueOf(linked));
    }

    @Test
    void aSeasonKeepsCounting_whenTheGroupSwitchesItsStatisticsOff() {
        GroupSessionSettings settings = groupSettingsRepository.findById(groupId).orElseThrow();
        settings.setStatisticsEnabled(false);
        groupSettingsRepository.save(settings);
        GroupSeason season = season(SeasonStatus.ONGOING, SeasonCollectionMode.AUTO, -10, 10);
        Long sessionId = completedSession(2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        runner.processDue();

        assertThat(groupMemberStatsRepository.findByGroupIdAndSportId(groupId, sportId)).isEmpty();
        assertThat(seasonDoc(season.getId(), aliceId).counters().value("games")).isEqualTo(1.0);
    }

    @Test
    void countingTheSameSessionAgain_changesNothing_theLedgerIsTheGuard() {
        GroupSeason season = season(SeasonStatus.ONGOING, SeasonCollectionMode.AUTO, -10, 10);
        Long sessionId = completedSession(2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        runner.processDue();
        String before = rowsOf(season.getId());

        assertThat(counter.countSession(sessionRepository.findById(sessionId).orElseThrow())).isZero();

        assertThat(rowsOf(season.getId())).isEqualTo(before);
        assertThat(seasonDoc(season.getId(), aliceId).counters().value("games")).isEqualTo(1.0);
    }

    @Test
    void aLinkOutsideTheSeasonsRange_isNeverCounted_evenWhenTheRowIsThere() {
        GroupSeason manual = season(SeasonStatus.ONGOING, SeasonCollectionMode.MANUAL, 3, 8);        // starts after the session
        Long sessionId = completedSession(2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        // written straight to the table: the API refuses such a link, the counter must not trust the row
        linkRepository.save(new GroupSeasonSession(manual.getId(), sessionId, hostId, Instant.now()));

        runner.processDue();

        assertThat(seasonMemberRepository.findBySeasonId(manual.getId())).isEmpty();
        assertThat(reload(manual.getId()).getCountedSessions()).isEmpty();
    }

    @Test
    void aSessionUnlinkedWhileTheEngineWaitsForTheSeasonsLock_isNotCounted() throws Exception {
        GroupSeason manual = season(SeasonStatus.ONGOING, SeasonCollectionMode.MANUAL, -10, 10);
        Long sessionId = completedSession(2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        linkRepository.save(new GroupSeasonSession(manual.getId(), sessionId, hostId, Instant.now()));
        Session session = sessionRepository.findById(sessionId).orElseThrow();
        org.springframework.transaction.support.TransactionTemplate template =
                new org.springframework.transaction.support.TransactionTemplate(transactionManager);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CyclicBarrier locked = new CyclicBarrier(2);
        Future<?> owner = pool.submit(() -> template.executeWithoutResult(tx -> {
            rowLock.lock(manual.getId());                       // the owner holds the season's row and unlinks, not yet committed
            linkRepository.deleteBySeasonIdAndSessionIdIn(manual.getId(), List.of(sessionId));
            try {
                locked.await(10, TimeUnit.SECONDS);
                Thread.sleep(700);                               // long enough for the engine to select the season and wait on its lock
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }));
        locked.await(10, TimeUnit.SECONDS);
        Future<Integer> engine = pool.submit(() -> counter.countSession(session));
        owner.get(30, TimeUnit.SECONDS);

        // the engine had selected the season while the link still showed; under the lock it sees the link gone and counts nothing
        assertThat(engine.get(30, TimeUnit.SECONDS)).isZero();
        pool.shutdown();
        assertThat(seasonMemberRepository.findBySeasonId(manual.getId())).isEmpty();
    }

    // ---- linking and unlinking: add counts, remove subtracts exactly ------------------------------------------------------------------

    @Test
    void linkingASessionTheEngineAlreadyFinished_countsItAtOnce_andUnlinkingItSubtractsExactlyWhatItAdded() {
        GroupSeason manual = season(SeasonStatus.ONGOING, SeasonCollectionMode.MANUAL, -10, 10);
        Long keep = completedSession(2);
        game(keep, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        Long drop = completedSession(3);
        game(drop, List.of(aliceId, carolId), List.of(bobId, danId), 21, 10);
        game(drop, List.of(aliceId, bobId), List.of(carolId, danId), 15, 21);
        runner.processDue();    // the engine counts both sessions; the season is MANUAL with no link, so it counts none
        assertThat(seasonMemberRepository.findBySeasonId(manual.getId())).isEmpty();

        seasonService.updateLinks(groupId, manual.getId(), hostId, SeasonLinksRequest.builder().add(List.of(keep)).build());
        String afterKeep = rowsOf(manual.getId());
        assertThat(seasonDoc(manual.getId(), aliceId).counters().value("games")).isEqualTo(1.0);

        seasonService.updateLinks(groupId, manual.getId(), hostId, SeasonLinksRequest.builder().add(List.of(drop)).build());
        GroupStatsDoc alice = seasonDoc(manual.getId(), aliceId);
        assertThat(alice.counters().value("games")).isEqualTo(3.0);
        assertThat(alice.counters().value("sessions")).isEqualTo(2.0);
        assertThat(alice.groupings().get("PARTNER")).hasSize(2);   // bob (twice, in two sessions) and carol

        seasonService.updateLinks(groupId, manual.getId(), hostId, SeasonLinksRequest.builder().remove(List.of(drop)).build());

        // back to exactly the state with only the kept session: counters, partners, pointers, head-to-head
        assertThat(rowsOf(manual.getId())).isEqualTo(afterKeep);
        assertThat(reload(manual.getId()).getCountedSessions()).containsOnlyKeys(String.valueOf(keep));
        assertThat(linkRepository.countBySeasonId(manual.getId())).isEqualTo(1);
    }

    @Test
    void unlinkingSeveralSessionsInOneCall_subtractsThemAllInOnePass_andLeavesExactlyTheOneKept() {
        GroupSeason manual = season(SeasonStatus.ONGOING, SeasonCollectionMode.MANUAL, -10, 10);
        Long keep = completedSession(2);
        game(keep, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        Long dropOne = completedSession(3);
        game(dropOne, List.of(aliceId, carolId), List.of(bobId, danId), 21, 10);
        game(dropOne, List.of(aliceId, bobId), List.of(carolId, danId), 15, 21);
        Long dropTwo = completedSession(4);
        game(dropTwo, List.of(bobId, danId), List.of(aliceId, carolId), 21, 19);
        runner.processDue();
        seasonService.updateLinks(groupId, manual.getId(), hostId, SeasonLinksRequest.builder().add(List.of(keep)).build());
        String onlyKeep = rowsOf(manual.getId());
        seasonService.updateLinks(groupId, manual.getId(), hostId, SeasonLinksRequest.builder().add(List.of(dropOne, dropTwo)).build());
        assertThat(seasonDoc(manual.getId(), aliceId).counters().value("games")).isEqualTo(4.0);
        assertThat(reload(manual.getId()).getCountedSessions()).hasSize(3);

        seasonService.updateLinks(groupId, manual.getId(), hostId, SeasonLinksRequest.builder().remove(List.of(dropOne, dropTwo, 987654L)).build());

        assertThat(rowsOf(manual.getId())).isEqualTo(onlyKeep);
        assertThat(reload(manual.getId()).getCountedSessions()).containsOnlyKeys(String.valueOf(keep));
        assertThat(linkRepository.countBySeasonId(manual.getId())).isEqualTo(1);
    }

    @Test
    void removingTheOnlyCountedSession_emptiesTheSeasonsRows_andDeletesTheEntriesItEmptied() {
        GroupSeason manual = season(SeasonStatus.ONGOING, SeasonCollectionMode.MANUAL, -10, 10);
        Long sessionId = completedSession(2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        runner.processDue();
        seasonService.updateLinks(groupId, manual.getId(), hostId, SeasonLinksRequest.builder().add(List.of(sessionId)).build());
        assertThat(seasonDoc(manual.getId(), aliceId).groupings().get("PARTNER")).isNotEmpty();

        seasonService.updateLinks(groupId, manual.getId(), hostId, SeasonLinksRequest.builder().remove(List.of(sessionId)).build());

        GroupStatsDoc alice = seasonDoc(manual.getId(), aliceId);
        assertThat(alice.counters().isZero()).isTrue();
        assertThat(alice.groupings()).isEmpty();                      // the partner entry the subtraction emptied is gone
        assertThat(alice.hasPointer(recordIdsOf(sessionId).get(0))).isFalse();
        assertThat(GroupH2hDoc.read(seasonH2hRepository.findById(manual.getId()).orElseThrow()).size()).isZero();
        assertThat(reload(manual.getId()).getCountedSessions()).isEmpty();
    }

    @Test
    void unlinkingASessionTheSeasonNeverCounted_onlyDeletesTheLink() {
        GroupSeason manual = season(SeasonStatus.ONGOING, SeasonCollectionMode.MANUAL, -10, 10);
        Long sessionId = completedSession(0);          // not counted by the engine yet (inside its guard)
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        seasonService.updateLinks(groupId, manual.getId(), hostId, SeasonLinksRequest.builder().add(List.of(sessionId)).build());
        assertThat(seasonMemberRepository.findBySeasonId(manual.getId())).isEmpty();      // linked, waiting for the engine or the sweep

        seasonService.updateLinks(groupId, manual.getId(), hostId, SeasonLinksRequest.builder().remove(List.of(sessionId)).build());

        assertThat(linkRepository.countBySeasonId(manual.getId())).isZero();
        assertThat(seasonMemberRepository.findBySeasonId(manual.getId())).isEmpty();
    }

    // ---- finalising ----------------------------------------------------------------------------------------------------------------

    @Test
    void anOwnerFinalisesAtOnce_theSessionsTheEngineHasNotCountedAreCountedStraightIn_andTheirJobRowIsNotTouched() throws Exception {
        GroupSeason season = season(SeasonStatus.COMPLETED, SeasonCollectionMode.AUTO, -10, 10);
        Long counted = completedSession(2);
        game(counted, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        runner.processDue();                                      // the engine counts it into the season by itself
        Long fresh = completedSession(0);                          // ended a minute ago: inside the guard, the engine will not take it
        game(fresh, List.of(aliceId, bobId), List.of(carolId, danId), 21, 9);
        assertThat(runner.processDue()).isZero();
        assertThat(seasonDoc(season.getId(), aliceId).counters().value("games")).isEqualTo(1.0);

        mockMvc.perform(post("/api/sessions/group/" + groupId + "/seasons/" + season.getId() + "/finalise")
                        .header("Authorization", bearer(hostId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("FINALISED"))
                .andExpect(jsonPath("$.data.finalisedAt").exists());

        assertThat(seasonDoc(season.getId(), aliceId).counters().value("games")).isEqualTo(2.0);
        assertThat(reload(season.getId()).getCountedSessions()).containsOnlyKeys(String.valueOf(counted), String.valueOf(fresh));
        assertThat(jobRepository.findById(fresh)).as("the sweep never touches the session's statistics job").isEmpty();
        assertThat(postRepository.findAll()).extracting(Post::getSystemCode).contains(SystemCode.GROUP_SEASON_FINALISED);

        // the engine counts that session into the players' and the group's rows later, and the finalised season stays as it was
        Session later = sessionRepository.findById(fresh).orElseThrow();
        later.setScheduledStart(Instant.now().minus(Duration.ofDays(3)));
        later.setScheduledEndAt(Instant.now().minus(Duration.ofDays(3)).plusSeconds(3600));
        sessionRepository.save(later);
        assertThat(runner.processDue()).isEqualTo(1);
        assertThat(seasonDoc(season.getId(), aliceId).counters().value("games")).isEqualTo(2.0);
        assertThat(groupDoc(aliceId).counters().value("games")).isEqualTo(2.0);
    }

    @Test
    void finalisingAManualSeason_countsTheLinkedSessionsTheEngineHasNotCountedYet_andOnlyThose() throws Exception {
        GroupSeason manual = season(SeasonStatus.COMPLETED, SeasonCollectionMode.MANUAL, -10, 10);
        Long linkedFresh = completedSession(0);           // completed a minute ago, inside the guard: the engine will not take it yet
        game(linkedFresh, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        Long notLinked = completedSession(0);              // in the range, but nobody linked it
        game(notLinked, List.of(aliceId, bobId), List.of(carolId, danId), 21, 9);
        linkRepository.save(new GroupSeasonSession(manual.getId(), linkedFresh, hostId, Instant.now()));
        assertThat(runner.processDue()).isZero();
        assertThat(seasonMemberRepository.findBySeasonId(manual.getId())).isEmpty();

        mockMvc.perform(post("/api/sessions/group/" + groupId + "/seasons/" + manual.getId() + "/finalise")
                        .header("Authorization", bearer(hostId)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("FINALISED"));

        assertThat(seasonDoc(manual.getId(), aliceId).counters().value("games")).isEqualTo(1.0);
        assertThat(reload(manual.getId()).getCountedSessions()).containsOnlyKeys(String.valueOf(linkedFresh));
        assertThat(jobRepository.findById(linkedFresh)).isEmpty();      // the sweep leaves the statistics job alone
    }

    @Test
    void finalising_isForACompletedSeasonOnly_andForTheGroupsOwnersAndAdmins() throws Exception {
        GroupSeason ongoing = season(SeasonStatus.ONGOING, SeasonCollectionMode.AUTO, -10, 10);
        GroupSeason completed = season(SeasonStatus.COMPLETED, SeasonCollectionMode.AUTO, -30, -20);

        mockMvc.perform(post("/api/sessions/group/" + groupId + "/seasons/" + ongoing.getId() + "/finalise")
                        .header("Authorization", bearer(adminId)))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_NOT_FINALISABLE"));
        mockMvc.perform(post("/api/sessions/group/" + groupId + "/seasons/" + completed.getId() + "/finalise")
                        .header("Authorization", bearer(plainMemberId)))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_ADMIN_REQUIRED"));
        mockMvc.perform(post("/api/sessions/group/" + groupId + "/seasons/" + completed.getId() + "/finalise")
                        .header("Authorization", bearer(outsiderId)))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/sessions/group/" + groupId + "/seasons/" + completed.getId() + "/finalise")
                        .header("Authorization", bearer(adminId)))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/sessions/group/" + groupId + "/seasons/" + completed.getId() + "/finalise")
                        .header("Authorization", bearer(hostId)))
                .andExpect(status().isConflict());          // already finalised: nothing is done twice
        assertThat(reload(completed.getId()).getStatus()).isEqualTo(SeasonStatus.FINALISED);
    }

    @Test
    void theStatusJob_finalisesACompletedSeasonOnlyAfterTheGuard_andSweepsTheLastSessions() {
        GroupSeason insideGuard = season(SeasonStatus.COMPLETED, SeasonCollectionMode.AUTO, -12, 0);
        // ended a minute ago: inside the 24-hour guard
        insideGuard.setEndAt(Instant.now().minusSeconds(60));
        seasonRepository.save(insideGuard);
        GroupSeason pastGuard = season(SeasonStatus.COMPLETED, SeasonCollectionMode.AUTO, -40, -30);
        Long sweepMe = sessionAt(Instant.now().minus(Duration.ofDays(31)));
        game(sweepMe, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        assertThat(transitions.tick()).isEqualTo(1);

        assertThat(reload(insideGuard.getId()).getStatus()).isEqualTo(SeasonStatus.COMPLETED);
        assertThat(reload(pastGuard.getId()).getStatus()).isEqualTo(SeasonStatus.FINALISED);
        assertThat(seasonDoc(pastGuard.getId(), aliceId).counters().value("games")).isEqualTo(1.0);
        assertThat(jobRepository.findById(sweepMe)).isEmpty();
        assertThat(transitions.tick()).isZero();
    }

    // ---- reads ------------------------------------------------------------------------------------------------------------------------

    @Test
    void theSeasonsStatisticsAreForTheGroupsMembers_andAnswerTheSameShapeAsTheGroups() throws Exception {
        GroupSeason season = season(SeasonStatus.ONGOING, SeasonCollectionMode.AUTO, -10, 10);
        Long sessionId = completedSession(2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        runner.processDue();
        String base = "/api/sessions/group/" + groupId + "/seasons/" + season.getId();

        mockMvc.perform(get(base + "/stats").header("Authorization", bearer(adminId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.columns[0]").value("games"))
                .andExpect(jsonPath("$.data.members.totalElements").value(5))
                .andExpect(jsonPath("$.data.members.content[0].values.games").value(1.0));
        mockMvc.perform(get(base + "/stats/members/" + aliceId).header("Authorization", bearer(adminId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.totals.games").value(1.0))
                .andExpect(jsonPath("$.data.partners.length()").value(1));
        mockMvc.perform(get(base + "/stats").header("Authorization", bearer(outsiderId)))
                .andExpect(status().isForbidden()).andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_MEMBER_REQUIRED"));
        mockMvc.perform(get("/api/sessions/group/" + groupId + "/seasons/999999/stats").header("Authorization", bearer(adminId)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_NOT_FOUND"));
    }

    // ---- two at once -------------------------------------------------------------------------------------------------------------------

    @Test
    void twoThreadsCountingTheSameSessionIntoTheSameSeason_countItOnce() throws Exception {
        GroupSeason season = season(SeasonStatus.ONGOING, SeasonCollectionMode.AUTO, -10, 10);
        Long sessionId = completedSession(2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        Session session = sessionRepository.findById(sessionId).orElseThrow();

        int threads = 4;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CyclicBarrier barrier = new CyclicBarrier(threads);
        List<Future<Integer>> results = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            Callable<Integer> task = () -> {
                barrier.await(10, TimeUnit.SECONDS);
                return counter.countSession(session);
            };
            results.add(pool.submit(task));
        }
        int total = 0;
        for (Future<Integer> result : results) {
            total += result.get(60, TimeUnit.SECONDS);
        }
        pool.shutdown();

        assertThat(total).isEqualTo(1);
        assertThat(seasonDoc(season.getId(), aliceId).counters().value("games")).isEqualTo(1.0);
        assertThat(reload(season.getId()).getCountedSessions()).hasSize(1);
    }

    @Test
    void theEngineCountingASession_andAnOwnerUnlinkingAnotherOnTheSameSeason_bothTakeEffect() throws Exception {
        GroupSeason manual = season(SeasonStatus.ONGOING, SeasonCollectionMode.MANUAL, -10, 10);
        Long counted = completedSession(2);
        game(counted, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        Long other = completedSession(3);
        game(other, List.of(aliceId, bobId), List.of(carolId, danId), 21, 12);
        runner.processDue();
        seasonService.updateLinks(groupId, manual.getId(), hostId, SeasonLinksRequest.builder().add(List.of(counted)).build());
        Long incoming = completedSession(1);
        game(incoming, List.of(aliceId, carolId), List.of(bobId, danId), 21, 10);
        linkRepository.save(new GroupSeasonSession(manual.getId(), incoming, hostId, Instant.now()));
        Session incomingSession = sessionRepository.findById(incoming).orElseThrow();

        ExecutorService pool = Executors.newFixedThreadPool(2);
        CyclicBarrier barrier = new CyclicBarrier(2);
        Future<Integer> engine = pool.submit(() -> {
            barrier.await(10, TimeUnit.SECONDS);
            return counter.countSession(incomingSession);
        });
        Future<?> owner = pool.submit(() -> {
            barrier.await(10, TimeUnit.SECONDS);
            return seasonService.updateLinks(groupId, manual.getId(), hostId, SeasonLinksRequest.builder().remove(List.of(counted)).build());
        });
        assertThat(engine.get(60, TimeUnit.SECONDS)).isEqualTo(1);
        owner.get(60, TimeUnit.SECONDS);
        pool.shutdown();

        // whichever ran first, the season holds the incoming session and no longer the removed one
        assertThat(reload(manual.getId()).getCountedSessions()).containsOnlyKeys(String.valueOf(incoming));
        assertThat(seasonDoc(manual.getId(), aliceId).counters().value("games")).isEqualTo(1.0);
    }

    // ---- fixtures ------------------------------------------------------------------------------------------------------------------------

    private GroupSeason season(SeasonStatus status, SeasonCollectionMode mode, int fromDays, int toDays) {
        Instant now = Instant.now();
        Long postId = postRepository.save(Post.builder().userId(hostId).groupId(null).postType(PostType.SEASON_POST)
                .content("Season: fixture").visibility("private").isActive(true).build()).getId();
        Map<String, Object> statsConfig = new LinkedHashMap<>();
        statsConfig.put("columns", List.of("games", "wins", "scoreFor", "scoreAgainst", "sessions"));
        statsConfig.put("config", Map.of());
        return seasonRepository.save(GroupSeason.builder().groupId(groupId).sportId(sportId).name("Season " + status + " " + mode)
                .startAt(now.plus(Duration.ofDays(fromDays))).endAt(now.plus(Duration.ofDays(toDays)))
                .status(status).collectionMode(mode).inheritRanks(false)
                .statsConfig(statsConfig).rankingRule(Map.of()).postId(postId).createdBy(hostId).createdAt(now).updatedAt(now).build());
    }

    private GroupSeason reload(Long id) {
        return seasonRepository.findById(id).orElseThrow();
    }

    private GroupStatsDoc seasonDoc(Long seasonId, UUID userId) {
        return GroupStatsDoc.read(seasonMemberRepository.findById(new SeasonMemberStats.Key(seasonId, userId)).orElseThrow());
    }

    private GroupStatsDoc groupDoc(UUID userId) {
        return GroupStatsDoc.read(groupMemberStatsRepository.findById(new GroupMemberStats.Key(groupId, userId, sportId)).orElseThrow());
    }

    /** The season's whole counted state as text (every member row's counters, groupings and history, and the head-to-head), for "exactly as before". */
    private String rowsOf(Long seasonId) {
        StringBuilder text = new StringBuilder();
        seasonMemberRepository.findBySeasonId(seasonId).stream().sorted((a, b) -> a.getUserId().compareTo(b.getUserId()))
                .forEach(row -> text.append(row.getUserId()).append(':').append(row.getStats()).append(row.getHistory()).append('\n'));
        text.append(h2hCounts(seasonId));
        return text.toString();
    }

    /** The head-to-head matchups with their wins, without the sequence number (a subtraction takes the wins back, it does not roll the sequence back). */
    private String h2hCounts(Long seasonId) {
        StringBuilder text = new StringBuilder();
        seasonH2hRepository.findById(seasonId).map(SeasonStats::getH2h).ifPresent(h2h -> {
            if (h2h.get("h2h") instanceof Map<?, ?> matchups) {
                new java.util.TreeMap<>(matchups).forEach((key, value) -> {
                    List<?> entry = (List<?>) value;
                    text.append(key).append('=').append(entry.subList(0, entry.size() - 1)).append(';');
                });
            }
        });
        return text.toString();
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> ledgerEntry(Long seasonId, Long sessionId) {
        return (Map<String, Object>) reload(seasonId).getCountedSessions().get(String.valueOf(sessionId));
    }

    private List<Long> recordIdsOf(Long sessionId) {
        return recordRepository.findBySessionIdOrderByIdAsc(sessionId).stream().map(SessionRecord::getId).toList();
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

    private Long completedSession(long endedDaysAgo) {
        return sessionAt(Instant.now().minus(Duration.ofDays(endedDaysAgo)).minusSeconds(60).minus(Duration.ofHours(2)));
    }

    /** A completed group session starting at {@code start}, ending two hours later; the host and the four players are JOINED. */
    private Long sessionAt(Instant start) {
        Long postId = postRepository.save(Post.builder().userId(hostId).groupId(null).postType(PostType.SESSION_POST)
                .content("Session: fixture").visibility("private").isActive(true).build()).getId();
        Long id = sessionRepository.save(Session.builder().title("Season session").groupId(groupId).isPublic(false).postId(postId)
                .sessionType(SessionType.GROUP_RECURRING).createdBy(hostId).sportId(sportId).locationId(venueId)
                .scheduledStart(start).scheduledEndAt(start.plus(Duration.ofHours(2))).status(SessionStatus.COMPLETED)
                .capacity(9999).feeType(FeeType.FREE).initialSlot(0).autoApprove(false).gameMood(5).build()).getId();
        for (UUID player : List.of(hostId, aliceId, bobId, carolId, danId)) {
            participantRepository.save(SessionParticipant.builder().sessionId(id).userId(player).status(ParticipantStatus.JOINED).build());
        }
        return id;
    }

    private Long game(Long sessionId, List<UUID> first, List<UUID> second, int firstScore, int secondScore) {
        Map<String, Object> data = Map.of("teams", List.of(
                Map.of("players", first.stream().map(UUID::toString).toList(), "scores", List.of(firstScore)),
                Map.of("players", second.stream().map(UUID::toString).toList(), "scores", List.of(secondScore))));
        Instant now = Instant.now();
        return recordRepository.save(SessionRecord.builder().sessionId(sessionId).data(data).clientRequestId(UUID.randomUUID())
                .createdBy(hostId).createdAt(now).updatedBy(hostId).updatedAt(now).build()).getId();
    }

    /** Badminton doubles: games, wins, the score sums and sessions, grouped by partner. */
    private static Map<String, Object> badmintonSchema() {
        return Map.of("version", 1, "maxRecords", 100, "record", Map.of(
                "data", Map.of("type", "COMPETITIVE", "playersPerSide", Map.of("min", 1, "max", 2),
                        "score", Map.of("slot", List.of(Map.of("required", true, "rule", ">=0&<=30")))),
                "scoreboard", Map.of("columns", List.of("games", "wins", "scoreFor", "scoreAgainst", "sessions"),
                        "groupBy", List.of(Map.of("by", "PARTNER")))));
    }
}
