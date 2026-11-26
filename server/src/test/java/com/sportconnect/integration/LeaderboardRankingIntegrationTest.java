package com.sportconnect.integration;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.ConflictException;
import com.sportconnect.common.exception.ForbiddenException;
import com.sportconnect.common.exception.NotFoundException;
import com.sportconnect.common.exception.TooManyRequestsException;
import com.sportconnect.group.api.service.GroupMemberNumberService;
import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.location.entity.Location;
import com.sportconnect.location.repository.LocationRepository;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.LeaderboardEntryDto;
import com.sportconnect.session.api.dto.LeaderboardRefreshResponse;
import com.sportconnect.session.api.dto.LeaderboardResponse;
import com.sportconnect.session.api.dto.RankingRuleResponse;
import com.sportconnect.session.api.dto.StatsPlayerDto;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.RankingRuleRequest;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.api.service.LeaderboardService;
import com.sportconnect.session.api.service.RankingRuleService;
import com.sportconnect.session.entity.GroupSessionSettings;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.ranking.BoardTree;
import com.sportconnect.session.ranking.LeaderboardRanker;
import com.sportconnect.session.record.SessionRecord;
import com.sportconnect.session.record.SessionRecordRepository;
import com.sportconnect.session.record.SessionRecordVerification;
import com.sportconnect.session.record.SessionRecordVerificationRepository;
import com.sportconnect.session.repository.GroupSessionSettingsRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.session.stats.GroupMemberStatsRepository;
import com.sportconnect.session.stats.GroupStatsRepository;
import com.sportconnect.session.stats.LeaderboardEntry;
import com.sportconnect.session.stats.LeaderboardEntryRepository;
import com.sportconnect.session.stats.SessionStatsJobRepository;
import com.sportconnect.session.stats.SessionStatsRunner;
import com.sportconnect.session.stats.SportRankingRule;
import com.sportconnect.session.stats.SportRankingRuleRepository;
import com.sportconnect.session.stats.StatBoardChange;
import com.sportconnect.session.stats.StatBoardChangeRepository;
import com.sportconnect.session.stats.StatBoardRun;
import com.sportconnect.session.stats.StatBoardRunRepository;
import com.sportconnect.session.stats.UserSportStatsRepository;
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
import org.springframework.jdbc.core.JdbcTemplate;

