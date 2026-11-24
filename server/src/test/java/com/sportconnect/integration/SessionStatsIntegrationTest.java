package com.sportconnect.integration;

import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
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
import com.sportconnect.session.stats.GroupMemberStats;
import com.sportconnect.session.stats.GroupMemberStatsRepository;
import com.sportconnect.session.stats.GroupStatsDoc;
import com.sportconnect.session.stats.LeaderboardEntry;
import com.sportconnect.session.stats.LeaderboardEntryRepository;
import com.sportconnect.session.stats.PlayerStatsDoc;
import com.sportconnect.session.stats.SessionStatsJob;
import com.sportconnect.session.stats.SessionStatsJobRepository;
import com.sportconnect.session.stats.SessionStatsRunner;
import com.sportconnect.session.stats.StatBoardRun;
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
 * SESSION-53: the statistics engine through the real Spring context and the H2 schema: a completed session whose guard has
 * passed is counted once (personal, pair, group member and venue-scope counters, the history, the leaderboard entries, the
 * dirty boards), invalid and planned records are ignored with their reason, a failure is retried and given up, and two
 * workers never count a session twice nor lose a player's update.
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
    @Autowired private GroupMemberStatsRepository groupStatsRepository;
    @Autowired private LeaderboardEntryRepository leaderboardRepository;
    @Autowired private StatBoardRunRepository boardRunRepository;
    @Autowired private SessionRepository sessionRepository;
    @Autowired private SessionParticipantRepository participantRepository;
    @Autowired private SessionRecordRepository recordRepository;
    @Autowired private SessionRecordVerificationRepository verificationRepository;
    @Autowired private GroupRepository groupRepository;
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
        sportId = newSport(badmintonSchema());
        groupId = groupRepository.save(Group.builder().groupName("Stats " + UUID.randomUUID())
                .createdBy(hostId).isPrivate(true).isActive(true).build()).getId();
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(hostId).roleId(ROLE_OWNER).build());
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
        leaderboardRepository.deleteAll();
        groupStatsRepository.deleteAll();
        userStatsRepository.deleteAll();
        jobRepository.deleteAll();
        commentRepository.deleteAll();
        verificationRepository.deleteAll();
        recordRepository.deleteAll();
        participantRepository.deleteAll();
        sessionRepository.deleteAll();
        groupMemberRepository.deleteAll();
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
    void aGroupSessionIsCountedForEveryPlayerAndEveryBoardItTouches() {
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

        // alice: two games, one won and one lost; the first one was a ranking game
        PlayerStatsDoc alice = player(aliceId);
        assertThat(alice.personal().all().core("games")).isEqualTo(2.0);
        assertThat(alice.personal().all().core("wins")).isEqualTo(1.0);
        assertThat(alice.personal().all().core("losses")).isEqualTo(1.0);
        assertThat(alice.personal().all().metric("scoreFor")).isEqualTo(39.0);      // 21 + 18
        assertThat(alice.personal().all().metric("scoreAgainst")).isEqualTo(36.0);  // 15 + 21
        assertThat(alice.personal().ranked().core("games")).isEqualTo(1.0);
        assertThat(alice.personal().ranked().core("wins")).isEqualTo(1.0);
        assertThat(alice.personal().ranked().metric("scoreFor")).isEqualTo(21.0);

        // the pair alice + bob: every game they played together, and the ranking one among them
        assertThat(alice.group("TEAM", pair(aliceId, bobId)).all().core("games")).isEqualTo(2.0);
        assertThat(alice.group("TEAM", pair(aliceId, bobId)).ranked().core("games")).isEqualTo(1.0);

        // per partner: bob, and only bob (carol and dan were the opponents), with his own wins and the ranking split
        assertThat(alice.group("PARTNER", bobId.toString()).all().core("games")).isEqualTo(2.0);
        assertThat(alice.group("PARTNER", bobId.toString()).all().core("wins")).isEqualTo(1.0);
        assertThat(alice.group("PARTNER", bobId.toString()).ranked().core("games")).isEqualTo(1.0);
        assertThat(alice.group("PARTNER", bobId.toString()).ranked().core("wins")).isEqualTo(1.0);
        UserSportStats aliceRow = userStatsRepository.findById(new UserSportStats.Key(aliceId, sportId)).orElseThrow();
        assertThat(keysOf(aliceRow, "PARTNER")).containsExactly(bobId.toString());
        assertThat(keysOf(aliceRow, "TEAM")).containsExactly(pair(aliceId, bobId));

        // a ranking game counts at the venue's region and country, though no player has a region of their own
        assertThat(alice.scope("REGION", COUNTRY, REGION).counters().core("games")).isEqualTo(1.0);
        assertThat(alice.scope("COUNTRY", COUNTRY, null).counters().core("games")).isEqualTo(1.0);
        assertThat(alice.scope("REGION", COUNTRY, REGION).group("PARTNER", bobId.toString()).core("wins")).isEqualTo(1.0);
        assertThat(player(carolId).scope("REGION", COUNTRY, REGION).counters().core("losses")).isEqualTo(1.0);

        // the group member's counters cover both games; history is newest first with the ranking mark
        GroupStatsDoc member = member(aliceId);
        assertThat(member.counters().core("games")).isEqualTo(2.0);
        assertThat(member.group("TEAM", pair(aliceId, bobId)).core("games")).isEqualTo(2.0);
        assertThat(member.group("PARTNER", bobId.toString()).core("games")).isEqualTo(2.0);
        assertThat(member.group("PARTNER", bobId.toString()).core("wins")).isEqualTo(1.0);
        UserSportStats row = userStatsRepository.findById(new UserSportStats.Key(aliceId, sportId)).orElseThrow();
        assertThat(row.getHistory()).hasSize(2);
        assertThat(((Map<?, ?>) row.getHistory().get(0)).get("ranking")).isEqualTo(false);
        assertThat(((Map<?, ?>) row.getHistory().get(1)).get("ranking")).isEqualTo(true);

        // the ranking projection: the sort values are computed once, from the sport's sort keys (winDiff, winRate, games)
        LeaderboardEntry groupEntry = entry("GROUP", groupId, "SINGLE", aliceId.toString());
        assertThat(groupEntry.getGames()).isEqualTo(2);
        assertThat(groupEntry.getK1()).isEqualTo(0.0);
        assertThat(groupEntry.getK2()).isEqualTo(0.5);
        assertThat(groupEntry.getK3()).isEqualTo(2.0);
        LeaderboardEntry regionEntry = entry("REGION", REGION, "SINGLE", aliceId.toString());
        assertThat(regionEntry.getGames()).isEqualTo(1);
        assertThat(regionEntry.getK1()).isEqualTo(1.0);
        assertThat(entry("REGION", REGION, "COMBO", pair(aliceId, bobId)).getGames()).isEqualTo(1);
        assertThat(entry("COUNTRY", COUNTRY, "COMBO", pair(carolId, danId)).getGames()).isEqualTo(1);
        assertThat(entry("GROUP", groupId, "COMBO", pair(carolId, danId)).getGames()).isEqualTo(2);
        // a partner grouping is a personal view: it never becomes a board entry
        assertThat(leaderboardRepository.findAll()).allMatch(e -> e.getKind().equals("SINGLE")
                ? !e.getSubjectKey().contains(",") : e.getKind().equals("COMBO") && e.getSubjectKey().contains(","));
        assertThat(leaderboardRepository.findAll()).noneMatch(e -> e.getKind().equals("COMBO")
                && e.getSubjectKey().equals(bobId.toString()));

        // every touched board is marked for the nightly ranking
        assertThat(dirty("GROUP", groupId)).isTrue();
        assertThat(dirty("REGION", REGION)).isTrue();
        assertThat(dirty("COUNTRY", COUNTRY)).isTrue();
    }

    @Test
    void aNormalGameCountsForThePlayersAndTheGroupButNotForTheRegionOrCountry() {
        Long sessionId = completedSession(groupId, venueId, 2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        runner.processDue();

        PlayerStatsDoc alice = player(aliceId);
        assertThat(alice.personal().all().core("games")).isEqualTo(1.0);
        assertThat(alice.personal().ranked().core("games")).isEqualTo(0.0);
        assertThat(userStatsRepository.findById(new UserSportStats.Key(aliceId, sportId)).orElseThrow().getScopes()).isEmpty();
        assertThat(leaderboardRepository.findAll()).allMatch(e -> e.getScopeType().equals("GROUP"));
        assertThat(boardRunRepository.findAll()).extracting(StatBoardRun::getScopeType).containsOnly("GROUP");
    }

    @Test
    void aStandaloneSessionWritesNoGroupStatisticsAndNoGroupBoard() {
        Long sessionId = completedSession(null, venueId, 2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);

        runner.processDue();

        assertThat(player(aliceId).personal().all().core("games")).isEqualTo(1.0);
        assertThat(groupStatsRepository.findAll()).isEmpty();
        assertThat(leaderboardRepository.findAll()).isEmpty();
    }

    @Test
    void aRankingGameAtAVenueWithNoRegionCountsForTheCountryOnlyAndSaysSo() {
        Long noRegion = venue(COUNTRY, null);
        Long sessionId = completedSession(null, noRegion, 2);
        Long ranked = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        propose(ranked, aliceId, List.of(aliceId, bobId, carolId, danId));

        runner.processDue();

        PlayerStatsDoc alice = player(aliceId);
        assertThat(alice.scope("COUNTRY", COUNTRY, null).counters().core("games")).isEqualTo(1.0);
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

        assertThat(player(aliceId).personal().ranked().core("games")).isEqualTo(1.0);
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

        assertThat(player(aliceId).personal().all().core("games")).isEqualTo(1.0);
        assertThat(player(aliceId).personal().ranked().core("games")).isEqualTo(0.0);
    }

    @Test
    void invalidAndPlannedRecordsAreIgnoredWithTheirReasonAndTheGoodOneIsCounted() {
        Long sessionId = completedSession(null, venueId, 2);
        Long good = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        Long planned = recordWithScores(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), null, null);
        Long duplicate = game(sessionId, List.of(aliceId, aliceId), List.of(carolId, danId), 21, 15);
        Long reversed = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 15, 21);

        runner.processDue();

        SessionStatsJob job = jobRepository.findById(sessionId).orElseThrow();
        assertThat(job.getStatus()).isEqualTo(SessionStatsJob.Status.DONE);
        assertThat(job.getCounted()).isEqualTo(1);
        assertThat(job.getIgnored()).isEqualTo(3);
        Map<Long, String> reasons = ignoredReasons(job);
        assertThat(reasons).containsEntry(planned, "NO_SCORE")
                .containsEntry(duplicate, "DUPLICATE_PLAYER")
                .containsEntry(reversed, "FIRST_TEAM_NOT_AHEAD");
        assertThat(counted(job)).containsExactly(good);
        assertThat(player(aliceId).personal().all().core("games")).isEqualTo(1.0);
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
        Long noSchema = newSport(null);
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

    @Test
    void aSportWithNoGroupingsAndMaxMinMetricsUsesItsOwnSchema() {
        Long football = newSport(footballSchema(List.of()));
        Long sessionId = completedSession(null, venueId, 2, football);
        participantRepository.save(SessionParticipant.builder().sessionId(sessionId).userId(createUser("eve"))
                .status(ParticipantStatus.JOINED).build());
        game(sessionId, List.of(aliceId, bobId, carolId), List.of(danId, hostId), 3, 1);
        game(sessionId, List.of(aliceId, bobId, carolId), List.of(danId, hostId), 5, 4);

        runner.processDue();

        UserSportStats row = userStatsRepository.findById(new UserSportStats.Key(aliceId, football)).orElseThrow();
        assertThat(row.getGroupings()).isEmpty();      // no groupBy: no partner and no team counters
        PlayerStatsDoc alice = PlayerStatsDoc.read(row);
        assertThat(alice.personal().all().core("wins")).isEqualTo(2.0);
        assertThat(alice.personal().all().metric("scoreFor")).isEqualTo(5.0);      // MAX of 3 and 5
        assertThat(alice.personal().all().metric("scoreAgainst")).isEqualTo(1.0);  // MIN of 1 and 4
        PlayerStatsDoc dan = PlayerStatsDoc.read(userStatsRepository.findById(new UserSportStats.Key(danId, football)).orElseThrow());
        assertThat(dan.personal().all().metric("scoreFor")).isEqualTo(4.0);         // MAX of 1 and 4
        assertThat(dan.personal().all().metric("scoreAgainst")).isEqualTo(3.0);     // MIN of 3 and 5
        assertThat(leaderboardRepository.findAll()).isEmpty();   // standalone: no group board, nothing ranked
    }

    @Test
    void aSportWithNoStatisticsBlockCountsTotalsOnlyAndGroupsByNothing() {
        Long doubles = newSport(badmintonWithoutStatisticsSchema());
        Long sessionId = completedSession(groupId, venueId, 2, doubles);
        Long ranked = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        propose(ranked, aliceId, List.of(aliceId, bobId, carolId, danId));

        runner.processDue();

        UserSportStats row = userStatsRepository.findById(new UserSportStats.Key(aliceId, doubles)).orElseThrow();
        assertThat(row.getGroupings()).isEmpty();                    // no partner and no team counters
        PlayerStatsDoc alice = PlayerStatsDoc.read(row);
        assertThat(alice.personal().all().core("games")).isEqualTo(1.0);
        assertThat(alice.personal().all().metric("scoreFor")).isEqualTo(21.0);   // the default metrics still apply
        assertThat(alice.scope("REGION", COUNTRY, REGION).counters().core("wins")).isEqualTo(1.0);
        assertThat(((Map<?, ?>) row.getScopes().get(0)).get("groupings")).isEqualTo(Map.of());
        assertThat(leaderboardRepository.findAll()).allMatch(e -> e.getKind().equals("SINGLE"));   // no pair board
    }

    @Test
    void aSportThatGroupsByPartnerOnlyCountsEachTeammateAndKeepsNoTeamCounters() {
        Long football = newSport(footballSchema(List.of(Map.of("by", "PARTNER"))));
        Long sessionId = completedSession(null, venueId, 2, football);
        participantRepository.save(SessionParticipant.builder().sessionId(sessionId).userId(createUser("eve"))
                .status(ParticipantStatus.JOINED).build());
        game(sessionId, List.of(aliceId, bobId, carolId), List.of(danId, hostId), 3, 1);
        game(sessionId, List.of(danId, hostId, carolId), List.of(aliceId, bobId), 2, 1);   // alice and bob lose; carol is an opponent

        runner.processDue();

        UserSportStats row = userStatsRepository.findById(new UserSportStats.Key(aliceId, football)).orElseThrow();
        assertThat(row.getGroupings().keySet()).containsExactly("PARTNER");
        PlayerStatsDoc alice = PlayerStatsDoc.read(row);
        assertThat(alice.group("PARTNER", bobId.toString()).all().core("games")).isEqualTo(2.0);   // both games
        assertThat(alice.group("PARTNER", bobId.toString()).all().core("wins")).isEqualTo(1.0);
        assertThat(alice.group("PARTNER", carolId.toString()).all().core("games")).isEqualTo(1.0); // only the first
        assertThat(alice.group("PARTNER", carolId.toString()).all().core("wins")).isEqualTo(1.0);
        assertThat(keysOf(row, "PARTNER")).containsExactlyInAnyOrder(bobId.toString(), carolId.toString());
        assertThat(alice.personal().all().core("games")).isEqualTo(2.0);
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

        assertThat(player(aliceId).personal().all().core("games")).isEqualTo(1.0);
        assertThat(member(aliceId).counters().core("games")).isEqualTo(1.0);
        SessionStatsJob again = jobRepository.findById(sessionId).orElseThrow();
        assertThat(again.getStatus()).isEqualTo(SessionStatsJob.Status.SKIPPED);
        assertThat(ignoredReasons(again).values()).containsOnly("ALREADY_COUNTED");
    }

    @Test
    void aFailedSessionIsRetriedLaterAndGivenUpAfterTheLastAttempt() {
        Long sessionId = completedSession(groupId, venueId, 2);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.execute("ALTER TABLE leaderboard_entry RENAME TO leaderboard_entry_gone");   // makes the counting fail
        try {
            assertThat(runner.processDue()).isEqualTo(1);
            SessionStatsJob first = jobRepository.findById(sessionId).orElseThrow();
            assertThat(first.getStatus()).isEqualTo(SessionStatsJob.Status.RETRY);
            assertThat(first.getAttempts()).isEqualTo(1);
            assertThat(first.getLastError()).isNotBlank();
            assertThat(first.getNextAttemptAt()).isAfter(Instant.now().plus(Duration.ofMinutes(10)))
                    .isBefore(Instant.now().plus(Duration.ofMinutes(20)));
            // nothing was counted: the failed attempt rolled back as a whole
            assertThat(player(aliceId).personal().all().core("games")).isEqualTo(0.0);

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
            jdbc.execute("ALTER TABLE leaderboard_entry_gone RENAME TO leaderboard_entry");
        }

        // once the cause is gone and the long wait has passed, the same session is counted
        makeDue(sessionId);
        assertThat(runner.processDue()).isEqualTo(1);
        assertThat(jobRepository.findById(sessionId).orElseThrow().getStatus()).isEqualTo(SessionStatsJob.Status.DONE);
        assertThat(player(aliceId).personal().all().core("games")).isEqualTo(1.0);
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
        assertThat(player(aliceId).personal().all().core("games")).isEqualTo(1.0);
        assertThat(member(aliceId).counters().core("games")).isEqualTo(1.0);
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
            assertThat(player(player).personal().all().core("games")).as("games of %s", player).isEqualTo(4.0);
            assertThat(member(player).counters().core("games")).as("group games of %s", player).isEqualTo(4.0);
            assertThat(entry("GROUP", groupId, "SINGLE", player.toString()).getGames()).isEqualTo(4);
        }
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

    private PlayerStatsDoc player(UUID userId) {
        return userStatsRepository.findById(new UserSportStats.Key(userId, sportId))
                .map(PlayerStatsDoc::read).orElseGet(() -> PlayerStatsDoc.read(new UserSportStats(userId, sportId)));
    }

    private GroupStatsDoc member(UUID userId) {
        GroupMemberStats row = groupStatsRepository.findById(new GroupMemberStats.Key(groupId, userId, sportId)).orElseThrow();
        return GroupStatsDoc.read(row);
    }

    private LeaderboardEntry entry(String scopeType, Long scopeId, String kind, String subject) {
        return leaderboardRepository.findById(new LeaderboardEntry.Key(scopeType, scopeId, sportId, kind, subject)).orElseThrow();
    }

    private boolean dirty(String scopeType, Long scopeId) {
        return boardRunRepository.findById(new StatBoardRun.Key(sportId, scopeType, scopeId)).orElseThrow().getDirty();
    }

    @SuppressWarnings("unchecked")
    private static Map<Long, String> ignoredReasons(SessionStatsJob job) {
        Map<Long, String> reasons = new LinkedHashMap<>();
        for (Object entry : (List<Object>) job.getResult().get("ignored")) {
            Map<String, Object> map = (Map<String, Object>) entry;
            reasons.put(((Number) map.get("recordId")).longValue(), (String) map.get("reason"));
        }
        return reasons;
    }

    @SuppressWarnings("unchecked")
    private static List<Long> counted(SessionStatsJob job) {
        return ((List<Object>) job.getResult().get("counted")).stream()
                .map(entry -> ((Number) ((Map<String, Object>) entry).get("recordId")).longValue()).toList();
    }

    /** Whether each counted record counted as a ranking game, by record id, as the job's result says. */
    @SuppressWarnings("unchecked")
    private static Map<Long, Boolean> rankingMarks(SessionStatsJob job) {
        Map<Long, Boolean> marks = new LinkedHashMap<>();
        for (Object entry : (List<Object>) job.getResult().get("counted")) {
            Map<String, Object> map = (Map<String, Object>) entry;
            marks.put(((Number) map.get("recordId")).longValue(), (Boolean) map.get("ranking"));
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

    private Long newSport(Map<String, Object> schema) {
        Long id = sportRepository.save(Sport.builder().name("SESSION-53 " + UUID.randomUUID()).isActive(true)
                .resultSchema(schema).build()).getId();
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
     * Badminton: doubles, one required score slot of 0 to 30, and a statistics block that asks for partner and pair counters
     * (the default metrics and derived columns written out, because a declared block is taken as written).
     */
    private static Map<String, Object> badmintonSchema() {
        return Map.of("version", 1, "maxRecords", 100, "record", Map.of(
                "data", badmintonData(),
                "statistics", Map.of(
                        "counters", List.of("games", "wins"),
                        "metrics", List.of(Map.of("key", "scoreFor", "aggregate", "SUM"),
                                Map.of("key", "scoreAgainst", "aggregate", "SUM")),
                        "derived", List.of(Map.of("key", "winRate", "formula", "wins/games"),
                                Map.of("key", "winDiff", "formula", "wins-losses"),
                                Map.of("key", "scoreDiff", "formula", "scoreFor-scoreAgainst")),
                        "groupBy", List.of(Map.of("by", "PARTNER"), Map.of("by", "TEAM", "size", 2)))));
    }

    /** The same doubles sport with no statistics block: the defaults apply, which group by nothing. */
    private static Map<String, Object> badmintonWithoutStatisticsSchema() {
        return Map.of("version", 1, "maxRecords", 100, "record", Map.of("data", badmintonData()));
    }

    private static Map<String, Object> badmintonData() {
        return Map.of("type", "COMPETITIVE",
                "playersPerSide", Map.of("min", 1, "max", 2),
                "score", Map.of("slot", List.of(Map.of("required", true, "rule", ">=0&<=30"))));
    }

    /** The keys stored under one dimension of a row's {@code groupings} (the partner ids, or the team keys). */
    @SuppressWarnings("unchecked")
    private static java.util.Set<String> keysOf(UserSportStats row, String by) {
        return ((Map<String, Object>) row.getGroupings().get(by)).keySet();
    }

    /** A football-like sport: up to 11 a side, the given groupBy, the best and the worst of a team's goals, a derived goal difference. */
    private static Map<String, Object> footballSchema(List<Object> groupBy) {
        return Map.of("version", 1, "maxRecords", 100, "record", Map.of(
                "data", Map.of(
                        "type", "COMPETITIVE",
                        "playersPerSide", Map.of("min", 1, "max", 11),
                        "score", Map.of("slot", List.of(Map.of("required", true, "rule", ">=0")))),
                "statistics", Map.of(
                        "metrics", List.of(Map.of("key", "scoreFor", "aggregate", "MAX"),
                                Map.of("key", "scoreAgainst", "aggregate", "MIN")),
                        "derived", List.of(Map.of("key", "goalDiff", "formula", "scoreFor-scoreAgainst")),
                        "groupBy", groupBy),
                "ranking", Map.of("sort", List.of(Map.of("by", "wins", "dir", "DESC"),
                        Map.of("by", "goalDiff", "dir", "DESC")))));
    }
}
