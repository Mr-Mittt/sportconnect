package com.sportconnect.integration;

import com.fasterxml.jackson.databind.JsonNode;
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
import com.sportconnect.session.record.SessionRecordVerificationRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.session.stats.GroupMemberStatsRepository;
import com.sportconnect.session.stats.LeaderboardEntryRepository;
import com.sportconnect.session.stats.SessionStatsJobRepository;
import com.sportconnect.session.stats.SessionStatsRunner;
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
import org.springframework.test.web.servlet.ResultActions;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-73: the statistics read API through the real Spring context, MockMvc and the H2 schema, over numbers the real
 * engine (SESSION-53) counted: a group session of three games between four players is counted by
 * {@link SessionStatsRunner#processDue()}, and the four endpoints then read it back.
 *
 * <p>What this proves: the numbers and the sport's columns, the pair and partner results with their names, the games history
 * and its cursor, the member gate (a non-member and a missing group answer the same 403), the detail of a member who left
 * the group or was deactivated, and the errors. What it cannot: which PostgreSQL index each read uses and the timing on
 * real data (measured separately on a throwaway PostgreSQL), and the real running server.
 *
 * <p>The games: alice+bob beat carol+dan (21-15), alice+carol beat bob+dan (21-18), carol+dan beat alice+bob (21-10). So alice
 * played 3 (won 2), bob 3 (1), carol 3 (2), dan 3 (1); alice and bob won once of their two games together.
 */
class StatisticsReadIntegrationTest extends RedisBaseIT {

    private static final Integer ROLE_OWNER = 1;
    private static final Integer ROLE_MEMBER = 3;

    @Autowired private SessionStatsRunner runner;
    @Autowired private UserSportStatsRepository userStatsRepository;
    @Autowired private GroupMemberStatsRepository groupStatsRepository;
    @Autowired private LeaderboardEntryRepository leaderboardRepository;
    @Autowired private com.sportconnect.session.stats.StatBoardChangeRepository boardChangeRepository;
    @Autowired private StatBoardRunRepository boardRunRepository;
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

    private UUID hostId;
    private UUID aliceId;
    private UUID bobId;
    private UUID carolId;
    private UUID danId;
    private UUID outsiderId;
    private Long sportId;
    private Long groupId;
    private Long venueId;
    private Long game1;
    private Long game2;
    private Long game3;

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        hostId = createUser("Host", true);
        aliceId = createUser("Alice", true);
        bobId = createUser("Bob", true);
        carolId = createUser("Carol", true);
        danId = createUser("Dan", true);
        outsiderId = createUser("Outsider", true);
        sportId = sportRepository.save(Sport.builder().name("SESSION-73 " + UUID.randomUUID()).isActive(true)
                .statisticsEnabled(true).resultSchema(badmintonSchema(List.of(Map.of("by", "TEAM", "size", 2)))).build()).getId();
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
        groupId = groupRepository.save(Group.builder().groupName("Reads " + UUID.randomUUID()).sportId(sportId)
                .createdBy(hostId).isPrivate(true).isActive(true).build()).getId();
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(hostId).roleId(ROLE_OWNER).build());
        groupSettingsRepository.save(GroupSessionSettings.builder().groupId(groupId).statisticsEnabled(true).build());   // SESSION-78: off by default
        for (UUID member : List.of(aliceId, bobId, carolId, danId)) {
            groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(member).roleId(ROLE_MEMBER).build());
        }
        venueId = locationRepository.save(Location.builder().sportId(sportId).name("Venue " + UUID.randomUUID())
                .timezone("Asia/Ho_Chi_Minh").createdBy(hostId).build()).getId();

        Long sessionId = completedGroupSession();
        game1 = game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        game2 = game(sessionId, List.of(aliceId, carolId), List.of(bobId, danId), 21, 18);
        game3 = game(sessionId, List.of(carolId, danId), List.of(aliceId, bobId), 21, 10);
        assertThat(runner.processDue()).isEqualTo(1);
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
    }

    private void clearAll() {
        boardRunRepository.deleteAll();
        boardChangeRepository.deleteAll();
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

    // ---- GET /api/stats/me ---------------------------------------------------------------------------------------------

    @Test
    void myStatisticsShowWhatTheEngineCounted() throws Exception {
        JsonNode me = data(read(aliceId, "/api/stats/me?sportId=" + sportId));

        assertThat(me.get("sportId").asLong()).isEqualTo(sportId);
        assertThat(me.get("asOf").isNull()).isFalse();
        assertThat(keys(me.get("columns"))).containsExactly("games", "wins", "scoreFor", "scoreAgainst", "winRate", "winDiff");

        JsonNode totals = me.get("totals");
        assertThat(totals.get("all").get("games").asDouble()).isEqualTo(3.0);
        assertThat(totals.get("all").get("wins").asDouble()).isEqualTo(2.0);
        assertThat(totals.get("all").get("scoreFor").asDouble()).isEqualTo(52.0);          // 21 + 21 + 10
        assertThat(totals.get("all").get("winRate").asDouble()).isEqualTo(2.0 / 3.0);
        assertThat(totals.get("all").get("winDiff").asDouble()).isEqualTo(1.0);
        assertThat(totals.get("ranked").get("games").isNull()).isTrue();                    // no game was proposed: nothing counted
        assertThat(totals.get("ranked").get("winRate").isNull()).isTrue();                  // 0 / 0 has no value
        assertThat(totals.get("normal").get("games").asDouble()).isEqualTo(3.0);
        assertThat(totals.get("normal").get("wins").asDouble()).isEqualTo(2.0);

        // this sport is grouped by TEAM only: no partner list at all
        assertThat(me.get("partners")).isEmpty();
        assertThat(me.get("partnersTotal").asInt()).isZero();

        // the pairs, the asking player included
        JsonNode pairs = me.get("pairs");
        assertThat(me.get("pairsTotal").asInt()).isEqualTo(2);
        assertThat(pairs).hasSize(2);
        assertThat(playerNames(pairs.get(0))).containsExactlyInAnyOrder("Alice User", "Bob User");
        assertThat(pairs.get(0).get("values").get("all").get("games").asDouble()).isEqualTo(2.0);
        assertThat(playerNames(pairs.get(1))).containsExactlyInAnyOrder("Alice User", "Carol User");

        // no ranking game, so no place entry
        assertThat(me.get("scopes")).isEmpty();
    }

    @Test
    void aSportGroupedByPartnerListsEachPartnerWithTheirNameAndNoPairs() throws Exception {
        Long doubles = sportRepository.save(Sport.builder().name("SESSION-73 partners " + UUID.randomUUID()).isActive(true)
                .statisticsEnabled(true).resultSchema(badmintonSchema(List.of(Map.of("by", "PARTNER")))).build()).getId();
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
        Long sessionId = completedGroupSession(doubles);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        game(sessionId, List.of(aliceId, carolId), List.of(bobId, danId), 21, 18);
        game(sessionId, List.of(carolId, danId), List.of(aliceId, bobId), 21, 10);
        assertThat(runner.processDue()).isEqualTo(1);

        JsonNode me = data(read(aliceId, "/api/stats/me?sportId=" + doubles));

        assertThat(me.get("pairs")).isEmpty();
        assertThat(me.get("pairsTotal").asInt()).isZero();
        JsonNode partners = me.get("partners");
        assertThat(me.get("partnersTotal").asInt()).isEqualTo(2);
        assertThat(partners).hasSize(2);
        // most games first: bob twice (won one), carol once (won it); the asking player is not listed among her own partners
        assertThat(partners.get(0).get("players")).hasSize(1);
        assertThat(partners.get(0).get("players").get(0).get("id").asText()).isEqualTo(bobId.toString());
        assertThat(partners.get(0).get("players").get(0).get("fullName").asText()).isEqualTo("Bob User");
        assertThat(partners.get(0).get("values").get("all").get("games").asDouble()).isEqualTo(2.0);
        assertThat(partners.get(0).get("values").get("all").get("wins").asDouble()).isEqualTo(1.0);
        assertThat(partners.get(1).get("players").get(0).get("fullName").asText()).isEqualTo("Carol User");

        // the member detail of the same sport shows the same grouping: partners, no pairs
        setGroupSport(doubles);       // a group has one sport, and its statistics are that sport's
        JsonNode detail = data(read(bobId, "/api/sessions/group/" + groupId + "/stats/members/" + aliceId));
        assertThat(detail.get("pairs")).isEmpty();
        assertThat(detail.get("pairsTotal").asInt()).isZero();
        assertThat(detail.get("partnersTotal").asInt()).isEqualTo(2);
        assertThat(detail.get("partners")).hasSize(2);
        assertThat(detail.get("partners").get(0).get("players").get(0).get("fullName").asText()).isEqualTo("Bob User");
        assertThat(detail.get("partners").get(0).get("values").get("games").asDouble()).isEqualTo(2.0);
        assertThat(detail.get("partners").get(0).get("values").get("wins").asDouble()).isEqualTo(1.0);
        assertThat(detail.get("partners").get(1).get("players").get(0).get("fullName").asText()).isEqualTo("Carol User");
    }

    @Test
    void aPairOrAPartnerEntryNeverAnswersTheSessionsColumnThoughTheSportListsItAndATotalDoes() throws Exception {
        Map<String, Object> schema = new java.util.LinkedHashMap<>(badmintonSchema(List.of(Map.of("by", "PARTNER"))));
        Map<String, Object> record = new java.util.LinkedHashMap<>((Map<String, Object>) schema.get("record"));
        Map<String, Object> scoreboard = new java.util.LinkedHashMap<>((Map<String, Object>) record.get("scoreboard"));
        scoreboard.put("columns", List.of("games", "wins", "sessions"));
        record.put("scoreboard", scoreboard);
        schema.put("record", record);
        Long withSessions = sportRepository.save(Sport.builder().name("SESSION-84 sessions " + UUID.randomUUID()).isActive(true)
                .statisticsEnabled(true).resultSchema(schema).build()).getId();
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
        Long sessionId = completedGroupSession(withSessions);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        game(sessionId, List.of(aliceId, carolId), List.of(bobId, danId), 21, 18);
        assertThat(runner.processDue()).isEqualTo(1);
        setGroupSport(withSessions);

        JsonNode me = data(read(aliceId, "/api/stats/me?sportId=" + withSessions));
        assertThat(keys(me.get("columns"))).containsExactly("games", "wins", "sessions");
        assertThat(me.get("totals").get("all").get("sessions").asDouble()).as("a player's total has it").isEqualTo(1.0);
        assertThat(me.get("partners")).isNotEmpty();
        for (JsonNode partner : me.get("partners")) {
            assertThat(partner.get("values").get("all").has("sessions")).as("a partner entry has no sessions column").isFalse();
            assertThat(partner.get("values").get("all").get("games").asDouble()).isPositive();
        }

        JsonNode list = data(read(bobId, "/api/sessions/group/" + groupId + "/stats"));
        assertThat(keys(list.get("columns"))).containsExactly("games", "wins", "sessions");
        JsonNode detail = data(read(bobId, "/api/sessions/group/" + groupId + "/stats/members/" + aliceId));
        assertThat(detail.get("totals").get("sessions").asDouble()).as("the member's own row has it").isEqualTo(1.0);
        assertThat(detail.get("partners")).isNotEmpty();
        for (JsonNode partner : detail.get("partners")) {
            assertThat(partner.get("values").has("sessions")).as("a partner entry of the member detail has none").isFalse();
        }
    }

    @Test
    void theGroupEndpointsAnswerTheGroupsOwnListOfStatsAndThePlayerEndpointsTheSports() throws Exception {
        Map<String, Object> schema = new java.util.LinkedHashMap<>(badmintonSchema(List.of(Map.of("by", "PARTNER"))));
        Map<String, Object> record = new java.util.LinkedHashMap<>((Map<String, Object>) schema.get("record"));
        Map<String, Object> scoreboard = new java.util.LinkedHashMap<>((Map<String, Object>) record.get("scoreboard"));
        scoreboard.put("columns", List.of("games", "wins", "scoreFor"));
        record.put("scoreboard", scoreboard);
        schema.put("record", record);
        Long own = sportRepository.save(Sport.builder().name("SESSION-84 list " + UUID.randomUUID()).isActive(true)
                .statisticsEnabled(true).resultSchema(schema).build()).getId();
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
        GroupSessionSettings settings = groupSettingsRepository.findById(groupId).orElseThrow();      // the group's list is set before counting
        settings.setStatsConfig(Map.of("columns", List.of("wins", "sessions", "winRate")));
        groupSettingsRepository.save(settings);
        Long sessionId = completedGroupSession(own);
        game(sessionId, List.of(aliceId, bobId), List.of(carolId, danId), 21, 15);
        game(sessionId, List.of(aliceId, carolId), List.of(bobId, danId), 21, 18);
        assertThat(runner.processDue()).isEqualTo(1);
        setGroupSport(own);

        // the player's own statistics follow the sport's list
        JsonNode me = data(read(aliceId, "/api/stats/me?sportId=" + own));
        assertThat(keys(me.get("columns"))).containsExactly("games", "wins", "scoreFor");

        // the group's list, member rows and the member detail follow the group's own list (winRate keeps games and wins stored as operands)
        JsonNode list = data(read(bobId, "/api/sessions/group/" + groupId + "/stats"));
        assertThat(keys(list.get("columns"))).containsExactly("wins", "sessions", "winRate");
        JsonNode first = list.get("members").get("content").get(0);
        assertThat(first.get("values").has("games")).isFalse();
        assertThat(first.get("values").get("sessions").asDouble()).isEqualTo(1.0);
        assertThat(first.get("values").get("winRate").isNull()).isFalse();

        JsonNode detail = data(read(bobId, "/api/sessions/group/" + groupId + "/stats/members/" + aliceId));
        assertThat(keys(detail.get("columns"))).containsExactly("wins", "sessions", "winRate");
        assertThat(detail.get("totals").get("wins").asDouble()).isEqualTo(2.0);
        assertThat(detail.get("totals").has("scoreFor")).isFalse();
        for (JsonNode partner : detail.get("partners")) {
            assertThat(partner.get("values").has("sessions")).as("a partner entry has no sessions column").isFalse();
            assertThat(partner.get("values").has("wins")).isTrue();
        }
    }

    @Test
    void theSportsCurrentGroupingDecidesWhatIsShownNotWhatIsStored() throws Exception {
        // counted under TEAM: alice has two pairs, and the sport's own config shows them
        assertThat(data(read(aliceId, "/api/stats/me?sportId=" + sportId)).get("pairs")).hasSize(2);
        String detailUrl = "/api/sessions/group/" + groupId + "/stats/members/" + aliceId;
        assertThat(data(read(bobId, detailUrl)).get("pairs")).hasSize(2);

        // the admin removes the grouping: missing means no grouping at all, though the row still holds the pairs
        setSportSchema(badmintonSchema(List.of()));
        JsonNode none = data(read(aliceId, "/api/stats/me?sportId=" + sportId));
        assertThat(none.get("pairs")).isEmpty();
        assertThat(none.get("partners")).isEmpty();
        assertThat(none.get("pairsTotal").asInt()).isZero();
        assertThat(none.get("partnersTotal").asInt()).isZero();
        assertThat(none.get("totals").get("all").get("games").asDouble()).isEqualTo(3.0);   // the totals are not a grouping
        JsonNode noneDetail = data(read(bobId, detailUrl));
        assertThat(noneDetail.get("pairs")).isEmpty();
        assertThat(noneDetail.get("partners")).isEmpty();
        assertThat(userStatsRepository.findAll().stream().filter(r -> r.getUserId().equals(aliceId)).findFirst().orElseThrow()
                .getGroupings()).containsKey("TEAM");                                        // kept, only not shown

        // the admin switches to PARTNER: the stored pairs are not the sport's grouping, and no partner was counted yet
        setSportSchema(badmintonSchema(List.of(Map.of("by", "PARTNER"))));
        JsonNode partner = data(read(aliceId, "/api/stats/me?sportId=" + sportId));
        assertThat(partner.get("pairs")).isEmpty();
        assertThat(partner.get("partners")).isEmpty();

        // and a scoreboard that has no groupBy key at all has no grouping either
        setSportSchema(badmintonSchema(null));
        assertThat(data(read(aliceId, "/api/stats/me?sportId=" + sportId)).get("pairs")).isEmpty();
    }

    @Test
    void aPlayerWithNoCountedGameGetsNoValuesAndNoAsOf() throws Exception {
        JsonNode me = data(read(outsiderId, "/api/stats/me?sportId=" + sportId));

        assertThat(me.get("asOf").isNull()).isTrue();
        assertThat(me.get("totals").get("all").get("games").isNull()).isTrue();
        assertThat(me.get("totals").get("normal").get("games").isNull()).isTrue();
        assertThat(me.get("totals").get("all").get("winRate").isNull()).isTrue();
        assertThat(me.get("pairs")).isEmpty();
        assertThat(me.get("partners")).isEmpty();
        assertThat(me.get("scopes")).isEmpty();
        assertThat(keys(me.get("columns"))).isNotEmpty();
    }

    @Test
    void anUnknownSportIs404WithItsCodeAndAMissingSportIdIs400() throws Exception {
        mockMvc.perform(get("/api/stats/me?sportId=999999").header("Authorization", bearerFor(aliceId, "USER")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SPORT_NOT_FOUND"));
        mockMvc.perform(get("/api/stats/me/games?sportId=999999").header("Authorization", bearerFor(aliceId, "USER")))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SPORT_NOT_FOUND"));
        mockMvc.perform(get("/api/stats/me").header("Authorization", bearerFor(aliceId, "USER")))
                .andExpect(status().isBadRequest());
    }

    @Test
    void aDeactivatedCallerAndAnAnonymousOneAreRefused() throws Exception {
        UUID inactive = createUser("Gone", false);

        mockMvc.perform(get("/api/stats/me?sportId=" + sportId).header("Authorization", bearerFor(inactive, "USER")))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/stats/me?sportId=" + sportId)).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/stats/me/games?sportId=" + sportId)).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/sessions/group/{id}/stats", groupId)).andExpect(status().isUnauthorized());
        mockMvc.perform(get("/api/sessions/group/{id}/stats/members/{user}", groupId, aliceId))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void thePairsArePagedAndABadPageOrSizeIs400() throws Exception {
        JsonNode second = data(read(aliceId, "/api/stats/me?sportId=" + sportId + "&page=1&size=1"));
        assertThat(second.get("pairsTotal").asInt()).isEqualTo(2);
        assertThat(second.get("pairs")).hasSize(1);
        assertThat(playerNames(second.get("pairs").get(0))).containsExactlyInAnyOrder("Alice User", "Carol User");

        assertThat(data(read(aliceId, "/api/stats/me?sportId=" + sportId + "&page=5&size=1")).get("pairs")).isEmpty();

        for (String query : List.of("&page=-1", "&size=0", "&size=51")) {
            mockMvc.perform(get("/api/stats/me?sportId=" + sportId + query).header("Authorization", bearerFor(aliceId, "USER")))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    void whileTheSportsStatisticsAreSwitchedOffNothingIsShownThoughTheRowsStay() throws Exception {
        Sport sport = sportRepository.findById(sportId).orElseThrow();
        sport.setStatisticsEnabled(false);
        sportRepository.save(sport);
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }

        JsonNode me = data(read(aliceId, "/api/stats/me?sportId=" + sportId));
        assertThat(me.get("columns")).isEmpty();
        assertThat(me.get("totals").get("all")).isEmpty();
        assertThat(me.get("pairs")).isEmpty();
        JsonNode list = data(read(bobId, "/api/sessions/group/" + groupId + "/stats"));
        assertThat(list.get("columns")).isEmpty();
        assertThat(list.get("members").get("content").get(0).get("values")).isEmpty();
        JsonNode detail = data(read(bobId, "/api/sessions/group/" + groupId + "/stats/members/" + aliceId));
        assertThat(detail.get("totals")).isEmpty();
        assertThat(detail.get("pairs")).isEmpty();
        assertThat(userStatsRepository.findAll()).isNotEmpty();                              // the numbers are kept

        sport.setStatisticsEnabled(true);
        sportRepository.save(sport);
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
        assertThat(data(read(aliceId, "/api/stats/me?sportId=" + sportId)).get("totals").get("all").get("games").asDouble()).isEqualTo(3.0);
    }

    @Test
    void theMemberDetailPagesItsPairsAndRefusesABadPage() throws Exception {
        String url = "/api/sessions/group/" + groupId + "/stats/members/" + aliceId;
        JsonNode second = data(read(bobId, url + "?page=1&size=1"));
        assertThat(second.get("pairsTotal").asInt()).isEqualTo(2);
        assertThat(second.get("pairs")).hasSize(1);
        mockMvc.perform(get(url + "?size=51").header("Authorization", bearerFor(bobId, "USER"))).andExpect(status().isBadRequest());
        mockMvc.perform(get(url + "?page=-1").header("Authorization", bearerFor(bobId, "USER"))).andExpect(status().isBadRequest());
    }

    // ---- GET /api/stats/me/games ---------------------------------------------------------------------------------------

    @Test
    void myGamesComeNewestFirstWithNamesScoresAndTheirOutcome() throws Exception {
        JsonNode page = data(read(aliceId, "/api/stats/me/games?sportId=" + sportId));

        JsonNode games = page.get("games");
        assertThat(games).hasSize(3);
        assertThat(page.get("nextCursor").isNull()).isTrue();
        assertThat(ids(games)).containsExactly(game3, game2, game1);
        assertThat(outcomes(games)).containsExactly("LOSS", "WIN", "WIN");
        assertThat(games.get(0).get("ranking").asBoolean()).isFalse();
        assertThat(games.get(0).get("title").asText()).isEqualTo("Read session");
        assertThat(games.get(0).get("playedAt").isNull()).isFalse();
        JsonNode first = games.get(2);              // game 1: alice and bob 21 - carol and dan 15
        assertThat(playerNames(first.get("teams").get(0))).containsExactly("Alice User", "Bob User");
        assertThat(first.get("teams").get(0).get("scores").get(0).asInt()).isEqualTo(21);
        assertThat(playerNames(first.get("teams").get(1))).containsExactly("Carol User", "Dan User");
        assertThat(first.get("teams").get(1).get("scores").get(0).asInt()).isEqualTo(15);
    }

    @Test
    void theCursorPagesThroughTheHistoryWithNothingRepeatedOrMissed() throws Exception {
        JsonNode first = data(read(aliceId, "/api/stats/me/games?sportId=" + sportId + "&size=2"));
        assertThat(ids(first.get("games"))).containsExactly(game3, game2);
        assertThat(first.get("nextCursor").asLong()).isEqualTo(game2);

        JsonNode second = data(read(aliceId, "/api/stats/me/games?sportId=" + sportId + "&size=2&cursor=" + game2));
        assertThat(ids(second.get("games"))).containsExactly(game1);
        assertThat(second.get("nextCursor").isNull()).isTrue();

        JsonNode gone = data(read(aliceId, "/api/stats/me/games?sportId=" + sportId + "&cursor=424242"));
        assertThat(gone.get("games")).isEmpty();
        assertThat(gone.get("nextCursor").isNull()).isTrue();
    }

    @Test
    void aGameWhoseRecordIsGoneIsSkipped() throws Exception {
        recordRepository.deleteById(game2);

        JsonNode page = data(read(aliceId, "/api/stats/me/games?sportId=" + sportId));

        assertThat(ids(page.get("games"))).containsExactly(game3, game1);
    }

    @Test
    void aSizeOutsideOneToFiftyIs400() throws Exception {
        for (String size : List.of("0", "-3", "51")) {
            mockMvc.perform(get("/api/stats/me/games?sportId=" + sportId + "&size=" + size)
                            .header("Authorization", bearerFor(aliceId, "USER")))
                    .andExpect(status().isBadRequest());
        }
        mockMvc.perform(get("/api/stats/me/games?sportId=" + sportId + "&size=50")
                        .header("Authorization", bearerFor(aliceId, "USER")))
                .andExpect(status().isOk());
    }

    // ---- GET /api/sessions/group/{groupId}/stats -----------------------------------------------------------------------

    @Test
    void theGroupListHasOneTotalsRowPerMemberMostGamesFirst() throws Exception {
        JsonNode list = data(read(bobId, "/api/sessions/group/" + groupId + "/stats"));

        assertThat(list.get("sportId").asLong()).isEqualTo(sportId);
        assertThat(list.get("asOf").isNull()).isFalse();
        assertThat(keys(list.get("columns"))).containsExactly("games", "wins", "scoreFor", "scoreAgainst", "winRate", "winDiff");
        JsonNode rows = list.get("members").get("content");
        assertThat(rows).hasSize(4);
        assertThat(list.get("members").get("totalElements").asInt()).isEqualTo(4);
        assertThat(rows.get(0).get("values").get("wins").asDouble()).isEqualTo(2.0);       // alice and carol won two
        assertThat(rows.get(1).get("values").get("wins").asDouble()).isEqualTo(2.0);
        assertThat(rows.get(2).get("values").get("wins").asDouble()).isEqualTo(1.0);       // bob and dan won one
        assertThat(rows.get(3).get("values").get("wins").asDouble()).isEqualTo(1.0);
        assertThat(rows.get(0).get("member").get("fullName").asText()).isIn("Alice User", "Carol User");
        assertThat(rows.get(0).has("pairs")).isFalse();                                     // totals only
        assertThat(rows.get(0).get("values").get("games").asDouble()).isEqualTo(3.0);
    }

    @Test
    void theGroupListIsPaged() throws Exception {
        JsonNode second = data(read(aliceId, "/api/sessions/group/" + groupId + "/stats?page=1&size=3"));

        assertThat(second.get("members").get("content")).hasSize(1);
        assertThat(second.get("members").get("totalElements").asInt()).isEqualTo(4);
        assertThat(second.get("members").get("totalPages").asInt()).isEqualTo(2);
        assertThat(second.get("members").get("number").asInt()).isEqualTo(1);
    }

    @Test
    void theGroupListHidesAMemberWhoLeftAndOneWhoWasDeactivated() throws Exception {
        groupMemberRepository.findAll().stream()
                .filter(m -> m.getGroupId().equals(groupId) && m.getUserId().equals(carolId))
                .forEach(groupMemberRepository::delete);
        User dan = userRepository.findById(danId).orElseThrow();
        dan.setIsActive(false);
        userRepository.save(dan);

        JsonNode rows = data(read(aliceId, "/api/sessions/group/" + groupId + "/stats"))
                .get("members").get("content");

        assertThat(rows).hasSize(2);
        assertThat(List.of(rows.get(0).get("member").get("fullName").asText(), rows.get(1).get("member").get("fullName").asText()))
                .containsExactly("Alice User", "Bob User");
    }

    // ---- GET /api/sessions/group/{groupId}/stats/members/{userId} --------------------------------------------------------

    @Test
    void aMemberDetailHasTheTotalsAndThePairsAndAnyMemberMayOpenIt() throws Exception {
        JsonNode detail = data(read(bobId, "/api/sessions/group/" + groupId + "/stats/members/" + aliceId));

        assertThat(detail.get("member").get("fullName").asText()).isEqualTo("Alice User");
        assertThat(detail.get("totals").get("games").asDouble()).isEqualTo(3.0);
        assertThat(detail.get("totals").get("wins").asDouble()).isEqualTo(2.0);
        assertThat(detail.get("totals").get("winRate").asDouble()).isEqualTo(2.0 / 3.0);
        assertThat(detail.get("asOf").isNull()).isFalse();
        JsonNode pairs = detail.get("pairs");
        assertThat(pairs).hasSize(2);
        assertThat(playerNames(pairs.get(0))).containsExactlyInAnyOrder("Alice User", "Bob User");
        assertThat(pairs.get(0).get("values").get("games").asDouble()).isEqualTo(2.0);
        assertThat(pairs.get(0).get("values").get("wins").asDouble()).isEqualTo(1.0);
        assertThat(playerNames(pairs.get(1))).containsExactlyInAnyOrder("Alice User", "Carol User");
        assertThat(detail.get("pairsTotal").asInt()).isEqualTo(2);
        assertThat(detail.get("partners")).isEmpty();                                       // this sport is grouped by TEAM only
        assertThat(detail.get("partnersTotal").asInt()).isZero();
    }

    @Test
    void aMemberWhoLeftOrWasDeactivatedIsStillShownInTheDetail() throws Exception {
        groupMemberRepository.findAll().stream()
                .filter(m -> m.getGroupId().equals(groupId) && m.getUserId().equals(carolId))
                .forEach(groupMemberRepository::delete);
        User dan = userRepository.findById(danId).orElseThrow();
        dan.setIsActive(false);
        userRepository.save(dan);

        JsonNode left = data(read(aliceId, "/api/sessions/group/" + groupId + "/stats/members/" + carolId));
        JsonNode deactivated = data(read(aliceId, "/api/sessions/group/" + groupId + "/stats/members/" + danId));

        assertThat(left.get("member").get("fullName").asText()).isEqualTo("Carol User");
        assertThat(left.get("totals").get("wins").asDouble()).isEqualTo(2.0);
        assertThat(deactivated.get("member").get("fullName").asText()).isEqualTo("Dan User");
        assertThat(deactivated.get("totals").get("games").asDouble()).isEqualTo(3.0);
        assertThat(deactivated.get("pairs")).isNotEmpty();
    }

    @Test
    void aMemberWithNoCountedGameGetsNoValues() throws Exception {
        JsonNode detail = data(read(aliceId, "/api/sessions/group/" + groupId + "/stats/members/" + hostId));

        assertThat(detail.get("member").get("fullName").asText()).isEqualTo("Host User");
        assertThat(detail.get("totals").get("games").isNull()).isTrue();
        assertThat(detail.get("pairs")).isEmpty();
        assertThat(detail.get("asOf").isNull()).isTrue();
    }

    // ---- the group gate and the sport ----------------------------------------------------------------------------------

    @Test
    void aNonMemberAndAMissingGroupAnswerTheSame403ForBothGroupEndpoints() throws Exception {
        String list = "/stats?sportId=" + sportId;
        String detail = "/stats/members/" + aliceId;
        for (String path : List.of(list, detail)) {
            mockMvc.perform(get("/api/sessions/group/{id}" + path, groupId).header("Authorization", bearerFor(outsiderId, "USER")))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_MEMBER_REQUIRED"));
            mockMvc.perform(get("/api/sessions/group/{id}" + path, 999_999L).header("Authorization", bearerFor(aliceId, "USER")))
                    .andExpect(status().isForbidden())
                    .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_MEMBER_REQUIRED"));
        }
    }

    @Test
    void aGroupWithNoSportHasNoStatisticsAndTheGateStillComesFirst() throws Exception {
        setGroupSport(null);

        mockMvc.perform(get("/api/sessions/group/{id}/stats", groupId).header("Authorization", bearerFor(outsiderId, "USER")))
                .andExpect(status().isForbidden());
        mockMvc.perform(get("/api/sessions/group/{id}/stats", groupId).header("Authorization", bearerFor(aliceId, "USER")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SPORT_REQUIRED"));
        mockMvc.perform(get("/api/sessions/group/{id}/stats/members/{user}", groupId, aliceId)
                        .header("Authorization", bearerFor(aliceId, "USER")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SPORT_REQUIRED"));
    }

    // ---- helpers -------------------------------------------------------------------------------------------------------

    /** Gives the fixture group another sport (or none), as the group's owner would. */
    private void setGroupSport(Long groupSportId) {
        Group group = groupRepository.findById(groupId).orElseThrow();
        group.setSportId(groupSportId);
        groupRepository.save(group);
    }

    /** Rewrites the fixture sport's result schema, as an admin edit would (and drops the sport cache). */
    private void setSportSchema(Map<String, Object> schema) {
        Sport sport = sportRepository.findById(sportId).orElseThrow();
        sport.setResultSchema(schema);
        sportRepository.save(sport);
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    private ResultActions read(UUID caller, String url) throws Exception {
        return mockMvc.perform(get(url).header("Authorization", bearerFor(caller, "USER")));
    }

    private JsonNode data(ResultActions result) throws Exception {
        return objectMapper.readTree(result.andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("data");
    }

    private static List<String> keys(JsonNode columns) {
        List<String> keys = new ArrayList<>();
        columns.forEach(c -> keys.add(c.asText()));
        return keys;
    }

    private static List<String> playerNames(JsonNode withPlayers) {
        List<String> names = new ArrayList<>();
        withPlayers.get("players").forEach(p -> names.add(p.get("fullName").asText()));
        return names;
    }

    private static List<Long> ids(JsonNode games) {
        List<Long> ids = new ArrayList<>();
        games.forEach(g -> ids.add(g.get("recordId").asLong()));
        return ids;
    }

    private static List<String> outcomes(JsonNode games) {
        List<String> outcomes = new ArrayList<>();
        games.forEach(g -> outcomes.add(g.get("outcome").asText()));
        return outcomes;
    }

    private UUID createUser(String label, boolean active) {
        User user = new User();
        user.setUsername(label + "_" + UUID.randomUUID());
        user.setEmail(label + "_" + System.nanoTime() + "@example.com");
        user.setFirstName(label);
        user.setLastName("User");
        user.setIsEmailVerified(false);
        user.setIsActive(active);
        return userRepository.save(user).getId();
    }

    /** A group session that ended two days ago (past the 24-hour guard); the host and the four players are JOINED. */
    private Long completedGroupSession() {
        return completedGroupSession(sportId);
    }

    /** The same, in the given sport (the group and its members are the fixture's). */
    private Long completedGroupSession(Long sessionSportId) {
        Instant end = Instant.now().minus(Duration.ofDays(2));
        Long postId = postRepository.save(Post.builder().userId(hostId).groupId(null).postType(PostType.SESSION_POST)
                .content("Session: fixture").visibility("private").isActive(true).build()).getId();
        Long id = sessionRepository.save(Session.builder().title("Read session")
                .groupId(groupId)
                .isPublic(false)
                .postId(postId)
                .sessionType(SessionType.GROUP_RECURRING)
                .createdBy(hostId)
                .sportId(sessionSportId)
                .locationId(venueId)
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
        Map<String, Object> data = Map.of("teams", List.of(
                Map.of("players", first.stream().map(UUID::toString).toList(), "scores", List.of(firstScore)),
                Map.of("players", second.stream().map(UUID::toString).toList(), "scores", List.of(secondScore))));
        Instant now = Instant.now();
        return recordRepository.save(SessionRecord.builder().sessionId(sessionId).data(data)
                .clientRequestId(UUID.randomUUID()).createdBy(hostId).createdAt(now).updatedBy(hostId).updatedAt(now)
                .build()).getId();
    }

    /**
     * Doubles, one required score slot of 0 to 30, and a scoreboard of catalog columns grouped as given (one way only); a
     * {@code null} groupBy leaves the key out altogether.
     */
    private static Map<String, Object> badmintonSchema(List<Object> groupBy) {
        Map<String, Object> scoreboard = new java.util.LinkedHashMap<>();
        scoreboard.put("columns", List.of("games", "wins", "scoreFor", "scoreAgainst", "winRate", "winDiff"));
        if (groupBy != null) {
            scoreboard.put("groupBy", groupBy);
        }
        return Map.of("version", 1, "maxRecords", 100, "record", Map.of(
                "data", Map.of(
                        "type", "COMPETITIVE",
                        "playersPerSide", Map.of("min", 1, "max", 2),
                        "score", Map.of("slot", List.of(Map.of("required", true, "rule", ">=0&<=30")))),
                "scoreboard", scoreboard));
    }
}