import javax.sql.DataSource;
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
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * SESSION-54: the leaderboards through the real Spring context and the H2 schema. A ranking game counted by the statistics engine
 * leaves one change row per player and board; the ranking pass rebuilds those players' entries into the region, country and group
 * boards (one tree per board, ranks derived, the previous rank baked in), moves a pair whose numbers changed, takes a country's
 * pair at its best region only, rebuilds a board whole when its rule changes, skips a sport or a group that is switched off, records
 * a failure and retries it, and never publishes a board a claim was taken from. The rules admin service refuses what the sport's
 * own schema cannot support.
 *
 * <p>The nightly and retry ticks and the worker thread are off in the test profile; the tests call
 * {@link LeaderboardRanker#run}. H2 in one JVM: the threads prove the portable claim logic, not PostgreSQL's own behaviour, the
 * cost of a large jsonb tree, or two real instances.
 */
class LeaderboardRankingIntegrationTest extends RedisBaseIT {

    private static final Integer ROLE_OWNER = 1;
    private static final Integer ROLE_MEMBER = 3;
    private static final long COUNTRY = 84L;
    private static final long REGION = 79L;
    private static final long OTHER_REGION = 80L;

    @Autowired private LeaderboardRanker ranker;
    @Autowired private com.sportconnect.session.ranking.LeaderboardBoardBuilder builder;
    @Autowired private com.sportconnect.session.ranking.LeaderboardWriter writer;
    @Autowired private org.springframework.transaction.PlatformTransactionManager transactionManager;
    @Autowired private SessionStatsRunner statsRunner;
    @Autowired private RankingRuleService ruleService;
    @Autowired private LeaderboardService leaderboardService;
    @Autowired private com.sportconnect.session.api.service.GroupSessionConfigService groupConfigService;
    @Autowired private GroupMemberNumberService memberNumbers;
    @Autowired private LeaderboardEntryRepository entryRepository;
    @Autowired private StatBoardChangeRepository changeRepository;
    @Autowired private StatBoardRunRepository runRepository;
    @Autowired private SportRankingRuleRepository ruleRepository;
    @Autowired private com.sportconnect.group.repository.GroupMemberNumberRepository memberNumberRepository;
    @Autowired private com.sportconnect.group.repository.GroupMemberNumberCounterRepository memberNumberCounterRepository;
    @Autowired private GroupStatsRepository groupH2hRepository;
    @Autowired private GroupMemberStatsRepository groupMemberStatsRepository;
    @Autowired private UserSportStatsRepository userStatsRepository;
    @Autowired private SessionStatsJobRepository jobRepository;
    @Autowired private SessionRepository sessionRepository;
    @Autowired private SessionParticipantRepository participantRepository;
    @Autowired private SessionRecordRepository recordRepository;
    @Autowired private SessionRecordVerificationRepository verificationRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private GroupSessionSettingsRepository groupSettingsRepository;
    @Autowired private GroupMemberRepository groupMemberRepository;
    @Autowired private LocationRepository locationRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private SportRepository sportRepository;
    @Autowired private PostRepository postRepository;
    @Autowired private CommentRepository commentRepository;
    @Autowired private CacheManager cacheManager;
    @Autowired private DataSource dataSource;

    private UUID hostId;
    private UUID aliceId;
    private UUID bobId;
    private UUID carolId;
    private UUID danId;
    private Long sportId;
    private Long groupId;
    private Long venueId;
    private Long otherVenueId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        hostId = createUser("host");
        aliceId = createUser("alice");
        bobId = createUser("bob");
        carolId = createUser("carol");
        danId = createUser("dan");
        sportId = newSport(badmintonSchema(), true);
        groupId = groupRepository.save(Group.builder().groupName("Boards " + UUID.randomUUID()).sportId(sportId)
                .createdBy(hostId).isPrivate(true).isActive(true).build()).getId();
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(hostId).roleId(ROLE_OWNER).build());
        groupSettingsRepository.save(GroupSessionSettings.builder().groupId(groupId).statisticsEnabled(true).build());
        for (UUID member : List.of(aliceId, bobId, carolId, danId)) {
            groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(member).roleId(ROLE_MEMBER).build());
        }
        venueId = venue(COUNTRY, REGION);
        otherVenueId = venue(COUNTRY, OTHER_REGION);
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
    }

    private void clearAll() {
        changeRepository.deleteAll();
        runRepository.deleteAll();
        entryRepository.deleteAll();
        ruleRepository.deleteAll();
        groupH2hRepository.deleteAll();
        memberNumberRepository.deleteAll();
        memberNumberCounterRepository.deleteAll();
        groupMemberStatsRepository.deleteAll();
        userStatsRepository.deleteAll();
        jobRepository.deleteAll();
        commentRepository.deleteAll();
        verificationRepository.deleteAll();
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
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    // ---- the engine leaves change rows -------------------------------------------------------------------------------

    @Test
    void theEngineAppendsOneChangeRowPerPlayerAndBoardForTheWholeSession() {
        Long sessionId = completedSession(groupId, venueId, 2);
        Long first = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        propose(first, aliceId, List.of(aliceId, bobId, carolId, danId));
        Long second = game(sessionId, List.of(carolId, danId), List.of(aliceId, bobId), 21, 18);
        propose(second, carolId, List.of(aliceId, bobId, carolId, danId));

        statsRunner.processDue();

        // two ranking games, four players: each player once on the group, region and country board (not once per game)
        List<StatBoardChange> rows = changeRepository.findAll();
        assertThat(rows).hasSize(12);
        for (String board : List.of("GROUP", "REGION", "COUNTRY")) {
            Long scope = board.equals("GROUP") ? groupId : board.equals("REGION") ? REGION : COUNTRY;
            assertThat(rows.stream().filter(r -> r.getScopeType().equals(board) && r.getScopeId().equals(scope)
                    && r.getSportId().equals(sportId)).map(StatBoardChange::getUserId).toList())
                    .containsExactlyInAnyOrder(aliceId, bobId, carolId, danId);
        }
        // a region board knows its country, a country board is its own
        assertThat(runRepository.findById(new StatBoardRun.Key(sportId, "REGION", REGION)).orElseThrow().getCountryId()).isEqualTo(COUNTRY);
        assertThat(runRepository.findById(new StatBoardRun.Key(sportId, "COUNTRY", COUNTRY)).orElseThrow().getCountryId()).isEqualTo(COUNTRY);
        assertThat(runRepository.findById(new StatBoardRun.Key(sportId, "GROUP", groupId)).orElseThrow().getCountryId()).isNull();
    }

    @Test
    void aNormalGameChangesOnlyTheGroupBoard() {
        Long sessionId = completedSession(groupId, venueId, 2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        statsRunner.processDue();

        assertThat(changeRepository.findAll()).extracting(StatBoardChange::getScopeType).containsOnly("GROUP");
    }

    // ---- ranking a region and a country ------------------------------------------------------------------------------

    @Test
    void aRankingGameAppearsOnTheRegionAndTheCountryBoardsAndTheChangeRowsAreCleared() {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));

        assertThat(ranker.run(LeaderboardRanker.Mode.NIGHTLY)).isEqualTo(3);     // region, country, group

        BoardTree single = tree("REGION", REGION, "SINGLE");
        assertThat(single.size()).isEqualTo(4);
        assertThat(single.ranks().get(aliceId.toString())).isEqualTo(1);
        assertThat(single.ranks().get(bobId.toString())).isEqualTo(1);
        assertThat(single.ranks().get(carolId.toString())).isEqualTo(3);
        assertThat(single.ranks().get(danId.toString())).isEqualTo(3);

        BoardTree pairs = tree("REGION", REGION, "PARTNER");
        assertThat(pairs.size()).isEqualTo(2);
        assertThat(pairs.ranks()).containsEntry(pair(aliceId, bobId), 1).containsEntry(pair(carolId, danId), 2);

        assertThat(tree("COUNTRY", COUNTRY, "SINGLE").size()).isEqualTo(4);
        assertThat(tree("COUNTRY", COUNTRY, "PARTNER").ranks()).containsEntry(pair(aliceId, bobId), 1).containsEntry(pair(carolId, danId), 2);

        assertThat(changeRepository.findAll().stream().filter(c -> !c.getScopeType().equals("GROUP"))).isEmpty();
        for (String type : List.of("REGION", "COUNTRY")) {
            Long scope = type.equals("REGION") ? REGION : COUNTRY;
            StatBoardRun run = runRepository.findById(new StatBoardRun.Key(sportId, type, scope)).orElseThrow();
            assertThat(run.getDirty()).as("%s dirty", type).isFalse();
            assertThat(run.getStatus()).isEqualTo("IDLE");
            assertThat(run.getComputedAt()).isNotNull();
        }
        assertThat(entryRepository.findById(new LeaderboardEntry.Key(sportId, "REGION", REGION, "SINGLE")).orElseThrow().getEntries()).isEqualTo(4);
    }

    @Test
    void aLaterGameMovesPairsAndPlayersAndBakesThePreviousRank() {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);

        countRankedGame(venueId, List.of(aliceId, carolId), List.of(bobId, danId));
        assertThat(ranker.run(LeaderboardRanker.Mode.NIGHTLY)).isEqualTo(3);

        BoardTree single = tree("REGION", REGION, "SINGLE");
        // alice 2 wins in 2 games, bob and carol 1 in 2, dan none
        assertThat(single.ranks().get(aliceId.toString())).isEqualTo(1);
        assertThat(single.ranks().get(bobId.toString())).isEqualTo(2);
        assertThat(single.ranks().get(carolId.toString())).isEqualTo(2);
        assertThat(single.ranks().get(danId.toString())).isEqualTo(4);
        // the rank each had before this run: alice and bob shared 1, carol and dan shared 3
        assertThat(single.prevRankOf(aliceId.toString())).isEqualTo(1);
        assertThat(single.prevRankOf(bobId.toString())).isEqualTo(1);
        assertThat(single.prevRankOf(carolId.toString())).isEqualTo(3);
        assertThat(single.prevRankOf(danId.toString())).isEqualTo(3);

        BoardTree pairs = tree("REGION", REGION, "PARTNER");
        assertThat(pairs.size()).isEqualTo(4);
        assertThat(pairs.ranks()).containsEntry(pair(aliceId, bobId), 1).containsEntry(pair(aliceId, carolId), 1)
                .containsEntry(pair(carolId, danId), 3).containsEntry(pair(bobId, danId), 3);
        assertThat(pairs.prevRankOf(pair(aliceId, bobId))).isEqualTo(1);
        assertThat(pairs.prevRankOf(pair(carolId, danId))).isEqualTo(2);
        assertThat(pairs.prevRankOf(pair(aliceId, carolId))).as("a pair new on the board has no previous rank").isNull();

        // the group board counts every game and follows the later game too: it is rebuilt from the members\x27 rows, named by number
        BoardTree group = tree("GROUP", groupId, "SINGLE");
        assertThat(group.ranks().get(String.valueOf(no(aliceId)))).isEqualTo(1);
        assertThat(group.ranks().get(String.valueOf(no(bobId)))).isEqualTo(2);
        assertThat(group.ranks().get(String.valueOf(no(carolId)))).isEqualTo(2);
        assertThat(group.ranks().get(String.valueOf(no(danId)))).isEqualTo(4);
        assertThat(group.prevRankOf(String.valueOf(no(carolId)))).isEqualTo(3);
        assertThat(tree("GROUP", groupId, "PARTNER").size()).isEqualTo(4);
    }

    @Test
    void aSportWithNoRulesHasNoBoardsKeepsNothingPendingAndGetsThemWhenARuleIsSet() {
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));

        assertThat(ranker.run(LeaderboardRanker.Mode.NIGHTLY)).as("the boards are visited, none is built").isEqualTo(3);

        assertThat(entryRepository.findAll()).isEmpty();
        assertThat(changeRepository.findAll()).as("the change rows are consumed, they do not pile up").isEmpty();
        assertThat(runRepository.findAll()).allSatisfy(run -> {
            assertThat(run.getDirty()).isFalse();
            assertThat(run.getStatus()).isEqualTo("IDLE");
        });

        // the rules come later: nothing is lost, each board has no tree yet and is built whole from what the players hold
        setRules();
        ruleService.rebuild(sportId);       // the test profile runs the pass on the calling thread

        assertThat(tree("REGION", REGION, "SINGLE").size()).isEqualTo(4);
        assertThat(tree("REGION", REGION, "PARTNER").size()).isEqualTo(2);
        assertThat(tree("COUNTRY", COUNTRY, "PARTNER").size()).isEqualTo(2);
        assertThat(tree("GROUP", groupId, "SINGLE").size()).isEqualTo(4);
    }

    @Test
    void aCountryTakesAPairAtItsBestRegionOnlyAndItsSinglesAreSummed() {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));            // region 79: alice+bob win
        countRankedGame(otherVenueId, List.of(carolId, danId), List.of(aliceId, bobId));       // region 80: alice+bob lose

        ranker.run(LeaderboardRanker.Mode.NIGHTLY);

        // the pair played one game in each region; the country shows its best region's entry (1 win in 1 game), not 1 win in 2
        BoardTree countryPairs = tree("COUNTRY", COUNTRY, "PARTNER");
        BoardTree regionPairs = tree("REGION", REGION, "PARTNER");
        assertThat(countryPairs.tupleOf(pair(aliceId, bobId))).isEqualTo(regionPairs.tupleOf(pair(aliceId, bobId)));
        assertThat(countryPairs.tupleOf(pair(aliceId, bobId)).get(0)).isEqualTo(1.0);       // wins
        assertThat(countryPairs.tupleOf(pair(aliceId, bobId)).get(1)).isEqualTo(1.0);       // games
        assertThat(countryPairs.size()).isEqualTo(2);
        // a player's single entry at country level adds the regions up: alice won 1 and lost 1, 2 games
        BoardTree countrySingles = tree("COUNTRY", COUNTRY, "SINGLE");
        assertThat(countrySingles.tupleOf(aliceId.toString()).get(0)).isEqualTo(1.0);
        assertThat(countrySingles.tupleOf(aliceId.toString()).get(1)).isEqualTo(2.0);
        assertThat(tree("REGION", OTHER_REGION, "SINGLE").size()).isEqualTo(4);
    }

    @Test
    void theCountryPairBoardIsCappedAtTheSlotsOfEachRegionBoardItIsMergedFrom() {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        org.springframework.test.util.ReflectionTestUtils.setField(builder, "slotsPerRegion", 1);
        try {
            ranker.run(LeaderboardRanker.Mode.NIGHTLY);
        } finally {
            org.springframework.test.util.ReflectionTestUtils.setField(builder, "slotsPerRegion", 1000);
        }

        // one region board is merged, so the country keeps one pair: the better one
        BoardTree countryPairs = tree("COUNTRY", COUNTRY, "PARTNER");
        assertThat(countryPairs.size()).isEqualTo(1);
        assertThat(countryPairs.contains(pair(aliceId, bobId))).isTrue();
        // the region itself is not capped
        assertThat(tree("REGION", REGION, "PARTNER").size()).isEqualTo(2);
    }

    // ---- rules ---------------------------------------------------------------------------------------------------------

    @Test
    void aChangedRuleRebuildsTheBoardsWholeAndKeepsThePreviousRanks() {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);
        assertThat(tree("REGION", REGION, "SINGLE").ranks().get(carolId.toString())).isEqualTo(3);

        // the order is turned round: the fewest wins first
        ruleService.save(hostId, sportId, request("SPORT", null, "SINGLE", List.of(Map.of("key", "wins", "dir", "ASC")), null));
        StatBoardRun marked = runRepository.findById(new StatBoardRun.Key(sportId, "REGION", REGION)).orElseThrow();
        assertThat(marked.getFullRebuild()).isTrue();
        assertThat(marked.getDirty()).isTrue();

        ranker.run(LeaderboardRanker.Mode.NIGHTLY);

        BoardTree single = tree("REGION", REGION, "SINGLE");
        assertThat(single.sort().keys().get(0).descending()).isFalse();
        assertThat(single.ranks().get(carolId.toString())).isEqualTo(1);
        assertThat(single.ranks().get(aliceId.toString())).isEqualTo(3);
        assertThat(single.prevRankOf(carolId.toString())).as("the rank before the new rule").isEqualTo(3);
        assertThat(single.prevRankOf(aliceId.toString())).isEqualTo(1);
        StatBoardRun after = runRepository.findById(new StatBoardRun.Key(sportId, "REGION", REGION)).orElseThrow();
        assertThat(after.getFullRebuild()).isFalse();
        assertThat(after.getRulesVersion()).isEqualTo(2);
    }

    @Test
    void aTreeBuiltWithAnotherRuleIsRebuiltEvenWhenNothingFlaggedIt() {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);
        assertThat(tree("REGION", REGION, "SINGLE").ranks().get(carolId.toString())).isEqualTo(3);

        // the rule row is changed behind the service (no flag set): the stored sort list no longer matches it
        SportRankingRule row = ruleRepository.findById(new SportRankingRule.Key(sportId, "SPORT", 0L, "SINGLE")).orElseThrow();
        row.setSort(new ArrayList<>(List.of(Map.of("key", "wins", "dir", "ASC"))));
        row.setVersion(row.getVersion() + 1);
        ruleRepository.save(row);
        inTx(() -> runRepository.markDirty(sportId, "REGION", REGION, Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS)));

        ranker.run(LeaderboardRanker.Mode.NIGHTLY);

        assertThat(tree("REGION", REGION, "SINGLE").ranks().get(carolId.toString())).isEqualTo(1);
        assertThat(tree("REGION", REGION, "SINGLE").sort().keys().get(0).descending()).isFalse();
    }

    @Test
    void aMinimumChangedBehindTheServiceRebuildsTheBoardToo() {
        ruleService.save(hostId, sportId, request("SPORT", null, "SINGLE", defaultSort(), null));
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);
        assertThat(tree("REGION", REGION, "SINGLE").size()).isEqualTo(4);

        SportRankingRule row = ruleRepository.findById(new SportRankingRule.Key(sportId, "SPORT", 0L, "SINGLE")).orElseThrow();
        row.setConditions(new ArrayList<>(atLeastGames(5)));
        ruleRepository.save(row);
        inTx(() -> runRepository.markDirty(sportId, "REGION", REGION, Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS)));

        ranker.run(LeaderboardRanker.Mode.NIGHTLY);

        assertThat(tree("REGION", REGION, "SINGLE").size()).as("nobody has 5 games").isZero();
    }

    @Test
    void aRegionPublicationMarksItsCountryDirtySoTheCountryIsRebuiltInThePass() {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);
        Instant countryBuilt = runRepository.findById(new StatBoardRun.Key(sportId, "COUNTRY", COUNTRY)).orElseThrow().getComputedAt();
        assertThat(runRepository.findById(new StatBoardRun.Key(sportId, "COUNTRY", COUNTRY)).orElseThrow().getDirty()).isFalse();

        // only the region is told to rebuild; the country has no work of its own
        inTx(() -> runRepository.markFullRebuildOfCountry(sportId, COUNTRY, Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS)));
        StatBoardRun country = runRepository.findById(new StatBoardRun.Key(sportId, "COUNTRY", COUNTRY)).orElseThrow();
        country.setDirty(false);
        country.setFullRebuild(false);
        runRepository.save(country);

        ranker.run(LeaderboardRanker.Mode.NIGHTLY);

        StatBoardRun after = runRepository.findById(new StatBoardRun.Key(sportId, "COUNTRY", COUNTRY)).orElseThrow();
        assertThat(after.getComputedAt()).as("the country was rebuilt in the same pass").isAfter(countryBuilt);
        assertThat(after.getDirty()).isFalse();
    }

    @Test
    void theMinimumGamesKeepsAnEntryOffTheBoardUntilItHasPlayedEnough() {
        ruleService.save(hostId, sportId, request("SPORT", null, "SINGLE", defaultSort(), atLeastGames(2)));
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);
        assertThat(tree("REGION", REGION, "SINGLE").size()).isZero();

        countRankedGame(venueId, List.of(aliceId, carolId), List.of(bobId, danId));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);

        assertThat(tree("REGION", REGION, "SINGLE").size()).isEqualTo(4);
        assertThat(entryRepository.findById(new LeaderboardEntry.Key(sportId, "REGION", REGION, "PARTNER"))).isEmpty();   // no PARTNER rule: no pair board
    }

    @Test
    void aCountryRuleBeatsTheSportDefaultForItsRegionsAndItsCountryBoard() {
        setRules();
        ruleService.save(hostId, sportId, request("COUNTRY", COUNTRY, "SINGLE", List.of(Map.of("key", "games", "dir", "DESC")), null));
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));

        ranker.run(LeaderboardRanker.Mode.NIGHTLY);

        assertThat(tree("REGION", REGION, "SINGLE").sort().keys().get(0).stat()).isEqualTo("games");
        assertThat(tree("COUNTRY", COUNTRY, "SINGLE").sort().keys().get(0).stat()).isEqualTo("games");
        assertThat(tree("REGION", REGION, "PARTNER").sort().keys().get(0).stat()).as("the pair rule is the default's").isEqualTo("wins");
    }

    @Test
    void theRulesServiceRefusesWhatTheSportsSchemaCannotSupport() {
        assertThatThrownBy(() -> ruleService.save(hostId, sportId, request("SPORT", null, "SINGLE", List.of(Map.of("key", "speed", "dir", "DESC")), null)))
                .isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "SESSION_RANKING_SORT_INVALID");
        assertThatCode(() -> ruleService.save(hostId, sportId, request("SPORT", null, "SINGLE", List.of(Map.of("key", "winRate", "dir", "DESC")), null)))
                .as("winRate needs wins and games, which the sport collects").doesNotThrowAnyException();
        assertThatThrownBy(() -> ruleService.save(hostId, sportId, request("SPORT", null, "SINGLE", List.of(Map.of("key", "losses", "dir", "DESC")), null)))
                .isInstanceOf(BadRequestException.class).extracting(e -> ((BadRequestException) e).getErrorParams().get("reason")).isEqualTo("STAT_NOT_COLLECTED");
        assertThatThrownBy(() -> ruleService.save(hostId, sportId, request("SPORT", null, "TEAM", defaultSort(), null)))
                .isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "SESSION_RANKING_KIND_INVALID")
                .hasFieldOrPropertyWithValue("errorParams", Map.of("reason", "TEAM_NOT_AVAILABLE"));
        assertThatThrownBy(() -> ruleService.save(hostId, sportId, request("REGION", 5L, "SINGLE", defaultSort(), null)))
                .isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "SESSION_RANKING_SCOPE_INVALID");
        assertThatThrownBy(() -> ruleService.save(hostId, sportId, request("COUNTRY", null, "SINGLE", defaultSort(), null)))
                .isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "SESSION_RANKING_SCOPE_INVALID");
        assertThatThrownBy(() -> ruleService.save(hostId, sportId, request("SPORT", null, "SINGLE", defaultSort(), List.of(Map.of("key", "games", "op", "!=", "value", 1)))))
                .isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "SESSION_RANKING_REQUIRE_INVALID")
                .hasFieldOrPropertyWithValue("errorParams", Map.of("reason", "OP_INVALID", "detail", "!="));
        assertThatThrownBy(() -> ruleService.save(hostId, sportId, request("SPORT", null, "SINGLE", defaultSort(), List.of(Map.of("key", "losses", "op", ">=", "value", 1)))))
                .isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "SESSION_RANKING_REQUIRE_INVALID")
                .extracting(e -> ((BadRequestException) e).getErrorParams().get("reason")).isEqualTo("STAT_NOT_COLLECTED");

        Long noPartners = newSport(doublesSchema(Map.of("columns", List.of("games", "wins"))), true);
        assertThatThrownBy(() -> ruleService.save(hostId, noPartners, request("SPORT", null, "PARTNER", defaultSort(), null)))
                .isInstanceOf(BadRequestException.class).extracting(e -> ((BadRequestException) e).getErrorParams().get("reason")).isEqualTo("SPORT_NOT_GROUPED_BY_PARTNER");
        Long noColumns = newSport(doublesSchema(null), true);
        assertThatThrownBy(() -> ruleService.save(hostId, noColumns, request("SPORT", null, "SINGLE", defaultSort(), null)))
                .isInstanceOf(ConflictException.class).hasFieldOrPropertyWithValue("errorCode", "SESSION_RANKING_STATISTICS_NOT_CONFIGURED");
        assertThat(ruleRepository.findAllOfSport(noPartners)).isEmpty();
    }

    @Test
    void savingARuleAgainRaisesItsVersionAndAGamesMinimumNeedsGamesCollected() {
        ruleService.save(hostId, sportId, request("SPORT", null, "SINGLE", defaultSort(), null));
        var second = ruleService.save(hostId, sportId, request("SPORT", null, "SINGLE", defaultSort(), atLeastGames(3)));
        assertThat(second.getVersion()).isEqualTo(2);
        assertThat(second.getRequire()).isEqualTo(List.of(Map.of("key", "games", "op", ">=", "value", 3L)));
        assertThat(ruleService.list(sportId)).hasSize(1);

        Long noGames = newSport(doublesSchema(Map.of("columns", List.of("wins"))), true);
        assertThatThrownBy(() -> ruleService.save(hostId, noGames, request("SPORT", null, "SINGLE", List.of(Map.of("key", "wins", "dir", "DESC")), atLeastGames(2))))
                .as("a precondition on games needs the sport to collect games")
                .isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "SESSION_RANKING_REQUIRE_INVALID")
                .extracting(e -> ((BadRequestException) e).getErrorParams().get("reason")).isEqualTo("STAT_NOT_COLLECTED");
    }

    // ---- who is skipped ------------------------------------------------------------------------------------------------

    @Test
    void aSportWithStatisticsSwitchedOffIsNotRankedAndItsBoardsStayDirty() {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        switchStatistics(sportId, false);

        assertThat(ranker.run(LeaderboardRanker.Mode.NIGHTLY)).isZero();

        assertThat(entryRepository.findAll()).isEmpty();
        assertThat(runRepository.findById(new StatBoardRun.Key(sportId, "REGION", REGION)).orElseThrow().getDirty()).isTrue();
        switchStatistics(sportId, true);
        assertThat(ranker.run(LeaderboardRanker.Mode.NIGHTLY)).isEqualTo(3);
    }

    @Test
    void aSwitchedOffSportIsSkippedWhileAnotherSportIsStillRanked() {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        Long off = newSport(badmintonSchema(), false);
        Instant marked = Instant.now().minusSeconds(60).truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        StatBoardRun offBoard = new StatBoardRun(off, "REGION", REGION, COUNTRY);
        offBoard.setDirty(true);
        offBoard.setDirtyAt(marked);
        runRepository.save(offBoard);

        assertThat(ranker.run(LeaderboardRanker.Mode.NIGHTLY)).isEqualTo(3);

        StatBoardRun still = runRepository.findById(new StatBoardRun.Key(off, "REGION", REGION)).orElseThrow();
        assertThat(still.getDirty()).as("the switched-off sport is left alone").isTrue();
        assertThat(still.getComputedAt()).isNull();
    }

    @Test
    void removingARuleRemovesItsBoardsAfterTheNextRun() {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);
        assertThat(entryRepository.findById(new LeaderboardEntry.Key(sportId, "REGION", REGION, "PARTNER"))).isPresent();
        assertThat(entryRepository.findById(new LeaderboardEntry.Key(sportId, "COUNTRY", COUNTRY, "PARTNER"))).isPresent();

        ruleService.delete(sportId, "SPORT", null, "PARTNER");
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);

        for (String type : List.of("REGION", "COUNTRY", "GROUP")) {
            Long scope = type.equals("REGION") ? REGION : type.equals("COUNTRY") ? COUNTRY : groupId;
            assertThat(entryRepository.findById(new LeaderboardEntry.Key(sportId, type, scope, "PARTNER"))).as("%s pair board", type).isEmpty();
            assertThat(entryRepository.findById(new LeaderboardEntry.Key(sportId, type, scope, "SINGLE"))).as("%s single board", type).isPresent();
        }
    }

    @Test
    void aGroupWithItsSwitchOffIsNotRankedAndKeepsItsBoard() {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);
        assertThat(tree("GROUP", groupId, "SINGLE").size()).isEqualTo(4);

        countRankedGame(venueId, List.of(aliceId, carolId), List.of(bobId, danId));
        GroupSessionSettings settings = groupSettingsRepository.findById(groupId).orElseThrow();
        settings.setStatisticsEnabled(false);
        groupSettingsRepository.save(settings);
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);

        assertThat(runRepository.findById(new StatBoardRun.Key(sportId, "GROUP", groupId)).orElseThrow().getDirty()).isTrue();
        assertThat(tree("GROUP", groupId, "SINGLE").ranks().get(String.valueOf(no(aliceId)))).as("what was ranked before stays").isEqualTo(1);
    }

    @Test
    void aGroupBoardNamesMembersByTheirGroupNumberAndCountsEveryGame() {
        setRules();
        Long sessionId = completedSession(groupId, venueId, 2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);        // a normal game: the group counts it
        statsRunner.processDue();

        ranker.run(LeaderboardRanker.Mode.NIGHTLY);

        BoardTree single = tree("GROUP", groupId, "SINGLE");
        assertThat(single.size()).isEqualTo(4);
        assertThat(single.ranks().keySet()).containsExactlyInAnyOrder(String.valueOf(no(aliceId)), String.valueOf(no(bobId)),
                String.valueOf(no(carolId)), String.valueOf(no(danId)));
        BoardTree pairs = tree("GROUP", groupId, "PARTNER");
        assertThat(pairs.size()).isEqualTo(2);
        assertThat(pairs.contains(numbered(aliceId, bobId))).isTrue();
        assertThat(pairs.contains(numbered(carolId, danId))).isTrue();
        assertThat(entryRepository.findById(new LeaderboardEntry.Key(sportId, "REGION", REGION, "SINGLE"))).as("a normal game is on no region board").isEmpty();
    }

    // ---- failure and retry ----------------------------------------------------------------------------------------------

    @Test
    void aFailedBoardIsRecordedAndTheRetryTickTakesItWhenItsTimeHasCome() throws Exception {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("ALTER TABLE stat_board_changes RENAME TO stat_board_changes_gone");      // makes building fail after the claim
        try {
            assertThat(ranker.run(LeaderboardRanker.Mode.NIGHTLY)).isZero();
        } finally {
            jdbc.execute("ALTER TABLE stat_board_changes_gone RENAME TO stat_board_changes");
        }

        StatBoardRun failed = runRepository.findById(new StatBoardRun.Key(sportId, "REGION", REGION)).orElseThrow();
        assertThat(failed.getStatus()).isEqualTo("FAILED");
        assertThat(failed.getDirty()).isTrue();
        assertThat(failed.getLastError()).isNotBlank();
        assertThat(failed.getNextAttemptAt()).isAfter(Instant.now());
        assertThat(changeRepository.findAll().stream().filter(c -> c.getScopeType().equals("REGION"))).as("nothing was consumed").hasSize(4);

        assertThat(ranker.run(LeaderboardRanker.Mode.RETRY)).as("not due yet").isZero();
        makeDue(sportId, "REGION", REGION);
        makeDue(sportId, "COUNTRY", COUNTRY);
        makeDue(sportId, "GROUP", groupId);
        assertThat(ranker.run(LeaderboardRanker.Mode.RETRY)).isEqualTo(3);
        assertThat(tree("REGION", REGION, "SINGLE").size()).isEqualTo(4);
        assertThat(runRepository.findById(new StatBoardRun.Key(sportId, "REGION", REGION)).orElseThrow().getStatus()).isEqualTo("IDLE");
    }

    @Test
    void aPublicationFromARunWhoseClaimWasTakenOverWritesNothingAndKeepsTheChangeRows() {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        StatBoardRun run = runRepository.findById(new StatBoardRun.Key(sportId, "REGION", REGION)).orElseThrow();
        var computation = builder.compute(builder.plan(run), null);
        Instant now = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        assertThat(writer.claim(run, now, now.minusSeconds(900))).isTrue();

        assertThatThrownBy(() -> writer.publish(new com.sportconnect.session.ranking.LeaderboardWriter.Publication(
                run, now.minusSeconds(5), now, computation, false))).isInstanceOf(IllegalStateException.class);

        assertThat(entryRepository.findAll()).as("the whole publication rolled back").isEmpty();
        assertThat(changeRepository.findAll().stream().filter(c -> c.getScopeType().equals("REGION"))).hasSize(4);
    }

    @Test
    void aCountryDoesNotMergeRegionBoardsBuiltWithAnotherRuleAndStaysDirty() {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);
        assertThat(tree("COUNTRY", COUNTRY, "PARTNER").size()).isEqualTo(2);

        // the country\x27s pair rule changes behind the service and only the country board is marked: the region boards still hold
        // the old sort list, and the merge must not compare their values with the new order
        SportRankingRule row = new SportRankingRule(sportId, "COUNTRY", COUNTRY, "PARTNER");
        row.setSort(new ArrayList<>(List.of(Map.of("key", "games", "dir", "DESC"))));
        ruleRepository.save(row);
        inTx(() -> runRepository.markDirty(sportId, "COUNTRY", COUNTRY, Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS)));

        ranker.run(LeaderboardRanker.Mode.NIGHTLY);

        assertThat(tree("COUNTRY", COUNTRY, "PARTNER").size()).as("no region board merged").isZero();
        assertThat(runRepository.findById(new StatBoardRun.Key(sportId, "COUNTRY", COUNTRY)).orElseThrow().getDirty())
                .as("left dirty until the regions are rebuilt").isTrue();
    }

    @Test
    void theRetryTickLeavesAHealthyDirtyBoardForTheNightlyRun() {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));

        assertThat(ranker.run(LeaderboardRanker.Mode.RETRY)).isZero();
        assertThat(entryRepository.findAll()).isEmpty();
    }

    // ---- two at once -----------------------------------------------------------------------------------------------------

    @Test
    void twoRankersAtOnceLeaveEveryBoardWhole() throws Exception {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        countRankedGame(venueId, List.of(aliceId, carolId), List.of(bobId, danId));

        inParallel(2, () -> ranker.run(LeaderboardRanker.Mode.NIGHTLY));

        assertThat(runRepository.findAll().stream().map(r -> r.getScopeType() + " " + r.getStatus() + " " + r.getLastError()).toList())
                .as("no board failed or is left claimed").allMatch(s -> s.endsWith("IDLE null"));
        // a country built by one ranker from region boards the other had not published yet stays dirty (the region publication
        // marked it), so the next pass makes it whole: nothing is lost, it is eventually consistent by design
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);
        assertThat(tree("REGION", REGION, "SINGLE").ranks().get(aliceId.toString())).isEqualTo(1);
        assertThat(tree("REGION", REGION, "PARTNER").size()).isEqualTo(4);
        assertThat(tree("COUNTRY", COUNTRY, "PARTNER").size()).isEqualTo(4);
        assertThat(changeRepository.findAll()).isEmpty();
    }

    @Test
    void aChangeRowInsertedAfterTheCutoffSurvivesAndAnOlderClaimCannotFinishTheRun() {
        Long id1 = changeRepository.save(new StatBoardChange(sportId, "REGION", REGION, aliceId)).getId();
        Long id2 = changeRepository.save(new StatBoardChange(sportId, "REGION", REGION, bobId)).getId();
        Long id3 = changeRepository.save(new StatBoardChange(sportId, "REGION", REGION, carolId)).getId();

        assertThat(changeRepository.maxId(sportId, "REGION", REGION)).isEqualTo(id3);
        assertThat(changeRepository.findUserIdsUpTo(sportId, "REGION", REGION, id2)).containsExactlyInAnyOrder(aliceId, bobId);
        assertThat(inTx(() -> changeRepository.deleteUpTo(sportId, "REGION", REGION, id2))).isEqualTo(2);
        assertThat(changeRepository.findAll()).extracting(StatBoardChange::getId).containsExactly(id3);

        // a game counted after the run read the board marks it dirty again: the run's end must not clear that
        runRepository.save(new StatBoardRun(sportId, "REGION", REGION, COUNTRY));
        Instant first = Instant.now().minusSeconds(60).truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        inTx(() -> runRepository.markDirty(sportId, "REGION", REGION, first));
        Instant claimed = Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS);
        assertThat(inTx(() -> runRepository.claim(sportId, "REGION", REGION, claimed, claimed.minusSeconds(900)))).isEqualTo(1);
        assertThat(inTx(() -> runRepository.claim(sportId, "REGION", REGION, claimed, claimed.minusSeconds(900)))).as("already claimed").isZero();
        inTx(() -> runRepository.markDirty(sportId, "REGION", REGION, Instant.now().truncatedTo(java.time.temporal.ChronoUnit.MILLIS)));    // a game was counted during the run

        assertThat(inTx(() -> runRepository.finish(sportId, "REGION", REGION, claimed, first, Instant.now(), 1))).isEqualTo(1);

        StatBoardRun run = runRepository.findById(new StatBoardRun.Key(sportId, "REGION", REGION)).orElseThrow();
        assertThat(run.getDirty()).as("the game counted during the run keeps the board dirty").isTrue();
        assertThat(run.getStatus()).isEqualTo("IDLE");
        assertThat(inTx(() -> runRepository.finish(sportId, "REGION", REGION, claimed.minusSeconds(5), run.getDirtyAt(), Instant.now(), 1)))
                .as("a run whose claim was taken over ends nothing").isZero();
    }

    // ---- slice B: the reads ---------------------------------------------------------------------------------------------------

    private LeaderboardResponse groupBoard(UUID caller, String kind, Integer cursor, int size) {
        return leaderboardService.getGroupBoard(groupId, caller, kind, cursor, size);
    }

    private void rankOneGame() {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);
    }

    private void builtAnHourAgo() {
        StatBoardRun run = runRepository.findById(new StatBoardRun.Key(sportId, "GROUP", groupId)).orElseThrow();
        run.setComputedAt(Instant.now().minus(Duration.ofHours(2)));
        runRepository.save(run);
    }

    @Test
    void aMemberReadsTheGroupBoardWithRanksNamesTheSortListAndTheirOwnPlace() {
        rankOneGame();

        LeaderboardResponse board = groupBoard(carolId, "SINGLE", null, 20);

        assertThat(board.total()).isEqualTo(4);
        assertThat(board.rankedAt()).isNotNull();
        assertThat(board.sort()).hasSize(2);
        assertThat(board.entries()).extracting(LeaderboardEntryDto::rank).containsExactly(1, 1, 3, 3);
        assertThat(board.entries().get(0).players()).hasSize(1);
        assertThat(board.entries().get(0).players().get(0).fullName()).isNotBlank();
        assertThat(board.entries().get(0).values()).containsExactly(1d, 1d);            // wins, games
        assertThat(board.entries().get(0).prevRank()).as("first build: no previous rank").isNull();
        assertThat(board.me().rank()).as("carol lost").isEqualTo(3);
        assertThat(board.me().players().get(0).id()).isEqualTo(carolId);
        assertThat(board.nextCursor()).isNull();

        LeaderboardResponse pairs = groupBoard(aliceId, "PARTNER", null, 20);
        assertThat(pairs.entries()).hasSize(2);
        assertThat(pairs.entries().get(0).players()).extracting(StatsPlayerDto::id).containsExactlyInAnyOrder(aliceId, bobId);
        assertThat(pairs.me().rank()).isEqualTo(1);
    }

    @Test
    void aNonMemberAndAMissingGroupAreRefusedTheSameWay() {
        rankOneGame();
        UUID outsider = createUser("outsider");

        assertThatThrownBy(() -> groupBoard(outsider, "SINGLE", null, 20)).isInstanceOf(ForbiddenException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SESSION_GROUP_MEMBER_REQUIRED");
        assertThatThrownBy(() -> leaderboardService.getGroupBoard(groupId + 9999, aliceId, "SINGLE", null, 20))
                .isInstanceOf(ForbiddenException.class).hasFieldOrPropertyWithValue("errorCode", "SESSION_GROUP_MEMBER_REQUIRED");
    }

    @Test
    void aDeactivatedPlayerAndAMemberWhoLeftAreNotShownAndAPairNeedsBothPlayers() {
        rankOneGame();
        User dan = userRepository.findById(danId).orElseThrow();
        dan.setIsActive(false);
        userRepository.save(dan);
        groupMemberRepository.findAll().stream().filter(m -> m.getGroupId().equals(groupId) && m.getUserId().equals(carolId))
                .forEach(groupMemberRepository::delete);

        LeaderboardResponse board = groupBoard(aliceId, "SINGLE", null, 20);
        LeaderboardResponse pairs = groupBoard(aliceId, "PARTNER", null, 20);

        assertThat(board.entries()).extracting(e -> e.players().get(0).id()).containsExactlyInAnyOrder(aliceId, bobId);
        assertThat(board.total()).as("the board itself is unchanged").isEqualTo(4);
        assertThat(pairs.entries()).hasSize(1);
        assertThat(pairs.entries().get(0).players()).extracting(StatsPlayerDto::id).containsExactlyInAnyOrder(aliceId, bobId);
    }


    @Test
    void aPageIsFoundByACursorAndASkippedPlayerDoesNotStallIt() {
        rankOneGame();
        User bob = userRepository.findById(bobId).orElseThrow();
        bob.setIsActive(false);
        userRepository.save(bob);

        List<UUID> seen = new ArrayList<>();
        Integer cursor = null;
        int pages = 0;
        do {
            LeaderboardResponse page = groupBoard(aliceId, "SINGLE", cursor, 1);
            page.entries().forEach(e -> seen.add(e.players().get(0).id()));
            cursor = page.nextCursor();
            pages++;
        } while (cursor != null && pages < 10);

        assertThat(seen).containsExactlyInAnyOrder(aliceId, carolId, danId);
        assertThat(cursor).isNull();
        assertThat(pages).isLessThanOrEqualTo(4);
    }

    @Test
    void aRegionAndACountryBoardAreReadByAnyUserAndAPlayerSeesTheirBestPair() {
        rankOneGame();
        UUID outsider = createUser("outsider");

        LeaderboardResponse region = leaderboardService.getRegionBoard(REGION, sportId, outsider, "SINGLE", null, 20);
        LeaderboardResponse country = leaderboardService.getCountryBoard(COUNTRY, sportId, aliceId, "PARTNER", null, 20);

        assertThat(region.entries()).hasSize(4);
        assertThat(region.me()).as("the outsider has no place").isNull();
        assertThat(country.entries()).hasSize(2);
        assertThat(country.me().rank()).isEqualTo(1);
        assertThat(country.me().players()).extracting(StatsPlayerDto::id).containsExactlyInAnyOrder(aliceId, bobId);
        assertThat(leaderboardService.getRegionBoard(OTHER_REGION, sportId, aliceId, "SINGLE", null, 20).entries()).isEmpty();
    }

    @Test
    void aPlayerInTwoPairsSeesTheBestOneAsTheirPlace() {
        rankOneGame();                                                                      // alice+bob won, carol+dan lost
        countRankedGame(venueId, List.of(bobId, danId), List.of(aliceId, carolId));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);                                         // alice+bob and bob+dan 1; carol+dan and alice+carol 3

        LeaderboardResponse pairs = groupBoard(aliceId, "PARTNER", null, 20);

        assertThat(pairs.entries()).extracting(LeaderboardEntryDto::rank).containsExactly(1, 1, 3, 3);
        assertThat(pairs.me().rank()).as("alice is in a rank 1 pair and a rank 3 pair").isEqualTo(1);
        assertThat(pairs.me().players()).extracting(StatsPlayerDto::id).containsExactlyInAnyOrder(aliceId, bobId);
    }

    @Test
    void aSportWithItsSwitchOffAnswersAsAnUnknownSportAndABoardNeverBuiltIsEmpty() {
        rankOneGame();
        LeaderboardResponse never = leaderboardService.getCountryBoard(COUNTRY + 1, sportId, aliceId, "SINGLE", null, 20);
        assertThat(never.entries()).isEmpty();
        assertThat(never.rankedAt()).isNull();

        switchStatistics(sportId, false);

        assertThatThrownBy(() -> groupBoard(aliceId, "SINGLE", null, 20)).isInstanceOf(NotFoundException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SPORT_NOT_FOUND");
        assertThatThrownBy(() -> leaderboardService.getRegionBoard(REGION, sportId, aliceId, "SINGLE", null, 20))
                .isInstanceOf(NotFoundException.class);
        assertThatThrownBy(() -> leaderboardService.getCountryBoard(COUNTRY, 987654L, aliceId, "SINGLE", null, 20))
                .isInstanceOf(NotFoundException.class);
    }

    @Test
    void aBadKindOrPageSizeIsRefused() {
        rankOneGame();
        assertThatThrownBy(() -> groupBoard(aliceId, "TEAM", null, 20)).isInstanceOf(BadRequestException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SESSION_RANKING_KIND_INVALID");
        assertThatThrownBy(() -> groupBoard(aliceId, "SINGLE", null, 0)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> groupBoard(aliceId, "SINGLE", null, 51)).isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> groupBoard(aliceId, "SINGLE", -1, 20)).isInstanceOf(BadRequestException.class);
    }

    @Test
    void aBoardPublishedAgainIsReadFreshNotFromTheCache() {
        rankOneGame();
        assertThat(groupBoard(aliceId, "SINGLE", null, 20).entries().get(0).values().get(1)).isEqualTo(1d);

        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);

        assertThat(groupBoard(aliceId, "SINGLE", null, 20).entries().get(0).values()).as("two wins in two games now").containsExactly(2d, 2d);
    }

    // ---- slice B: the manual refresh -------------------------------------------------------------------------------------------

    @Test
    void anOwnerRefreshesAGroupBoardOnceAnHourAndAMemberOrANonMemberMay() {
        rankOneGame();
        builtAnHourAgo();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        UUID outsider = createUser("outsider");

        assertThatThrownBy(() -> leaderboardService.refreshGroupBoard(groupId, aliceId)).isInstanceOf(ForbiddenException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SESSION_GROUP_ADMIN_REQUIRED");
        assertThatThrownBy(() -> leaderboardService.refreshGroupBoard(groupId, outsider)).isInstanceOf(ForbiddenException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SESSION_GROUP_MEMBER_REQUIRED");

        LeaderboardRefreshResponse refreshed = leaderboardService.refreshGroupBoard(groupId, hostId);

        assertThat(refreshed.nextRefreshAt()).isAfter(refreshed.rankedAt());
        assertThat(groupBoard(aliceId, "SINGLE", null, 20).entries().get(0).values()).as("the new game is on the board").containsExactly(2d, 2d);
        assertThatThrownBy(() -> leaderboardService.refreshGroupBoard(groupId, hostId)).isInstanceOf(TooManyRequestsException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SESSION_RANKING_COOLDOWN")
                .satisfies(e -> assertThat((Long) ((TooManyRequestsException) e).getErrorParams().get("retryAfterSeconds"))
                        .isBetween(3500L, 3600L));
    }

    @Test
    void aBoardJustBuiltByTheNightlyRunCannotBeRefreshedAndAGroupWithItsSwitchOffCannotEither() {
        rankOneGame();
        assertThatThrownBy(() -> leaderboardService.refreshGroupBoard(groupId, hostId)).isInstanceOf(TooManyRequestsException.class);

        builtAnHourAgo();
        GroupSessionSettings settings = groupSettingsRepository.findById(groupId).orElseThrow();
        settings.setStatisticsEnabled(false);
        groupSettingsRepository.save(settings);
        assertThatThrownBy(() -> leaderboardService.refreshGroupBoard(groupId, hostId)).isInstanceOf(ConflictException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SESSION_GROUP_STATISTICS_OFF");
    }

    @Test
    void aRefreshKeepsThePreviousRanksOfTheLastNightlyBuild() {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);                                         // alice, bob 1; carol, dan 3
        countRankedGame(venueId, List.of(aliceId, carolId), List.of(bobId, danId));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);                                         // alice 1; bob, carol 2; dan 4 (previous 1, 1, 3, 3)
        assertThat(tree("GROUP", groupId, "SINGLE").prevRankOf(String.valueOf(no(bobId)))).isEqualTo(1);
        builtAnHourAgo();
        countRankedGame(venueId, List.of(aliceId, carolId), List.of(bobId, danId));

        leaderboardService.refreshGroupBoard(groupId, hostId);

        BoardTree after = tree("GROUP", groupId, "SINGLE");
        assertThat(after.ranks().get(String.valueOf(no(carolId)))).as("carol now has two wins, alice three").isEqualTo(2);
        assertThat(after.prevRankOf(String.valueOf(no(bobId)))).as("the nightly build's previous rank, not the rank before this refresh")
                .isEqualTo(1);
        assertThat(after.prevRankOf(String.valueOf(no(carolId)))).isEqualTo(3);
    }

    @Test
    void aRefreshWhileTheBoardIsBeingBuiltIsToldSoAndAStaleClaimIsTakenOver() {
        rankOneGame();
        builtAnHourAgo();
        StatBoardRun run = runRepository.findById(new StatBoardRun.Key(sportId, "GROUP", groupId)).orElseThrow();
        run.setStatus(StatBoardRun.RUNNING);
        run.setClaimedAt(Instant.now().minusSeconds(30));
        runRepository.save(run);

        assertThatThrownBy(() -> leaderboardService.refreshGroupBoard(groupId, hostId)).isInstanceOf(ConflictException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SESSION_RANKING_IN_PROGRESS");

        run.setClaimedAt(Instant.now().minus(Duration.ofHours(1)));
        runRepository.save(run);
        assertThat(leaderboardService.refreshGroupBoard(groupId, hostId).rankedAt()).isNotNull();
    }

    @Test
    void twoRefreshesAtOnceBuildTheBoardOnce() throws Exception {
        rankOneGame();
        builtAnHourAgo();

        List<String> outcomes = inParallel(2, () -> {
            try {
                leaderboardService.refreshGroupBoard(groupId, hostId);
                return "built";
            } catch (TooManyRequestsException | ConflictException e) {
                return "refused";
            }
        });

        assertThat(outcomes).containsExactlyInAnyOrder("built", "refused");
        assertThat(runRepository.findById(new StatBoardRun.Key(sportId, "GROUP", groupId)).orElseThrow().getStatus()).isEqualTo("IDLE");
    }

    // ---- slice B: a group's own sort list --------------------------------------------------------------------------------------

    @Test
    void aGroupOwnerSetsTheGroupsOwnSortListAndTheBoardFollowsItWhileAMemberCannot() {
        rankOneGame();

        RankingRuleResponse saved = ruleService.saveGroupRule(hostId, groupId,
                request("SPORT", null, "SINGLE", List.of(Map.of("key", "wins", "dir", "ASC")), null));

        assertThat(saved.getScopeType()).as("the scope of the request is ignored").isEqualTo("GROUP");
        assertThat(saved.getScopeId()).isEqualTo(groupId);
        assertThatThrownBy(() -> ruleService.saveGroupRule(aliceId, groupId, request("GROUP", groupId, "SINGLE", defaultSort(), null)))
                .isInstanceOf(ForbiddenException.class).hasFieldOrPropertyWithValue("errorCode", "SESSION_GROUP_ADMIN_REQUIRED");
        assertThatThrownBy(() -> ruleService.saveGroupRule(createUser("outsider"), groupId, request("GROUP", groupId, "SINGLE", defaultSort(), null)))
                .isInstanceOf(ForbiddenException.class).hasFieldOrPropertyWithValue("errorCode", "SESSION_GROUP_MEMBER_REQUIRED");

        ranker.run(LeaderboardRanker.Mode.NIGHTLY);
        LeaderboardResponse board = groupBoard(aliceId, "SINGLE", null, 20);
        assertThat(board.sort()).hasSize(1);
        assertThat(board.entries().get(0).values()).as("fewest wins first now").containsExactly(0d);
        assertThat(board.entries().get(0).prevRank()).as("the previous rank is kept across a rule change").isNotNull();
        assertThat(leaderboardService.getRegionBoard(REGION, sportId, aliceId, "SINGLE", null, 20).sort()).as("the region board is the sport's").hasSize(2);
        assertThat(ruleService.listGroupRules(aliceId, groupId)).hasSize(1);

        ruleService.deleteGroupRule(hostId, groupId, "SINGLE");
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);
        assertThat(groupBoard(aliceId, "SINGLE", null, 20).sort()).as("back to the sport's rule").hasSize(2);
        assertThatThrownBy(() -> ruleService.deleteGroupRule(hostId, groupId, "SINGLE")).isInstanceOf(NotFoundException.class);
    }

    @Test
    void aGroupRuleIsCheckedAgainstTheSportsSchemaLikeAnAdminRule() {
        rankOneGame();
        assertThatThrownBy(() -> ruleService.saveGroupRule(hostId, groupId,
                request("GROUP", groupId, "SINGLE", List.of(Map.of("key", "scoreDiff", "dir", "DESC")), null)))
                .isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "SESSION_RANKING_SORT_INVALID");
        assertThatThrownBy(() -> ruleService.saveGroupRule(hostId, groupId, request("GROUP", groupId, "TEAM", defaultSort(), null)))
                .isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "SESSION_RANKING_KIND_INVALID");
    }

    // ---- slice B: more cases ---------------------------------------------------------------------------------

    @Test
    void aCursorPastTheEndAnswersAnEmptyPageAndPagesOfTwoEndWithoutACursor() {
        rankOneGame();

        LeaderboardResponse first = groupBoard(aliceId, "SINGLE", null, 2);
        LeaderboardResponse second = groupBoard(aliceId, "SINGLE", first.nextCursor(), 2);
        LeaderboardResponse past = groupBoard(aliceId, "SINGLE", 100, 20);

        assertThat(first.entries()).hasSize(2);
        assertThat(first.nextCursor()).isEqualTo(2);
        assertThat(second.entries()).hasSize(2);
        assertThat(second.nextCursor()).as("the last page has no cursor").isNull();
        assertThat(past.entries()).isEmpty();
        assertThat(past.nextCursor()).isNull();
        assertThat(past.total()).isEqualTo(4);
        assertThat(past.me()).as("the caller's own place does not depend on the page").isNotNull();
        assertThat(groupBoard(aliceId, "SINGLE", null, 50).entries()).as("the largest page is accepted").hasSize(4);
    }

    @Test
    void aMemberWithNoGameHasNoPlaceAndAMemberWhoLeftCannotReadTheBoardAnyMore() {
        rankOneGame();

        assertThat(groupBoard(hostId, "SINGLE", null, 20).me()).as("the owner played nothing").isNull();
        groupMemberRepository.findAll().stream().filter(m -> m.getGroupId().equals(groupId) && m.getUserId().equals(carolId))
                .forEach(groupMemberRepository::delete);

        assertThatThrownBy(() -> groupBoard(carolId, "SINGLE", null, 20)).isInstanceOf(ForbiddenException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SESSION_GROUP_MEMBER_REQUIRED");
    }

    @Test
    void aGroupWithoutASportHasNoBoardToRead() {
        Long noSport = groupRepository.save(Group.builder().groupName("No sport " + UUID.randomUUID()).createdBy(hostId)
                .isPrivate(true).isActive(true).build()).getId();
        groupMemberRepository.save(GroupMember.builder().groupId(noSport).userId(hostId).roleId(ROLE_OWNER).build());

        assertThatThrownBy(() -> leaderboardService.getGroupBoard(noSport, hostId, "SINGLE", null, 20))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void aRegionAndACountryBoardRefuseABadKindAndPageSizeToo() {
        rankOneGame();

        assertThatThrownBy(() -> leaderboardService.getRegionBoard(REGION, sportId, aliceId, "TEAM", null, 20))
                .isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "SESSION_RANKING_KIND_INVALID");
        assertThatThrownBy(() -> leaderboardService.getCountryBoard(COUNTRY, sportId, aliceId, "SINGLE", null, 51))
                .isInstanceOf(BadRequestException.class);
        assertThatThrownBy(() -> leaderboardService.getCountryBoard(COUNTRY, sportId, aliceId, "SINGLE", -5, 20))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void theFirstRefreshBuildsABoardNobodyHasBuiltYet() {
        setRules();
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        assertThat(groupBoard(aliceId, "SINGLE", null, 20).rankedAt()).as("nothing built yet").isNull();

        LeaderboardRefreshResponse refreshed = leaderboardService.refreshGroupBoard(groupId, hostId);

        LeaderboardResponse board = groupBoard(aliceId, "SINGLE", null, 20);
        assertThat(board.total()).isEqualTo(4);
        assertThat(board.rankedAt()).as("stored when the build is published, a moment after the claim the answer names")
                .isBetween(refreshed.rankedAt(), refreshed.rankedAt().plusSeconds(5));
        assertThat(board.entries().get(0).prevRank()).as("no nightly build before it: no previous rank").isNull();
    }

    @Test
    void aGroupRuleOfOneGroupDoesNotTouchAnotherGroupOfTheSport() {
        rankOneGame();
        Long other = groupRepository.save(Group.builder().groupName("Other " + UUID.randomUUID()).sportId(sportId).createdBy(hostId)
                .isPrivate(true).isActive(true).build()).getId();
        groupMemberRepository.save(GroupMember.builder().groupId(other).userId(hostId).roleId(ROLE_OWNER).build());

        ruleService.saveGroupRule(hostId, groupId, request("GROUP", groupId, "SINGLE", List.of(Map.of("key", "wins", "dir", "ASC")), null));

        assertThat(ruleService.listGroupRules(hostId, groupId)).hasSize(1);
        assertThat(ruleService.listGroupRules(hostId, other)).as("the other group has no rule of its own").isEmpty();
    }

    @Test
    void anOutsiderCannotListAGroupsRulesAndAMemberCannotDeleteOne() {
        rankOneGame();
        ruleService.saveGroupRule(hostId, groupId, request("GROUP", groupId, "SINGLE", defaultSort(), null));

        assertThatThrownBy(() -> ruleService.listGroupRules(createUser("outsider"), groupId)).isInstanceOf(ForbiddenException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SESSION_GROUP_MEMBER_REQUIRED");
        assertThatThrownBy(() -> ruleService.deleteGroupRule(aliceId, groupId, "SINGLE")).isInstanceOf(ForbiddenException.class)
                .hasFieldOrPropertyWithValue("errorCode", "SESSION_GROUP_ADMIN_REQUIRED");
        assertThat(ruleService.listGroupRules(aliceId, groupId)).as("the rule is still there").hasSize(1);
    }

    @Test
    void aGroupRulesRequireListKeepsPlayersOffTheBoardUntilTheyHaveEnoughGames() {
        rankOneGame();
        ruleService.saveGroupRule(hostId, groupId, request("GROUP", groupId, "SINGLE", defaultSort(), atLeastGames(2)));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);
        assertThat(groupBoard(aliceId, "SINGLE", null, 20).entries()).as("one game each: nobody is listed yet").isEmpty();

        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);

        assertThat(groupBoard(aliceId, "SINGLE", null, 20).entries()).as("two games each").hasSize(4);
    }

    // ---- SESSION-82: the sessions stat in the rules ------------------------------------------------------------------------

    private void switchToASportThatCollectsSessions() {
        sportId = newSport(doublesSchema(Map.of("columns", List.of("games", "wins", "sessions"),
                "groupBy", List.of(Map.of("by", "PARTNER")))), true);
        Group group = groupRepository.findById(groupId).orElseThrow();
        group.setSportId(sportId);
        groupRepository.save(group);
    }

    @Test
    void aSinglesBoardSortsAndRequiresOnTheSessionsStat() {
        switchToASportThatCollectsSessions();
        ruleService.save(hostId, sportId, request("SPORT", null, "SINGLE", List.of(Map.of("key", "sessions", "dir", "DESC")),
                List.of(Map.of("key", "sessions", "op", ">=", "value", 1))));
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);

        LeaderboardResponse board = groupBoard(aliceId, "SINGLE", null, 20);

        assertThat(board.total()).as("the four players and the owner who only joined").isEqualTo(5);
        assertThat(board.entries()).allSatisfy(entry -> assertThat(entry.values()).containsExactly(1d));
        assertThat(board.entries()).extracting(LeaderboardEntryDto::rank).containsOnly(1);

        ruleService.save(hostId, sportId, request("SPORT", null, "SINGLE", List.of(Map.of("key", "sessions", "dir", "DESC")),
                List.of(Map.of("key", "sessions", "op", ">=", "value", 2))));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);
        assertThat(groupBoard(aliceId, "SINGLE", null, 20).entries()).as("nobody has two sessions yet").isEmpty();
    }

    @Test
    void aSportRuleThatNamesAStatAGroupSwitchedOffReadsItAsNoValueForThatGroup() {
        switchToASportThatCollectsSessions();
        List<Object> sort = List.of(Map.of("key", "sessions", "dir", "DESC"), Map.of("key", "wins", "dir", "DESC"));
        ruleService.save(hostId, sportId, request("SPORT", null, "SINGLE", sort, List.of(Map.of("key", "sessions", "op", ">=", "value", 1))));
        countRankedGame(venueId, List.of(aliceId, bobId), List.of(carolId, danId));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);
        assertThat(groupBoard(aliceId, "SINGLE", null, 20).total()).as("everyone has played a session").isEqualTo(5);

        groupConfigService.updateSettings(groupId, hostId, com.sportconnect.session.api.dto.UpdateGroupSessionSettingsRequest.builder()
                .statsConfig(Map.of("sessions", Map.of("enabled", false))).build());      // the board is marked for a rebuild by the change itself
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);
        assertThat(groupBoard(aliceId, "SINGLE", null, 20).entries()).as("a precondition on a stat the group does not collect lists nobody").isEmpty();

        ruleService.save(hostId, sportId, request("SPORT", null, "SINGLE", sort, null));
        ranker.run(LeaderboardRanker.Mode.NIGHTLY);
        LeaderboardResponse board = groupBoard(aliceId, "SINGLE", null, 20);
        assertThat(board.total()).as("the owner has nothing but the stat, so no value at all: not listed").isEqualTo(4);
        assertThat(board.entries()).allSatisfy(entry -> assertThat(entry.values().get(0)).as("the stat has no value").isNull());
        assertThat(board.entries()).extracting(LeaderboardEntryDto::rank).as("a sort key on it ties everyone, wins splits them").startsWith(1, 1);
        assertThat(leaderboardService.getRegionBoard(REGION, sportId, aliceId, "SINGLE", null, 20).entries())
                .as("the region board is not the group's: it still has the stat").allSatisfy(entry -> assertThat(entry.values().get(0)).isNotNull());
    }

    @Test
    void aPairRuleCannotNameAStatThatAppliesToASinglePlayerOnly() {
        switchToASportThatCollectsSessions();

        assertThatThrownBy(() -> ruleService.save(hostId, sportId, request("SPORT", null, "PARTNER",
                List.of(Map.of("key", "sessions", "dir", "DESC")), null)))
                .isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "SESSION_RANKING_SORT_INVALID")
                .hasFieldOrPropertyWithValue("errorParams", Map.of("reason", "STAT_NOT_FOR_KIND", "detail", "sessions"));
        assertThatThrownBy(() -> ruleService.save(hostId, sportId, request("SPORT", null, "PARTNER", defaultSort(),
                List.of(Map.of("key", "sessions", "op", ">=", "value", 1)))))
                .isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "SESSION_RANKING_REQUIRE_INVALID")
                .hasFieldOrPropertyWithValue("errorParams", Map.of("reason", "STAT_NOT_FOR_KIND", "detail", "sessions"));
        assertThatThrownBy(() -> ruleService.saveGroupRule(hostId, groupId, request("GROUP", groupId, "PARTNER",
                List.of(Map.of("key", "sessions", "dir", "DESC")), null)))
                .isInstanceOf(BadRequestException.class).hasFieldOrPropertyWithValue("errorCode", "SESSION_RANKING_SORT_INVALID");
        assertThatCode(() -> ruleService.save(hostId, sportId, request("SPORT", null, "PARTNER", defaultSort(), null)))
                .as("the same sport's pair rule on stats pairs hold is fine").doesNotThrowAnyException();
    }

    // ---- helpers -----------------------------------------------------------------------------------------------------------

    private <T> T inTx(java.util.function.Supplier<T> work) {
        return new org.springframework.transaction.support.TransactionTemplate(transactionManager).execute(status -> work.get());
    }

    private void makeDue(Long sport, String type, Long scope) {
        StatBoardRun run = runRepository.findById(new StatBoardRun.Key(sport, type, scope)).orElseThrow();
        run.setNextAttemptAt(Instant.now().minusSeconds(5));
        runRepository.save(run);
    }

    private <T> List<T> inParallel(int threads, Callable<T> work) throws Exception {
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        try {
            CyclicBarrier barrier = new CyclicBarrier(threads);
            List<Future<T>> futures = new ArrayList<>();
            for (int i = 0; i < threads; i++) {
                futures.add(pool.submit(() -> {
                    barrier.await(10, TimeUnit.SECONDS);
                    return work.call();
                }));
            }
            List<T> results = new ArrayList<>();
            for (Future<T> future : futures) {
                results.add(future.get(90, TimeUnit.SECONDS));
            }
            return results;
        } finally {
            pool.shutdownNow();
        }
    }

    /** The default rules: wins descending then games ascending, for singles and pairs, no minimum. */
    private void setRules() {
        ruleService.save(hostId, sportId, request("SPORT", null, "SINGLE", defaultSort(), null));
        ruleService.save(hostId, sportId, request("SPORT", null, "PARTNER", defaultSort(), null));
    }

    private static List<Object> defaultSort() {
        return List.of(Map.of("key", "wins", "dir", "DESC"), Map.of("key", "games", "dir", "ASC"));
    }

    private static List<Object> atLeastGames(int games) {
        return List.of(Map.of("key", "games", "op", ">=", "value", games));
    }

    private static RankingRuleRequest request(String scopeType, Long scopeId, String kind, List<Object> sort, List<Object> require) {
        return RankingRuleRequest.builder().scopeType(scopeType).scopeId(scopeId).kind(kind).sort(sort).require(require).build();
    }

    /** One ranking game in its own session at the venue, counted by the real engine (the board runs are marked and the change rows written). */
    private void countRankedGame(Long atVenue, List<UUID> winners, List<UUID> losers) {
        Long sessionId = completedSession(groupId, atVenue, 2);
        Long recordId = game(sessionId, winners, losers, 21, 15);
        List<UUID> all = new ArrayList<>(winners);
        all.addAll(losers);
        propose(recordId, winners.get(0), all);
        statsRunner.processDue();
    }

    private BoardTree tree(String scopeType, Long scopeId, String kind) {
        return BoardTree.fromJson(entryRepository.findById(new LeaderboardEntry.Key(sportId, scopeType, scopeId, kind))
                .orElseThrow(() -> new AssertionError("no " + kind + " board for " + scopeType + " " + scopeId)).getTree());
    }

    private static String pair(UUID a, UUID b) {
        return a.toString().compareTo(b.toString()) <= 0 ? a + "," + b : b + "," + a;
    }

    private int no(UUID user) {
        return memberNumbers.getMemberNumbers(groupId, List.of(user)).get(user);
    }

    private String numbered(UUID a, UUID b) {
        int x = no(a);
        int y = no(b);
        return Math.min(x, y) + "," + Math.max(x, y);
    }

    private void switchStatistics(Long sport, boolean on) {
        Sport row = sportRepository.findById(sport).orElseThrow();
        row.setStatisticsEnabled(on);
        sportRepository.save(row);
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

    private Long newSport(Map<String, Object> schema, boolean statisticsEnabled) {
        Long id = sportRepository.save(Sport.builder().name("SESSION-54 " + UUID.randomUUID()).isActive(true)
                .statisticsEnabled(statisticsEnabled).resultSchema(schema).build()).getId();
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
        return id;
    }

    private Long venue(Long countryId, Long regionId) {
        return locationRepository.save(Location.builder().sportId(sportId).name("Venue " + UUID.randomUUID())
                .timezone("Asia/Ho_Chi_Minh").createdBy(hostId).countryId(countryId).regionId(regionId).build()).getId();
    }

    private Long completedSession(Long sessionGroupId, Long locationId, long endedDaysAgo) {
        Instant end = Instant.now().minus(Duration.ofDays(endedDaysAgo)).minusSeconds(60);
        Long postId = postRepository.save(Post.builder().userId(hostId).groupId(null).postType(PostType.SESSION_POST)
                .content("Session: fixture").visibility("private").isActive(true).build()).getId();
        Long id = sessionRepository.save(Session.builder().title("Boards session")
                .groupId(sessionGroupId)
                .isPublic(sessionGroupId == null)
                .postId(postId)
                .sessionType(sessionGroupId == null ? SessionType.STANDALONE : SessionType.GROUP_RECURRING)
                .createdBy(hostId)
                .sportId(sportId)
                .locationId(locationId)
                .scheduledStart(end.minus(Duration.ofHours(2)))
                .scheduledEndAt(end)
                .status(SessionStatus.COMPLETED)
                .capacity(9999)
                .feeType(FeeType.FREE)
                .initialSlot(0)
                .autoApprove(false)
                .build()).getId();
        for (UUID player : List.of(hostId, aliceId, bobId, carolId, danId)) {
            participantRepository.save(SessionParticipant.builder().sessionId(id).userId(player)
                    .status(ParticipantStatus.JOINED).build());
        }
        return id;
    }

    private Long game(Long sessionId, List<UUID> first, List<UUID> second, int firstScore, int secondScore) {
        List<Integer> a = new ArrayList<>();
        a.add(firstScore);
        List<Integer> b = new ArrayList<>();
        b.add(secondScore);
        Map<String, Object> data = Map.of("teams", List.of(
                Map.of("players", first.stream().map(UUID::toString).toList(), "scores", a),
                Map.of("players", second.stream().map(UUID::toString).toList(), "scores", b)));
        Instant now = Instant.now();
        return recordRepository.save(SessionRecord.builder().sessionId(sessionId).data(data)
                .clientRequestId(UUID.randomUUID()).createdBy(hostId).createdAt(now).updatedBy(hostId).updatedAt(now)
                .build()).getId();
    }

    private void propose(Long recordId, UUID proposer, List<UUID> confirmers) {
        SessionRecord record = recordRepository.findById(recordId).orElseThrow();
        record.setRankingRequestedBy(proposer);
        record.setRankingRequestedAt(Instant.now());
        recordRepository.save(record);
        for (UUID confirmer : confirmers) {
            verificationRepository.save(SessionRecordVerification.builder().recordId(recordId).userId(confirmer)
                    .revision(record.getRevision()).verifiedAt(Instant.now()).build());
        }
    }

    /** Badminton: doubles, a scoreboard of games and wins grouped by partner (the sort is the rules' now, not the schema's). */
    private static Map<String, Object> badmintonSchema() {
        return doublesSchema(Map.of("columns", List.of("games", "wins"), "groupBy", List.of(Map.of("by", "PARTNER"))));
    }

    private static Map<String, Object> doublesSchema(Map<String, Object> scoreboard) {
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("data", Map.of("type", "COMPETITIVE",
                "playersPerSide", Map.of("min", 1, "max", 2),
                "score", Map.of("slot", List.of(Map.of("required", true, "rule", ">=0&<=30")))));
        if (scoreboard != null) {
            record.put("scoreboard", scoreboard);
        }
        return Map.of("version", 1, "maxRecords", 100, "record", record);
    }
}
