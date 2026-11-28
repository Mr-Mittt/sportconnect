package com.sportconnect.integration;

import com.sportconnect.group.api.service.GroupMemberNumberService;
import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.session.entity.GroupSessionSettings;
import com.sportconnect.session.repository.GroupSessionSettingsRepository;
import com.sportconnect.location.entity.Location;
import com.sportconnect.location.repository.LocationRepository;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.record.SessionRecord;
import com.sportconnect.session.record.SessionRecordRepository;
import com.sportconnect.session.record.SessionRecordVerification;
import com.sportconnect.session.record.SessionRecordVerificationRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.session.stats.GroupH2hDoc;
import com.sportconnect.session.stats.GroupMemberStats;
import com.sportconnect.session.stats.GroupMemberStatsRepository;
import com.sportconnect.session.stats.GroupStats;
import com.sportconnect.session.stats.GroupStatsDoc;
import com.sportconnect.session.stats.GroupStatsRepository;
import com.sportconnect.session.stats.LeaderboardEntryRepository;
import com.sportconnect.session.stats.PlayerStatsDoc;
import com.sportconnect.session.stats.SessionStatsJob;
import com.sportconnect.session.stats.SessionStatsJobRepository;
import com.sportconnect.session.stats.SessionStatsRunner;
import com.sportconnect.session.stats.StatBoardRun;
import com.sportconnect.session.stats.StatsHistory;
import com.sportconnect.session.stats.StatBoardRunRepository;
import com.sportconnect.session.stats.UserSportStats;
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
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SESSION-53 (reworked 2026-11-25): the statistics engine through the real Spring context and the H2 schema: a completed
 * session of a sport with statistics switched on, whose guard has passed, is counted once with exactly the stats the sport's
 * {@code record.scoreboard.columns} need (personal, partner, group member and venue-scope counters, the history, the dirty
 * boards, and in a group session the head-to-head of its pairs); the engine writes nothing to {@code leaderboard_entry}; a
 * sport with the switch off is never picked and one with no columns collects nothing; invalid and planned records are
 * ignored with their reason; a failure is retried and given up; two workers never count a session twice nor lose a player's
 * or a group's update.
 *
 * <p>The tick and its worker thread are off in the test profile; the tests call {@link SessionStatsRunner#processDue()}.
 * This suite runs on H2 in one JVM: the threads prove the portable claim and row-lock logic, not PostgreSQL's own lock
 * behaviour, the {@code FOR UPDATE} order in two real instances, or the real engine's plan.
 */
class SessionStatsIntegrationTest extends RedisBaseIT {

    private static final Integer ROLE_OWNER = 1;
    private static final Integer ROLE_MEMBER = 3;
    private static final long COUNTRY = 84L;
    private static final long REGION = 79L;

    @Autowired private SessionStatsRunner runner;
    @Autowired private SessionStatsJobRepository jobRepository;
    @Autowired private UserSportStatsRepository userStatsRepository;
    @Autowired private GroupMemberStatsRepository groupMemberStatsRepository;
    @Autowired private GroupStatsRepository groupH2hRepository;
    @Autowired private GroupMemberNumberService memberNumbers;
    @Autowired private com.sportconnect.group.repository.GroupMemberNumberRepository memberNumberRepository;
    @Autowired private com.sportconnect.group.repository.GroupMemberNumberCounterRepository memberNumberCounterRepository;
    @Autowired private LeaderboardEntryRepository leaderboardRepository;
    @Autowired private com.sportconnect.session.stats.StatBoardChangeRepository boardChangeRepository;
    @Autowired private StatBoardRunRepository boardRunRepository;
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

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        hostId = createUser("host");
        aliceId = createUser("alice");
        bobId = createUser("bob");
        carolId = createUser("carol");
        danId = createUser("dan");
        sportId = newSport(badmintonSchema(), true);
        groupId = groupRepository.save(Group.builder().countryId(1L).regionId(1L).groupName("Stats " + UUID.randomUUID())
                .createdBy(hostId).isPrivate(true).isActive(true).build()).getId();
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(hostId).roleId(ROLE_OWNER).build());
        groupSettingsRepository.save(GroupSessionSettings.builder().groupId(groupId).statisticsEnabled(true).build());   // SESSION-78: off by default
        for (UUID member : List.of(aliceId, bobId, carolId, danId)) {
            groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(member).roleId(ROLE_MEMBER).build());
        }
        venueId = venue(COUNTRY, REGION);
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
    }

    private void clearAll() {
        boardRunRepository.deleteAll();
        boardChangeRepository.deleteAll();
        leaderboardRepository.deleteAll();
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

    // ---- the counting itself ------------------------------------------------------------------------------------

    @Test
    void aGroupSessionIsCountedForEveryPlayerWithExactlyTheStatsTheColumnsNeed() {
        Long sessionId = completedSession(groupId, venueId, 2);
        Long ranked = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        propose(ranked, aliceId, List.of(aliceId, bobId, carolId, danId));
        Long normal = game(sessionId, List.of(carolId, danId), List.of(aliceId, bobId), 21, 18);

        assertThat(runner.processDue()).isEqualTo(1);

        SessionStatsJob job = jobRepository.findById(sessionId).orElseThrow();
        assertThat(job.getStatus()).isEqualTo(SessionStatsJob.Status.DONE);
        assertThat(job.getCounted()).isEqualTo(2);
        assertThat(job.getIgnored()).isZero();
        // the job's result says, for each counted game, whether it counted as a ranking game (as the history pointer does)
        assertThat(rankingMarks(job)).containsOnly(Map.entry(ranked, true), Map.entry(normal, false));

        // alice: two games, one won and one lost; the first one was a ranking game. The columns are games, wins, scoreFor and
        // scoreAgainst, so losses (not listed) is not stored at all.
        PlayerStatsDoc alice = player(aliceId);
        assertThat(alice.personal().all().value("games")).isEqualTo(2.0);
        assertThat(alice.personal().all().value("wins")).isEqualTo(1.0);
        assertThat(alice.personal().all().value("scoreFor")).isEqualTo(39.0);      // 21 + 18
        assertThat(alice.personal().all().value("scoreAgainst")).isEqualTo(36.0);  // 15 + 21
        assertThat(alice.personal().all().value("losses")).isNull();
        assertThat(alice.personal().ranked().value("games")).isEqualTo(1.0);
        assertThat(alice.personal().ranked().value("wins")).isEqualTo(1.0);
        assertThat(alice.personal().ranked().value("scoreFor")).isEqualTo(21.0);

        // the one grouping is PARTNER: bob, and only bob (carol and dan were the opponents), with the ranking split
        assertThat(alice.group("PARTNER", bobId.toString()).all().value("games")).isEqualTo(2.0);
        assertThat(alice.group("PARTNER", bobId.toString()).all().value("wins")).isEqualTo(1.0);
        assertThat(alice.group("PARTNER", bobId.toString()).ranked().value("games")).isEqualTo(1.0);
        assertThat(alice.group("PARTNER", bobId.toString()).ranked().value("wins")).isEqualTo(1.0);
        UserSportStats aliceRow = userStatsRepository.findById(new UserSportStats.Key(aliceId, sportId)).orElseThrow();
        assertThat(aliceRow.getGroupings().keySet()).containsExactly("PARTNER");
        assertThat(keysOf(aliceRow, "PARTNER")).containsExactly(bobId.toString());

        // a ranking game counts at the venue's region and country, though no player has a region of their own
        assertThat(alice.scope("REGION", COUNTRY, REGION).counters().value("games")).isEqualTo(1.0);
        assertThat(alice.scope("COUNTRY", COUNTRY, null).counters().value("games")).isEqualTo(1.0);
        assertThat(alice.scope("REGION", COUNTRY, REGION).group("PARTNER", bobId.toString()).value("wins")).isEqualTo(1.0);
        assertThat(player(carolId).scope("REGION", COUNTRY, REGION).counters().value("wins")).isEqualTo(0.0);

        // the group member's counters cover both games, with no ranked split; history is newest first with the ranking mark
        GroupStatsDoc member = member(aliceId);
        assertThat(member.counters().value("games")).isEqualTo(2.0);
        // a group's rows name the partner by the group's permanent member number, not by user id (SESSION-81)
        assertThat(member.group("PARTNER", String.valueOf(no(bobId))).value("games")).isEqualTo(2.0);
        assertThat(member.group("PARTNER", String.valueOf(no(bobId))).value("wins")).isEqualTo(1.0);
        assertThat(keySetOf(((Map<?, ?>) groupMemberStatsRepository.findById(new GroupMemberStats.Key(groupId, aliceId, sportId))
                .orElseThrow().getStats().get("groupings")).get("PARTNER"))).containsExactly(String.valueOf(no(bobId)));
        assertThat(userStatsRepository.findById(new UserSportStats.Key(aliceId, sportId)).orElseThrow().getHistory()).hasSize(2);
        UserSportStats row = userStatsRepository.findById(new UserSportStats.Key(aliceId, sportId)).orElseThrow();
        assertThat(row.getHistory()).containsExactly(StatsHistory.entry(normal, false), StatsHistory.entry(ranked, true));
        assertThat(groupMemberStatsRepository.findById(new GroupMemberStats.Key(groupId, aliceId, sportId)).orElseThrow().getHistory())
                .containsExactly(StatsHistory.entry(normal, false), StatsHistory.entry(ranked, true));       // the same entries in the group member's row

        // the engine writes nothing to leaderboard_entry (SESSION-54 builds the boards), but tells which boards changed
        assertThat(leaderboardRepository.findAll()).isEmpty();
        assertThat(dirty("GROUP", groupId)).isTrue();
        assertThat(dirty("REGION", REGION)).isTrue();
        assertThat(dirty("COUNTRY", COUNTRY)).isTrue();
    }

    @Test
    void aGroupSessionOfAPartnerSportKeepsTheHeadToHeadOfItsPairs() {
        Long sessionId = completedSession(groupId, venueId, 2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);    // alice and bob win
        game(sessionId, List.of(carolId, danId), List.of(aliceId, bobId), 21, 18);    // carol and dan win

        runner.processDue();

        GroupStats row = groupH2hRepository.findById(new GroupStats.Key(groupId, sportId)).orElseThrow();
        GroupH2hDoc h2h = GroupH2hDoc.read(row);
        assertThat(h2h.size()).isEqualTo(1);
        assertThat(h2h.seq()).isEqualTo(2);
        // the members are named by the group's permanent member numbers; one win each
        assertThat(h2h.matchup(nums(aliceId, bobId), nums(carolId, danId))).containsExactly(1L, 1L, 2L);
        assertThat(h2h.matchup(nums(danId, carolId), nums(bobId, aliceId))).containsExactly(1L, 1L, 2L);
        assertThat(keySetOf(row.getH2h().get("h2h"))).containsExactly(GroupH2hDoc.matchupKey(
                GroupH2hDoc.order(no(aliceId), no(bobId)), GroupH2hDoc.order(no(carolId), no(danId))));
        assertThat(row.getH2h()).doesNotContainKey("members");       // the group module owns the numbers: no dictionary here
    }

    @Test
    void theHeadToHeadGrowsAcrossTheSessionsOfOneGroup() {
        Long first = completedSession(groupId, venueId, 3);
        game(first, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        Long second = completedSession(groupId, venueId, 2);
        game(second, List.of(carolId, danId), List.of(aliceId, bobId), 21, 10);
        game(second, List.of(aliceId, carolId), List.of(bobId, danId), 21, 19);

        assertThat(runner.processDue()).isEqualTo(2);

        GroupH2hDoc h2h = GroupH2hDoc.read(groupH2hRepository.findById(new GroupStats.Key(groupId, sportId)).orElseThrow());
        assertThat(h2h.size()).isEqualTo(2);
        assertThat(h2h.seq()).isEqualTo(3);
        assertThat(h2h.matchup(nums(aliceId, bobId), nums(carolId, danId))).containsExactly(1L, 1L, 2L);
        // alice and carol beat bob and dan. The wins follow the key (the smaller pair first), and the numbers come from random user
        // ids, so which pair is first is not fixed: the winners' win is the first number only when their pair is the smaller one.
        List<Integer> aliceCarol = nums(aliceId, carolId);
        List<Integer> bobDan = nums(bobId, danId);
        long[] expected = pairOrder(aliceCarol).compareTo(pairOrder(bobDan)) <= 0 ? new long[]{1L, 0L, 3L} : new long[]{0L, 1L, 3L};
        assertThat(h2h.matchup(aliceCarol, bobDan)).containsExactly(expected[0], expected[1], expected[2]);
        assertThat(h2h.matchup(bobDan, aliceCarol)).containsExactly(expected[0], expected[1], expected[2]);
    }

    @Test
    void aNormalGameCountsForThePlayersAndTheGroupButNotForTheRegionOrCountry() {
        Long sessionId = completedSession(groupId, venueId, 2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        runner.processDue();

        PlayerStatsDoc alice = player(aliceId);
        assertThat(alice.personal().all().value("games")).isEqualTo(1.0);
        assertThat(alice.personal().ranked().value("games")).isNull();
        assertThat(userStatsRepository.findById(new UserSportStats.Key(aliceId, sportId)).orElseThrow().getScopes()).isEmpty();
        assertThat(boardRunRepository.findAll()).extracting(StatBoardRun::getScopeType).containsOnly("GROUP");
    }

    @Test
    void aStandaloneSessionWritesNoGroupStatisticsNoHeadToHeadAndNoGroupBoard() {
        Long sessionId = completedSession(null, venueId, 2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        runner.processDue();

        assertThat(player(aliceId).personal().all().value("games")).isEqualTo(1.0);
        assertThat(groupMemberStatsRepository.findAll()).isEmpty();
        assertThat(groupH2hRepository.findAll()).isEmpty();
        assertThat(boardRunRepository.findAll()).isEmpty();
    }

    @Test
    void aGroupWithItsSwitchOffOrNoSettingsRowIsCountedForThePlayersOnlyAndOnlyLaterSessionsReachTheGroup() {
        groupSettingsRepository.deleteAll();                                                       // no row: off (SESSION-78)
        Long first = completedSession(groupId, venueId, 3);
        Long ranked = game(first, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        propose(ranked, aliceId, List.of(aliceId, bobId, carolId, danId));

        assertThat(runner.processDue()).isEqualTo(1);

        assertThat(jobRepository.findById(first).orElseThrow().getStatus()).isEqualTo(SessionStatsJob.Status.DONE);
        assertThat(player(aliceId).personal().all().value("games")).isEqualTo(1.0);              // the players are counted
        assertThat(player(aliceId).group("PARTNER", bobId.toString()).all().value("games")).isEqualTo(1.0);
        assertThat(groupMemberStatsRepository.findAll()).isEmpty();                                // the group rows are not written
        assertThat(groupH2hRepository.findAll()).isEmpty();
        assertThat(boardRunRepository.findAll()).extracting(StatBoardRun::getScopeType).doesNotContain("GROUP");

        // the owner switches it on: only sessions counted from now on reach the group
        groupSettingsRepository.save(GroupSessionSettings.builder().groupId(groupId).statisticsEnabled(true).build());
        Long second = completedSession(groupId, venueId, 2);
        game(second, List.of(aliceId, bobId), List.of(carolId, danId), 21, 10);

        assertThat(runner.processDue()).isEqualTo(1);

        assertThat(player(aliceId).personal().all().value("games")).isEqualTo(2.0);
        assertThat(groupMemberStatsRepository.findAll()).hasSize(4);
        assertThat(GroupStatsDoc.read(groupMemberStatsRepository.findById(new GroupMemberStats.Key(groupId, aliceId, sportId))
                .orElseThrow()).counters().value("games")).isEqualTo(1.0);                          // the first session never reached it
        assertThat(boardRunRepository.findAll()).extracting(StatBoardRun::getScopeType).contains("GROUP");
    }

    @Test
    void aGroupWhoseSwitchIsExplicitlyOffIsCountedLikeOneWithNoRow() {
        groupSettingsRepository.save(GroupSessionSettings.builder().groupId(groupId).statisticsEnabled(false).build());
        Long sessionId = completedSession(groupId, venueId, 2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        runner.processDue();

        assertThat(player(aliceId).personal().all().value("games")).isEqualTo(1.0);
        assertThat(groupMemberStatsRepository.findAll()).isEmpty();
        assertThat(groupH2hRepository.findAll()).isEmpty();
    }

    @Test
    void aRankingGameAtAVenueWithNoRegionCountsForTheCountryOnlyAndSaysSo() {
        Long noRegion = venue(COUNTRY, null);
        Long sessionId = completedSession(null, noRegion, 2);
        Long ranked = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        propose(ranked, aliceId, List.of(aliceId, bobId, carolId, danId));

        runner.processDue();

        PlayerStatsDoc alice = player(aliceId);
        assertThat(alice.scope("COUNTRY", COUNTRY, null).counters().value("games")).isEqualTo(1.0);
        assertThat(userStatsRepository.findById(new UserSportStats.Key(aliceId, sportId)).orElseThrow().getScopes()).hasSize(1);
        assertThat(boardRunRepository.findAll()).extracting(StatBoardRun::getScopeType).containsOnly("COUNTRY");
        assertThat(notes(sessionId)).containsExactly("NO_VENUE_REGION");
    }

    @Test
    void aRankingGameAtAVenueWithNoCountryStillCountsPersonallyAndSaysSo() {
        Long noGeo = venue(null, null);
        Long sessionId = completedSession(null, noGeo, 2);
        Long ranked = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        propose(ranked, aliceId, List.of(aliceId, bobId, carolId, danId));

        runner.processDue();

        assertThat(player(aliceId).personal().ranked().value("games")).isEqualTo(1.0);
        assertThat(userStatsRepository.findById(new UserSportStats.Key(aliceId, sportId)).orElseThrow().getScopes()).isEmpty();
        assertThat(boardRunRepository.findAll()).isEmpty();
        assertThat(notes(sessionId)).containsExactly("NO_VENUE_COUNTRY");
    }

    @Test
    void aProposedGameNotYetConfirmedByEveryoneIsANormalGame() {
        Long sessionId = completedSession(null, venueId, 2);
        Long proposed = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        propose(proposed, aliceId, List.of(aliceId, bobId, carolId));    // dan never confirmed

        runner.processDue();

        assertThat(player(aliceId).personal().all().value("games")).isEqualTo(1.0);
        assertThat(player(aliceId).personal().ranked().value("games")).isNull();
    }

    @Test
    void theOutcomeFollowsTheScoreAndOnlyInvalidAndEqualRecordsAreIgnoredWithTheirReason() {
        Long sessionId = completedSession(null, venueId, 2);
        Long good = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        Long planned = recordWithScores(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), null, null);   // no score: the first team wins
        Long duplicate = game(sessionId, List.of(aliceId, aliceId), List.of(carolId, danId), 21, 15);
        Long reversed = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 15, 21);                 // the second team has the higher score
        Long tie = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 21);                      // no draws in this sport

        runner.processDue();

        SessionStatsJob job = jobRepository.findById(sessionId).orElseThrow();
        assertThat(job.getStatus()).isEqualTo(SessionStatsJob.Status.DONE);
        assertThat(job.getCounted()).isEqualTo(3);
        assertThat(job.getIgnored()).isEqualTo(2);
        Map<Long, String> reasons = ignoredReasons(job);
        assertThat(reasons).containsEntry(duplicate, "DUPLICATE_PLAYER").containsEntry(tie, "SCORES_EQUAL").hasSize(2);
        assertThat(counted(job)).containsExactlyInAnyOrder(good, planned, reversed);
        // alice and bob won the good game and the planned one (first team) and lost the reversed one
        assertThat(player(aliceId).personal().all().value("games")).isEqualTo(3.0);
        assertThat(player(aliceId).personal().all().value("wins")).isEqualTo(2.0);
        assertThat(player(aliceId).personal().all().value("scoreFor")).isEqualTo(36.0);       // 21 + 15: the planned game gives no numbers
        assertThat(player(aliceId).personal().all().value("scoreAgainst")).isEqualTo(36.0);   // 15 + 21
        assertThat(player(carolId).personal().all().value("wins")).isEqualTo(1.0);            // the reversed game
    }

    @Test
    void equalScoresAreADrawWhenTheSportAllowsDrawsAndAreCountedAsNeitherAWinNorALoss() {
        Long draws = newSport(drawsSchema(), true);
        Long sessionId = completedSession(null, venueId, 2, draws);
        Long tie = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 21);

        runner.processDue();

        SessionStatsJob job = jobRepository.findById(sessionId).orElseThrow();
        assertThat(job.getStatus()).isEqualTo(SessionStatsJob.Status.DONE);
        assertThat(counted(job)).containsExactly(tie);
        UserSportStats row = userStatsRepository.findById(new UserSportStats.Key(aliceId, draws)).orElseThrow();
        PlayerStatsDoc alice = PlayerStatsDoc.read(row);
        assertThat(alice.personal().all().value("games")).isEqualTo(1.0);
        assertThat(alice.personal().all().value("wins")).isEqualTo(0.0);
        assertThat(alice.personal().all().value("losses")).isEqualTo(0.0);
    }

    @Test
    void aRankingGameTheSecondTeamWonCountsAsAWinForItsPlayersWhoeverIsNamedFirst() {
        Long sessionId = completedSession(null, venueId, 2);
        Long ranked = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 15, 21);
        propose(ranked, aliceId, List.of(aliceId, bobId, carolId, danId));

        runner.processDue();

        assertThat(rankingMarks(jobRepository.findById(sessionId).orElseThrow())).containsOnly(Map.entry(ranked, true));
        assertThat(player(carolId).personal().ranked().value("wins")).isEqualTo(1.0);
        assertThat(player(aliceId).personal().ranked().value("wins")).isEqualTo(0.0);
        assertThat(player(aliceId).personal().ranked().value("games")).isEqualTo(1.0);
    }

    @Test
    void aGameWithDifferentSideSizesCountsAsANormalGameEvenIfItWasProposedAndConfirmed() {
        Long sessionId = completedSession(null, venueId, 2);
        Long game = game(sessionId, List.of(aliceId, bobId), List.of(carolId), 21, 15);
        propose(game, aliceId, List.of(aliceId, bobId, carolId));

        runner.processDue();

        SessionStatsJob job = jobRepository.findById(sessionId).orElseThrow();
        assertThat(counted(job)).containsExactly(game);
        assertThat(rankingMarks(job)).containsOnly(Map.entry(game, false));
        assertThat(player(aliceId).personal().all().value("games")).isEqualTo(1.0);
        assertThat(player(aliceId).personal().ranked().value("games")).isNull();
    }

    @Test
    void aGameNamingSomeoneWhoLeftTheSessionIsIgnored() {
        Long sessionId = completedSession(null, venueId, 2);
        Long game = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        SessionParticipant bob = participantRepository.findBySessionIdAndUserId(sessionId, bobId).orElseThrow();
        bob.setStatus(ParticipantStatus.LEFT);
        participantRepository.save(bob);

        runner.processDue();

        SessionStatsJob job = jobRepository.findById(sessionId).orElseThrow();
        assertThat(job.getStatus()).isEqualTo(SessionStatsJob.Status.SKIPPED);
        assertThat(ignoredReasons(job)).containsEntry(game, "PLAYER_NOT_JOINED");
        assertThat(userStatsRepository.findAll()).isEmpty();
    }

    @Test
    void aSessionWhoseSportHasNoResultSchemaIsSkipped() {
        Long noSchema = newSport(null, true);
        Long sessionId = completedSession(null, venueId, 2, noSchema);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        runner.processDue();

        SessionStatsJob job = jobRepository.findById(sessionId).orElseThrow();
        assertThat(job.getStatus()).isEqualTo(SessionStatsJob.Status.SKIPPED);
        assertThat(userStatsRepository.findAll()).isEmpty();
    }

    @Test
    void aSessionWithNoRecordsIsSkipped() {
        Long sessionId = completedSession(null, venueId, 2);

        runner.processDue();

        assertThat(jobRepository.findById(sessionId).orElseThrow().getStatus()).isEqualTo(SessionStatsJob.Status.SKIPPED);
    }

    // ---- SESSION-82: the sessions stat -------------------------------------------------------------------------------------

    private static Map<String, Object> sessionsSchema(Map<String, Object> sessionsConfig) {
        Map<String, Object> scoreboard = new LinkedHashMap<>();
        scoreboard.put("columns", List.of("games", "wins", "sessions"));
        scoreboard.put("groupBy", List.of(Map.of("by", "PARTNER")));
        if (sessionsConfig != null) {
            scoreboard.put("config", Map.of("sessions", sessionsConfig));
        }
        return doublesSchema(scoreboard, Map.of("sort", List.of(Map.of("by", "wins", "dir", "DESC"))));
    }

    @Test
    void aSessionCountsEveryJoinedPlayerOnceByDefaultEvenOneWhoPlayedNoGameAndPairsNeverHoldIt() {
        sportId = newSport(sessionsSchema(null), true);
        Long first = completedSession(groupId, venueId, 2);
        game(first, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        game(first, List.of(carolId, danId), List.of(aliceId, bobId), 21, 18);
        Long second = completedSession(groupId, venueId, 2);
        game(second, List.of(aliceId, bobId), List.of(carolId, danId), 21, 10);

        assertThat(runner.processDue()).isEqualTo(2);

        assertThat(player(aliceId).personal().all().value("games")).isEqualTo(3.0);
        assertThat(player(aliceId).personal().all().value("sessions")).as("two sessions, three games").isEqualTo(2.0);
        assertThat(player(hostId).personal().all().value("sessions")).as("joined, no game: counted by default").isEqualTo(2.0);
        assertThat(player(hostId).personal().all().value("games")).isNull();
        assertThat(member(aliceId).counters().value("sessions")).isEqualTo(2.0);
        assertThat(member(hostId).counters().value("sessions")).isEqualTo(2.0);
        assertThat(player(aliceId).group("PARTNER", bobId.toString()).all().value("games")).isEqualTo(3.0);
        assertThat(player(aliceId).group("PARTNER", bobId.toString()).all().value("sessions")).as("a pair never holds it").isNull();
        assertThat(member(aliceId).group("PARTNER", String.valueOf(no(bobId))).value("sessions")).isNull();
        assertThat(jobRepository.findById(first).orElseThrow().getResult().get("sessions")).isEqualTo(5);
    }

    @Test
    void theAtLeastOneGameConfigCountsOnlyThePlayersWhoPlayedAndAndOrOrCombineTheTwoConditions() {
        sportId = newSport(sessionsSchema(Map.of("when", List.of("atLeast1Game"))), true);
        Long session = completedSession(groupId, venueId, 2);
        game(session, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        runner.processDue();
        assertThat(player(aliceId).personal().all().value("sessions")).isEqualTo(1.0);
        assertThat(player(hostId).personal().all().value("sessions")).as("the host played nothing").isNull();
        assertThat(member(aliceId).counters().value("sessions")).isEqualTo(1.0);

        // joined AND atLeast1Game: the same people as atLeast1Game (a counted game needs a joined player)
        sportId = newSport(sessionsSchema(Map.of("when", List.of("joined", "atLeast1Game"), "combine", "AND")), true);
        Long both = completedSession(groupId, venueId, 2);
        game(both, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        runner.processDue();
        assertThat(player(aliceId).personal().all().value("sessions")).isEqualTo(1.0);
        assertThat(player(hostId).personal().all().value("sessions")).isNull();

        // joined OR atLeast1Game: the same people as joined
        sportId = newSport(sessionsSchema(Map.of("when", List.of("joined", "atLeast1Game"), "combine", "OR")), true);
        Long either = completedSession(groupId, venueId, 2);
        game(either, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        runner.processDue();
        assertThat(player(aliceId).personal().all().value("sessions")).isEqualTo(1.0);
        assertThat(player(hostId).personal().all().value("sessions")).isEqualTo(1.0);
    }

    @Test
    void aSessionWithNoGamesStillCountsItsJoinedPlayersByDefaultAndIsSkippedWhenTheRuleNeedsAGame() {
        sportId = newSport(sessionsSchema(null), true);
        Long session = completedSession(groupId, venueId, 2);

        runner.processDue();

        SessionStatsJob job = jobRepository.findById(session).orElseThrow();
        assertThat(job.getStatus()).isEqualTo(SessionStatsJob.Status.DONE);
        assertThat(job.getCounted()).as("no game was counted").isZero();
        assertThat(job.getResult().get("sessions")).isEqualTo(5);
        assertThat(player(aliceId).personal().all().value("sessions")).isEqualTo(1.0);
        assertThat(player(aliceId).personal().all().value("games")).isNull();
        assertThat(member(aliceId).counters().value("sessions")).isEqualTo(1.0);
        assertThat(dirty("GROUP", groupId)).isTrue();

        sportId = newSport(sessionsSchema(Map.of("when", List.of("atLeast1Game"))), true);
        Long other = completedSession(groupId, venueId, 2);
        runner.processDue();
        assertThat(jobRepository.findById(other).orElseThrow().getStatus()).isEqualTo(SessionStatsJob.Status.SKIPPED);
        assertThat(player(aliceId).personal().all().value("sessions")).isNull();
    }

    @Test
    void theRankedRegionAndCountryCountersCountASessionOnlyForAPlayerWithARankingGameInIt() {
        sportId = newSport(sessionsSchema(null), true);
        Long session = completedSession(groupId, venueId, 2);
        Long ranked = game(session, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        propose(ranked, aliceId, List.of(aliceId, bobId, carolId, danId));
        Long normalOnly = completedSession(groupId, venueId, 2);
        game(normalOnly, List.of(aliceId, bobId), List.of(carolId, danId), 21, 10);

        runner.processDue();

        assertThat(player(aliceId).personal().all().value("sessions")).isEqualTo(2.0);
        assertThat(player(aliceId).personal().ranked().value("sessions")).as("one session had a ranking game").isEqualTo(1.0);
        assertThat(player(aliceId).scope("REGION", COUNTRY, REGION).counters().value("sessions")).isEqualTo(1.0);
        assertThat(player(aliceId).scope("COUNTRY", COUNTRY, null).counters().value("sessions")).isEqualTo(1.0);
        assertThat(player(hostId).personal().all().value("sessions")).isEqualTo(2.0);
        assertThat(player(hostId).personal().ranked().value("sessions")).as("no ranking game for the host").isNull();
        assertThat(player(hostId).scope("REGION", COUNTRY, REGION).counters().value("sessions")).isNull();
    }

    @Test
    void aGroupWithItsSwitchOffCountsSessionsForThePlayersOnly() {
        sportId = newSport(sessionsSchema(null), true);
        GroupSessionSettings settings = groupSettingsRepository.findById(groupId).orElseThrow();
        settings.setStatisticsEnabled(false);
        groupSettingsRepository.save(settings);
        Long session = completedSession(groupId, venueId, 2);
        game(session, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        runner.processDue();

        assertThat(player(aliceId).personal().all().value("sessions")).isEqualTo(1.0);
        assertThat(player(hostId).personal().all().value("sessions")).isEqualTo(1.0);
        assertThat(groupMemberStatsRepository.findAll()).as("no group rows while the group switch is off").isEmpty();
    }

    @Test
    void aRevivedJobRowDoesNotCountTheSessionsOfItsPlayersASecondTime() {
        sportId = newSport(sessionsSchema(null), true);
        Long session = completedSession(groupId, venueId, 2);
        game(session, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        runner.processDue();

        SessionStatsJob job = jobRepository.findById(session).orElseThrow();
        job.setStatus(SessionStatsJob.Status.RETRY);
        job.setNextAttemptAt(Instant.now().minusSeconds(5));
        jobRepository.save(job);
        assertThat(runner.processDue()).isEqualTo(1);

        assertThat(player(aliceId).personal().all().value("sessions")).isEqualTo(1.0);
        assertThat(player(hostId).personal().all().value("sessions")).as("no game to point at: the job row guards it").isEqualTo(1.0);
        assertThat(member(hostId).counters().value("sessions")).isEqualTo(1.0);
        assertThat(jobRepository.findById(session).orElseThrow().getResult().get("sessions")).isEqualTo(5);
    }

    @Test
    void aPlayerWhoseGameWasCountedBeforeIsNotCountedForTheSessionAgainEvenWhenTheJobRowKeptNoSessionsCount() {
        sportId = newSport(sessionsSchema(null), true);
        Long session = completedSession(groupId, venueId, 2);
        game(session, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        runner.processDue();

        SessionStatsJob job = jobRepository.findById(session).orElseThrow();
        job.setResult(null);                                              // a row from before the stat existed
        job.setStatus(SessionStatsJob.Status.RETRY);
        job.setNextAttemptAt(Instant.now().minusSeconds(5));
        jobRepository.save(job);
        runner.processDue();

        assertThat(player(aliceId).personal().all().value("games")).isEqualTo(1.0);
        assertThat(player(aliceId).personal().all().value("sessions")).as("her game's pointer says she was counted").isEqualTo(1.0);
    }

    // ---- SESSION-83: the group's own stats config ----------------------------------------------------------------------------

    private void groupStatsConfig(Map<String, Object> config) {
        GroupSessionSettings settings = groupSettingsRepository.findById(groupId).orElseThrow();
        settings.setStatsConfig(config);
        groupSettingsRepository.save(settings);
    }

    private boolean hasGroupRow(UUID user) {
        return groupMemberStatsRepository.findById(new GroupMemberStats.Key(groupId, user, sportId)).isPresent();
    }

    @Test
    void aGroupsOwnWhenReplacesTheSportsRuleForTheGroupRowOnlyAndAPlayerItDoesNotCountGetsNoGroupRow() {
        sportId = newSport(sessionsSchema(null), true);                          // the sport: joined
        groupStatsConfig(Map.of("config", Map.of("sessions", Map.of("when", List.of("atLeast1Game")))));
        Long session = completedSession(groupId, venueId, 2);
        game(session, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        runner.processDue();

        assertThat(player(hostId).personal().all().value("sessions")).as("own totals follow the sport: joined").isEqualTo(1.0);
        assertThat(player(aliceId).personal().all().value("sessions")).isEqualTo(1.0);
        assertThat(member(aliceId).counters().value("sessions")).as("the group row follows the group: played").isEqualTo(1.0);
        assertThat(hasGroupRow(hostId)).as("the host played nothing, so the group counts nothing for them").isFalse();
        assertThat(jobRepository.findById(session).orElseThrow().getResult().get("sessions")).isEqualTo(5);
    }

    @Test
    void aGroupThatSwitchedTheStatOffKeepsItOutOfItsMemberRowsAndLeavesOwnTotalsAlone() {
        sportId = newSport(sessionsSchema(null), true);
        groupStatsConfig(Map.of("columns", List.of("games", "wins")));        // sessions left out of the group's list
        Long session = completedSession(groupId, venueId, 2);
        game(session, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        runner.processDue();

        assertThat(player(aliceId).personal().all().value("sessions")).isEqualTo(1.0);
        assertThat(player(hostId).personal().all().value("sessions")).isEqualTo(1.0);
        assertThat(member(aliceId).counters().value("games")).as("the games still count in the group row").isEqualTo(1.0);
        assertThat(member(aliceId).counters().value("sessions")).isNull();
        assertThat(hasGroupRow(hostId)).isFalse();
    }

    @Test
    void aGroupWhoseWhenCountsAJoinedPlayerCountsASessionWithNoGamesEvenWhenTheSportNeedsAGame() {
        sportId = newSport(sessionsSchema(Map.of("when", List.of("atLeast1Game"))), true);   // the sport: played
        groupStatsConfig(Map.of("config", Map.of("sessions", Map.of("when", List.of("joined")))));
        Long session = completedSession(groupId, venueId, 2);

        runner.processDue();

        assertThat(jobRepository.findById(session).orElseThrow().getStatus()).isEqualTo(SessionStatsJob.Status.DONE);
        assertThat(member(aliceId).counters().value("sessions")).as("the group counts every joined player").isEqualTo(1.0);
        assertThat(member(hostId).counters().value("sessions")).isEqualTo(1.0);
        assertThat(player(aliceId).personal().all().value("sessions")).as("own totals follow the sport: nobody played").isNull();
        assertThat(dirty("GROUP", groupId)).isTrue();
    }

    @Test
    void aGroupCanOptInToAStatTheSportDoesNotListAndOnlyItsRowsHoldIt() {
        sportId = newSport(badmintonSchema(), true);                                  // the sport lists games, wins, scoreFor, scoreAgainst
        groupStatsConfig(Map.of("columns", List.of("games", "wins", "sessions")));
        Long session = completedSession(groupId, venueId, 2);
        game(session, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        runner.processDue();

        assertThat(member(aliceId).counters().value("sessions")).as("the group's rows hold the stat the group opted in to").isEqualTo(1.0);
        assertThat(member(hostId).counters().value("sessions")).as("joined, no game: the sport's default rule is inherited").isEqualTo(1.0);
        assertThat(member(aliceId).counters().value("games")).isEqualTo(1.0);
        assertThat(member(aliceId).counters().value("scoreFor")).as("a stat the group's list left out is not counted in its rows").isNull();
        assertThat(player(aliceId).personal().all().value("sessions")).as("the player's own totals follow the sport").isNull();
        assertThat(player(aliceId).personal().all().value("scoreFor")).isEqualTo(21.0);
        assertThat(member(aliceId).group("PARTNER", String.valueOf(no(bobId))).value("sessions")).as("a pair never holds it").isNull();
    }

    @Test
    void aGroupListWithoutAStatCountsItInNoGroupRowButTheOwnTotalsStillHoldIt() {
        sportId = newSport(sessionsSchema(null), true);                               // games, wins, sessions, grouped by PARTNER
        groupStatsConfig(Map.of("columns", List.of("wins", "sessions")));
        Long session = completedSession(groupId, venueId, 2);
        game(session, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        runner.processDue();

        assertThat(member(aliceId).counters().value("wins")).isEqualTo(1.0);
        assertThat(member(aliceId).counters().value("games")).as("games is not in the group's list").isNull();
        assertThat(member(aliceId).counters().value("sessions")).isEqualTo(1.0);
        assertThat(member(aliceId).group("PARTNER", String.valueOf(no(bobId))).value("wins")).isEqualTo(1.0);
        assertThat(member(aliceId).group("PARTNER", String.valueOf(no(bobId))).value("games")).as("the partner counters follow the group's list too").isNull();
        assertThat(player(aliceId).personal().all().value("games")).as("own totals follow the sport").isEqualTo(1.0);
        assertThat(player(aliceId).group("PARTNER", bobId.toString()).all().value("games")).isEqualTo(1.0);
    }

    // ---- the sport's switch and its config ----------------------------------------------------------------------------

    @Test
    void aSportWithStatisticsSwitchedOffIsNeverPickedAndItsSessionsAreCountedOnceItIsSwitchedOn() {
        Long off = newSport(badmintonSchema(), false);
        Long sessionId = completedSession(null, venueId, 2, off);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        assertThat(runner.processDue()).isZero();
        assertThat(jobRepository.findAll()).isEmpty();               // no job row: the session was never seen
        assertThat(userStatsRepository.findAll()).isEmpty();

        switchStatistics(off, true);

        assertThat(runner.processDue()).isEqualTo(1);                // the old session is now due, like any other
        assertThat(jobRepository.findById(sessionId).orElseThrow().getStatus()).isEqualTo(SessionStatsJob.Status.DONE);
        assertThat(userStatsRepository.findById(new UserSportStats.Key(aliceId, off)).orElseThrow()).isNotNull();
    }

    @Test
    void aJobRowOfASportSwitchedOffAfterItWasPickedGivesItsRowBackAndCountsNothing() {
        Long sessionId = completedSession(null, venueId, 2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        Instant now = Instant.now();
        jobRepository.save(SessionStatsJob.builder().sessionId(sessionId).status(SessionStatsJob.Status.RUNNING).attempts(1)
                .claimedAt(now.minus(Duration.ofMinutes(30))).counted(0).ignored(0).createdAt(now).updatedAt(now).build());
        switchStatistics(sportId, false);

        assertThat(runner.processDue()).isEqualTo(1);                // the stale claim is taken over, then refused

        assertThat(jobRepository.findById(sessionId)).isEmpty();     // the row is gone, so the session is not marked as seen
        assertThat(userStatsRepository.findAll()).isEmpty();

        switchStatistics(sportId, true);

        assertThat(runner.processDue()).isEqualTo(1);
        assertThat(jobRepository.findById(sessionId).orElseThrow().getStatus()).isEqualTo(SessionStatsJob.Status.DONE);
        assertThat(player(aliceId).personal().all().value("games")).isEqualTo(1.0);
    }

    @Test
    void aSportThatListsNoScoreboardColumnsCollectsNothingAndIsSkippedForGood() {
        Long bare = newSport(doublesSchema(null, null), true);
        Long sessionId = completedSession(groupId, venueId, 2, bare);
        Long ranked = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        propose(ranked, aliceId, List.of(aliceId, bobId, carolId, danId));

        runner.processDue();

        SessionStatsJob job = jobRepository.findById(sessionId).orElseThrow();
        assertThat(job.getStatus()).isEqualTo(SessionStatsJob.Status.SKIPPED);
        assertThat(notes(sessionId)).containsExactly("STATISTICS_NOT_CONFIGURED");
        assertThat(userStatsRepository.findAll()).isEmpty();
        assertThat(groupMemberStatsRepository.findAll()).isEmpty();
        assertThat(groupH2hRepository.findAll()).isEmpty();
        assertThat(boardRunRepository.findAll()).isEmpty();

        // adding the columns later does not recount a session already seen: that is the rebuild (SESSION-77)
        Sport sport = sportRepository.findById(bare).orElseThrow();
        sport.setResultSchema(badmintonSchema());
        sportRepository.save(sport);
        cacheManager.getCache("sports").clear();
        assertThat(runner.processDue()).isZero();
        assertThat(userStatsRepository.findAll()).isEmpty();
    }

    @Test
    void theOldStatisticsBlockIsNotReadSoASportThatOnlyHasItCollectsNothing() {
        Map<String, Object> old = Map.of("version", 1, "maxRecords", 100, "record", Map.of(
                "data", doublesData(),
                "statistics", Map.of("counters", List.of("games", "wins"), "groupBy", List.of(Map.of("by", "PARTNER")))));
        Long legacy = newSport(old, true);
        Long sessionId = completedSession(null, venueId, 2, legacy);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        runner.processDue();

        assertThat(notes(sessionId)).containsExactly("STATISTICS_NOT_CONFIGURED");
        assertThat(userStatsRepository.findAll()).isEmpty();
    }

    @Test
    void aSportWithColumnsAndNoGroupByCountsTotalsOnlyAndKeepsNoGroupingNoHeadToHead() {
        Long plain = newSport(doublesSchema(Map.of("columns", List.of("games", "wins", "scoreFor")), null), true);
        Long sessionId = completedSession(groupId, venueId, 2, plain);
        Long ranked = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        propose(ranked, aliceId, List.of(aliceId, bobId, carolId, danId));

        runner.processDue();

        UserSportStats row = userStatsRepository.findById(new UserSportStats.Key(aliceId, plain)).orElseThrow();
        assertThat(row.getGroupings()).isEmpty();                    // missing groupBy means no grouping at all
        PlayerStatsDoc alice = PlayerStatsDoc.read(row);
        assertThat(alice.personal().all().value("games")).isEqualTo(1.0);
        assertThat(alice.personal().all().value("scoreFor")).isEqualTo(21.0);
        assertThat(alice.personal().all().value("scoreAgainst")).isNull();    // not a column, so not counted
        assertThat(alice.scope("REGION", COUNTRY, REGION).counters().value("wins")).isEqualTo(1.0);
        assertThat(((Map<?, ?>) row.getScopes().get(0)).containsKey("groupings")).isFalse();     // no grouping: no empty node either
        assertThat(groupH2hRepository.findAll()).isEmpty();          // no head-to-head without PARTNER
    }

    @Test
    void aFormulaColumnStoresItsOperandsOnlyAndASportWithNoGroupingKeepsTheTotals() {
        Long football = newSport(footballSchema(List.of()), true);
        Long sessionId = completedSession(null, venueId, 2, football);
        participantRepository.save(SessionParticipant.builder().sessionId(sessionId).userId(createUser("eve"))
                .status(ParticipantStatus.JOINED).build());
        game(sessionId, List.of(aliceId, bobId, carolId), List.of(danId, hostId), 3, 1);
        game(sessionId, List.of(aliceId, bobId, carolId), List.of(danId, hostId), 5, 4);

        runner.processDue();

        UserSportStats row = userStatsRepository.findById(new UserSportStats.Key(aliceId, football)).orElseThrow();
        assertThat(row.getGroupings()).isEmpty();
        // the columns are games, winRate and scoreFor: winRate stores games and wins, nothing else is stored
        assertThat(row.getPersonal().get("all")).isEqualTo("2,2,,8");        // games 2, wins 2, (no losses), scoreFor 8: nothing else is stored
        PlayerStatsDoc alice = PlayerStatsDoc.read(row);
        assertThat(alice.personal().all().value("wins")).isEqualTo(2.0);
        assertThat(alice.personal().all().value("scoreFor")).isEqualTo(8.0);       // a plain sum: 3 + 5
        PlayerStatsDoc dan = PlayerStatsDoc.read(userStatsRepository.findById(new UserSportStats.Key(danId, football)).orElseThrow());
        assertThat(dan.personal().all().value("wins")).isEqualTo(0.0);
        assertThat(dan.personal().all().value("scoreFor")).isEqualTo(5.0);         // 1 + 4
    }

    @Test
    void aSportThatGroupsByPartnerOnlyCountsEachTeammateAndKeepsNoTeamCounters() {
        Long football = newSport(footballSchema(List.of(Map.of("by", "PARTNER"))), true);
        Long sessionId = completedSession(null, venueId, 2, football);
        participantRepository.save(SessionParticipant.builder().sessionId(sessionId).userId(createUser("eve"))
                .status(ParticipantStatus.JOINED).build());
        game(sessionId, List.of(aliceId, bobId, carolId), List.of(danId, hostId), 3, 1);
        game(sessionId, List.of(danId, hostId, carolId), List.of(aliceId, bobId), 2, 1);   // alice and bob lose; carol is an opponent

        runner.processDue();

        UserSportStats row = userStatsRepository.findById(new UserSportStats.Key(aliceId, football)).orElseThrow();
        assertThat(row.getGroupings().keySet()).containsExactly("PARTNER");
        PlayerStatsDoc alice = PlayerStatsDoc.read(row);
        assertThat(alice.group("PARTNER", bobId.toString()).all().value("games")).isEqualTo(2.0);   // both games
        assertThat(alice.group("PARTNER", bobId.toString()).all().value("wins")).isEqualTo(1.0);
        assertThat(alice.group("PARTNER", carolId.toString()).all().value("games")).isEqualTo(1.0); // only the first
        assertThat(alice.group("PARTNER", carolId.toString()).all().value("wins")).isEqualTo(1.0);
        assertThat(keysOf(row, "PARTNER")).containsExactlyInAnyOrder(bobId.toString(), carolId.toString());
        assertThat(alice.personal().all().value("games")).isEqualTo(2.0);
    }

    @Test
    void aPartnerSportBuildsNoHeadToHeadFromGamesThatAreNotTwoPairs() {
        Long football = newSport(footballSchema(List.of(Map.of("by", "PARTNER"))), true);
        Long sessionId = completedSession(groupId, venueId, 2, football);
        game(sessionId, List.of(aliceId, bobId, carolId), List.of(danId, hostId), 3, 1);    // three against two
        game(sessionId, List.of(aliceId), List.of(danId), 2, 0);                            // a single

        runner.processDue();

        assertThat(jobRepository.findById(sessionId).orElseThrow().getCounted()).isEqualTo(2);
        assertThat(groupH2hRepository.findAll()).isEmpty();          // not a single pair against a pair: no row at all
        assertThat(groupMemberStatsRepository.findAll()).isNotEmpty();
    }

    @Test
    void aTeamGroupedSportCountsTeamCountersAndBuildsNoHeadToHead() {
        Long teamSport = newSport(doublesSchema(Map.of("columns", List.of("games", "wins"),
                "groupBy", List.of(Map.of("by", "TEAM", "size", 2))), null), true);
        Long sessionId = completedSession(groupId, venueId, 2, teamSport);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        runner.processDue();

        UserSportStats row = userStatsRepository.findById(new UserSportStats.Key(aliceId, teamSport)).orElseThrow();
        assertThat(row.getGroupings().keySet()).containsExactly("TEAM");
        assertThat(keysOf(row, "TEAM")).containsExactly(pair(aliceId, bobId));
        assertThat(PlayerStatsDoc.read(row).group("TEAM", pair(aliceId, bobId)).all().value("wins")).isEqualTo(1.0);
        assertThat(groupH2hRepository.findAll()).isEmpty();
        assertThat(leaderboardRepository.findAll()).isEmpty();
    }

    // ---- what is due, and when -----------------------------------------------------------------------------------

    @Test
    void aSessionIsNotCountedBeforeItsGuardHasPassedNorWhenItIsNotCompleted() {
        Long tooRecent = completedSession(null, venueId, 0);       // ended a moment ago, inside the 24 hours
        game(tooRecent, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        Long ongoing = session(null, venueId, SessionStatus.ONGOING, 3, sportId);
        game(ongoing, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        assertThat(runner.processDue()).isZero();

        assertThat(jobRepository.findAll()).isEmpty();
        assertThat(userStatsRepository.findAll()).isEmpty();
    }

    @Test
    void aRerunCountsNothingTwiceEvenWhenTheJobRowIsRevived() {
        Long sessionId = completedSession(groupId, venueId, 2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        runner.processDue();
        assertThat(runner.processDue()).isZero();                  // a final row is never picked again

        // the second line of defence: even if the row were revived, the history pointers refuse the same record
        SessionStatsJob job = jobRepository.findById(sessionId).orElseThrow();
        job.setStatus(SessionStatsJob.Status.RETRY);
        job.setNextAttemptAt(Instant.now().minusSeconds(5));
        jobRepository.save(job);
        assertThat(runner.processDue()).isEqualTo(1);

        assertThat(player(aliceId).personal().all().value("games")).isEqualTo(1.0);
        assertThat(member(aliceId).counters().value("games")).isEqualTo(1.0);
        assertThat(GroupH2hDoc.read(groupH2hRepository.findById(new GroupStats.Key(groupId, sportId)).orElseThrow()).seq())
                .isEqualTo(1);                                       // the head-to-head is not counted twice either
        SessionStatsJob again = jobRepository.findById(sessionId).orElseThrow();
        assertThat(again.getStatus()).isEqualTo(SessionStatsJob.Status.SKIPPED);
        assertThat(ignoredReasons(again).values()).containsOnly("ALREADY_COUNTED");
    }

    @Test
    void aFailedSessionIsRetriedLaterAndGivenUpAfterTheLastAttempt() {
        Long sessionId = completedSession(groupId, venueId, 2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("ALTER TABLE stat_board_runs RENAME TO stat_board_runs_gone");   // makes the counting fail
        try {
            assertThat(runner.processDue()).isEqualTo(1);
            SessionStatsJob first = jobRepository.findById(sessionId).orElseThrow();
            assertThat(first.getStatus()).isEqualTo(SessionStatsJob.Status.RETRY);
            assertThat(first.getAttempts()).isEqualTo(1);
            assertThat(first.getLastError()).isNotBlank();
            assertThat(first.getNextAttemptAt()).isAfter(Instant.now().plus(Duration.ofMinutes(10)))
                    .isBefore(Instant.now().plus(Duration.ofMinutes(20)));
            // nothing was counted: the failed attempt rolled back as a whole, the head-to-head included
            assertThat(player(aliceId).personal().all().value("games")).isNull();
            assertThat(groupH2hRepository.findAll().stream().map(g -> GroupH2hDoc.read(g).seq())).containsOnly(0L);

            // not due yet: the next tick leaves it alone
            assertThat(runner.processDue()).isZero();

            // three more attempts, each made due by hand, and the fourth is the last
            for (int attempt = 2; attempt <= 4; attempt++) {
                makeDue(sessionId);
                assertThat(runner.processDue()).isEqualTo(1);
                assertThat(jobRepository.findById(sessionId).orElseThrow().getAttempts()).isEqualTo(attempt);
            }
            SessionStatsJob failed = jobRepository.findById(sessionId).orElseThrow();
            assertThat(failed.getStatus()).isEqualTo(SessionStatsJob.Status.FAILED);
            assertThat(failed.getNextAttemptAt()).isAfter(Instant.now().plus(Duration.ofHours(5)));
        } finally {
            jdbc.execute("ALTER TABLE stat_board_runs_gone RENAME TO stat_board_runs");
        }

        // once the cause is gone and the long wait has passed, the same session is counted
        makeDue(sessionId);
        assertThat(runner.processDue()).isEqualTo(1);
        assertThat(jobRepository.findById(sessionId).orElseThrow().getStatus()).isEqualTo(SessionStatsJob.Status.DONE);
        assertThat(player(aliceId).personal().all().value("games")).isEqualTo(1.0);
    }

    @Test
    void aClaimLeftRunningByAWorkerThatDiedIsTakenOverOnceItIsStale() {
        Long sessionId = completedSession(null, venueId, 2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        Instant now = Instant.now();
        jobRepository.save(SessionStatsJob.builder().sessionId(sessionId).status(SessionStatsJob.Status.RUNNING).attempts(1)
                .claimedAt(now.minus(Duration.ofMinutes(2))).counted(0).ignored(0).createdAt(now).updatedAt(now).build());
        assertThat(runner.processDue()).isZero();                  // a fresh claim belongs to its worker

        SessionStatsJob stale = jobRepository.findById(sessionId).orElseThrow();
        stale.setClaimedAt(now.minus(Duration.ofMinutes(30)));
        jobRepository.save(stale);
        assertThat(runner.processDue()).isEqualTo(1);

        SessionStatsJob done = jobRepository.findById(sessionId).orElseThrow();
        assertThat(done.getStatus()).isEqualTo(SessionStatsJob.Status.DONE);
        assertThat(done.getAttempts()).isEqualTo(2);
    }

    // ---- two at once ----------------------------------------------------------------------------------------------

    @Test
    void twoWorkersOnOneSessionCountItExactlyOnce() throws Exception {
        Long sessionId = completedSession(groupId, venueId, 2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        List<Integer> attempted = inParallel(2, runner::processDue);

        assertThat(attempted.stream().mapToInt(Integer::intValue).sum()).isEqualTo(1);
        assertThat(jobRepository.findById(sessionId).orElseThrow().getStatus()).isEqualTo(SessionStatsJob.Status.DONE);
        assertThat(player(aliceId).personal().all().value("games")).isEqualTo(1.0);
        assertThat(member(aliceId).counters().value("games")).isEqualTo(1.0);
        assertThat(GroupH2hDoc.read(groupH2hRepository.findById(new GroupStats.Key(groupId, sportId)).orElseThrow()).seq())
                .isEqualTo(1);
    }

    @Test
    void twoSessionsSharingPlayersCountedAtOnceLoseNoUpdateAndDoNotDeadlock() throws Exception {
        for (int i = 0; i < 4; i++) {
            Long sessionId = completedSession(groupId, venueId, 2 + i);
            // the same four players in every session, each pair split differently so the lock order is exercised
            if (i % 2 == 0) {
                game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
            } else {
                game(sessionId, List.of(carolId, aliceId), List.of(danId, bobId), 21, 15);
            }
        }

        inParallel(3, runner::processDue);

        assertThat(jobRepository.findAll()).hasSize(4);
        assertThat(jobRepository.findAll().stream().map(j -> j.getStatus() + " " + j.getLastError() + " " + j.getResult()).toList())
                .as("every session is counted, none left to retry").allMatch(s -> s.startsWith("DONE"));
        for (UUID player : List.of(aliceId, bobId, carolId, danId)) {
            assertThat(player(player).personal().all().value("games")).as("games of %s", player).isEqualTo(4.0);
            assertThat(member(player).counters().value("games")).as("group games of %s", player).isEqualTo(4.0);
        }
        // the group's head-to-head row is the last lock every session takes: no game lost there either
        GroupH2hDoc h2h = GroupH2hDoc.read(groupH2hRepository.findById(new GroupStats.Key(groupId, sportId)).orElseThrow());
        assertThat(h2h.seq()).isEqualTo(4);
        assertThat(h2h.size()).isEqualTo(2);
        long[] first = h2h.matchup(nums(aliceId, bobId), nums(carolId, danId));
        long[] second = h2h.matchup(nums(carolId, aliceId), nums(danId, bobId));
        assertThat(first[0] + first[1]).isEqualTo(2);
        assertThat(second[0] + second[1]).isEqualTo(2);
    }

    @Test
    void sessionsOfOneGroupWithDisjointPlayersLoseNoGameOfTheHeadToHead() throws Exception {
        // two foursomes who share nobody: the group's head-to-head row is the only row the sessions have in common, so
        // only the lock on that row (taken last, after the player rows) stands between two sessions and a lost update
        UUID eve = createUser("eve");
        UUID fay = createUser("fay");
        UUID gus = createUser("gus");
        UUID hal = createUser("hal");
        for (int i = 0; i < 8; i++) {
            Long sessionId = completedSession(groupId, venueId, 2 + i);
            for (UUID extra : List.of(eve, fay, gus, hal)) {
                participantRepository.save(SessionParticipant.builder().sessionId(sessionId).userId(extra)
                        .status(ParticipantStatus.JOINED).build());
            }
            if (i % 2 == 0) {
                game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
            } else {
                game(sessionId, List.of(eve, fay), List.of(gus, hal), 21, 15);
            }
        }

        inParallel(4, runner::processDue);

        assertThat(jobRepository.findAll()).hasSize(8);
        assertThat(jobRepository.findAll().stream().map(j -> j.getStatus() + " " + j.getLastError()).toList())
                .as("every session is counted, none left to retry").allMatch(s -> s.startsWith("DONE"));
        GroupH2hDoc h2h = GroupH2hDoc.read(groupH2hRepository.findById(new GroupStats.Key(groupId, sportId)).orElseThrow());
        assertThat(h2h.seq()).isEqualTo(8);
        assertThat(h2h.size()).isEqualTo(2);
        assertThat(h2h.matchup(nums(aliceId, bobId), nums(carolId, danId))[0]
                + h2h.matchup(nums(aliceId, bobId), nums(carolId, danId))[1]).isEqualTo(4);
        assertThat(h2h.matchup(nums(eve, fay), nums(gus, hal))[0]
                + h2h.matchup(nums(eve, fay), nums(gus, hal))[1]).isEqualTo(4);
    }

    // ---- helpers ---------------------------------------------------------------------------------------------------

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
                results.add(future.get(60, TimeUnit.SECONDS));
            }
            return results;
        } finally {
            pool.shutdownNow();
        }
    }

    private void makeDue(Long sessionId) {
        SessionStatsJob job = jobRepository.findById(sessionId).orElseThrow();
        job.setNextAttemptAt(Instant.now().minusSeconds(5));
        jobRepository.save(job);
    }

    private void switchStatistics(Long sport, boolean on) {
        Sport row = sportRepository.findById(sport).orElseThrow();
        row.setStatisticsEnabled(on);
        sportRepository.save(row);
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    private PlayerStatsDoc player(UUID userId) {
        return userStatsRepository.findById(new UserSportStats.Key(userId, sportId))
                .map(PlayerStatsDoc::read).orElseGet(() -> PlayerStatsDoc.read(new UserSportStats(userId, sportId)));
    }

    /** The order {@code GroupH2hDoc} puts two pairs in: each pair's two numbers smaller first, compared as text of fixed width. */
    private String pairOrder(List<Integer> pair) {
        List<Integer> sorted = pair.stream().sorted().toList();
        return String.format("%010d.%010d", sorted.get(0), sorted.get(1));
    }

    /** The group's permanent member numbers of these users, in this order (allocated the first time, as the engine does). */
    private List<Integer> nums(UUID... users) {
        Map<UUID, Integer> numbers = memberNumbers.getMemberNumbers(groupId, List.of(users));
        return java.util.Arrays.stream(users).map(numbers::get).toList();
    }

    private int no(UUID user) {
        return memberNumbers.getMemberNumbers(groupId, List.of(user)).get(user);
    }

    private GroupStatsDoc member(UUID userId) {
        GroupMemberStats row = groupMemberStatsRepository.findById(new GroupMemberStats.Key(groupId, userId, sportId)).orElseThrow();
        return GroupStatsDoc.read(row);
    }

    private boolean dirty(String scopeType, Long scopeId) {
        return boardRunRepository.findById(new StatBoardRun.Key(sportId, scopeType, scopeId)).orElseThrow().getDirty();
    }

    /** The ignored records of a job as {@code recordId -> reason}; an entry is {@code "<recordId>:<REASON>"}. */
    @SuppressWarnings("unchecked")
    private static Map<Long, String> ignoredReasons(SessionStatsJob job) {
        Map<Long, String> reasons = new LinkedHashMap<>();
        for (Object entry : (List<Object>) job.getResult().get("ignored")) {
            String text = (String) entry;
            int colon = text.indexOf(':');
            reasons.put(Long.parseLong(text.substring(0, colon)), text.substring(colon + 1));
        }
        return reasons;
    }

    /** The counted record ids of a job; an entry is {@code "<0|1>-<recordId>"}. */
    @SuppressWarnings("unchecked")
    private static List<Long> counted(SessionStatsJob job) {
        return ((List<Object>) job.getResult().get("counted")).stream()
                .map(entry -> Long.parseLong(((String) entry).substring(2))).toList();
    }

    /** Whether each counted record counted as a ranking game, by record id, as the job's result says. */
    @SuppressWarnings("unchecked")
    private static Map<Long, Boolean> rankingMarks(SessionStatsJob job) {
        Map<Long, Boolean> marks = new LinkedHashMap<>();
        for (Object entry : (List<Object>) job.getResult().get("counted")) {
            String text = (String) entry;
            marks.put(Long.parseLong(text.substring(2)), text.charAt(0) == '1');
        }
        return marks;
    }

    @SuppressWarnings("unchecked")
    private List<String> notes(Long sessionId) {
        return (List<String>) jobRepository.findById(sessionId).orElseThrow().getResult().get("notes");
    }

    private static String pair(UUID a, UUID b) {
        return List.of(a.toString(), b.toString()).stream().sorted().collect(Collectors.joining(","));
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
        Long id = sportRepository.save(Sport.builder().name("SESSION-53 " + UUID.randomUUID()).isActive(true)
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
        return completedSession(sessionGroupId, locationId, endedDaysAgo, sportId);
    }

    private Long completedSession(Long sessionGroupId, Long locationId, long endedDaysAgo, Long sessionSportId) {
        return session(sessionGroupId, locationId, SessionStatus.COMPLETED, endedDaysAgo, sessionSportId);
    }

    /** A session that ended {@code endedDaysAgo} days ago (0: a minute ago); the host and the four players are JOINED. */
    private Long session(Long sessionGroupId, Long locationId, SessionStatus status, long endedDaysAgo, Long sessionSportId) {
        Instant end = Instant.now().minus(Duration.ofDays(endedDaysAgo)).minusSeconds(60);
        Long postId = postRepository.save(Post.builder().userId(hostId).groupId(null).postType(PostType.SESSION_POST)
                .content("Session: fixture").visibility("private").isActive(true).build()).getId();
        Long id = sessionRepository.save(Session.builder().title("Stats session")
                .groupId(sessionGroupId)
                .isPublic(sessionGroupId == null)
                .postId(postId)
                .sessionType(sessionGroupId == null ? SessionType.STANDALONE : SessionType.GROUP_RECURRING)
                .createdBy(hostId)
                .sportId(sessionSportId)
                .locationId(locationId)
                .scheduledStart(end.minus(Duration.ofHours(2)))
                .scheduledEndAt(end)
                .status(status)
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
        return recordWithScores(sessionId, first, second, firstScore, secondScore);
    }

    private Long recordWithScores(Long sessionId, List<UUID> first, List<UUID> second, Integer firstScore, Integer secondScore) {
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

    /** Proposes the record as a ranking game and records the confirmations of {@code confirmers} at its current revision. */
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

    /**
     * Badminton: doubles, one required score slot of 0 to 30, a scoreboard of games, wins and the two score sums grouped by
     * partner, and a ranking order. The one config the client and the server share (SESSION-53 rework).
     */
    private static Map<String, Object> badmintonSchema() {
        return doublesSchema(Map.of(
                "columns", List.of("games", "wins", "scoreFor", "scoreAgainst"),
                "groupBy", List.of(Map.of("by", "PARTNER"))),
                Map.of("sort", List.of(Map.of("by", "wins", "dir", "DESC"), Map.of("by", "games", "dir", "ASC"))));
    }

    /** The doubles sport with the given scoreboard and ranking blocks; {@code null} leaves the block out. */
    private static Map<String, Object> doublesSchema(Map<String, Object> scoreboard, Map<String, Object> ranking) {
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("data", doublesData());
        if (scoreboard != null) {
            record.put("scoreboard", scoreboard);
        }
        if (ranking != null) {
            record.put("ranking", ranking);
        }
        return Map.of("version", 1, "maxRecords", 100, "record", record);
    }

    /** A doubles sport whose games can end in a draw (record.data.allowDraws), listing games, wins and losses. */
    private static Map<String, Object> drawsSchema() {
        Map<String, Object> data = new LinkedHashMap<>(doublesData());
        data.put("allowDraws", true);
        return Map.of("version", 1, "maxRecords", 100, "record", Map.of("data", data,
                "scoreboard", Map.of("columns", List.of("games", "wins", "losses"))));
    }

    private static Map<String, Object> doublesData() {
        return Map.of("type", "COMPETITIVE",
                "playersPerSide", Map.of("min", 1, "max", 2),
                "score", Map.of("slot", List.of(Map.of("required", true, "rule", ">=0&<=30"))));
    }

    @SuppressWarnings("unchecked")
    private static java.util.Set<String> keySetOf(Object map) {
        return ((Map<String, Object>) map).keySet();
    }

    /** The keys stored under one dimension of a row's {@code groupings} (the partner ids, or the team keys). */
    @SuppressWarnings("unchecked")
    private static java.util.Set<String> keysOf(UserSportStats row, String by) {
        return ((Map<String, Object>) row.getGroupings().get(by)).keySet();
    }

    /** A football-like sport: up to 11 a side, games, win rate and the goals scored as the scoreboard, the given groupBy. */
    private static Map<String, Object> footballSchema(List<Object> groupBy) {
        Map<String, Object> scoreboard = new LinkedHashMap<>();
        scoreboard.put("columns", List.of("games", "winRate", "scoreFor"));
        scoreboard.put("groupBy", groupBy);
        return Map.of("version", 1, "maxRecords", 100, "record", Map.of(
                "data", Map.of(
                        "type", "COMPETITIVE",
                        "playersPerSide", Map.of("min", 1, "max", 11),
                        "score", Map.of("slot", List.of(Map.of("required", true, "rule", ">=0")))),
                "scoreboard", scoreboard,
                "ranking", Map.of("sort", List.of(Map.of("by", "wins", "dir", "DESC"),
                        Map.of("by", "winRate", "dir", "DESC")))));
    }
}
