package com.sportconnect.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.reference.repository.CountryRepository;
import com.sportconnect.reference.repository.LanguageRepository;
import com.sportconnect.reference.repository.RegionRepository;
import com.sportconnect.session.api.dto.CreateSeasonRequest;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.SeasonCollectionMode;
import com.sportconnect.session.api.dto.SeasonStatus;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.api.service.GroupSeasonService;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.repository.GroupSessionSettingsRepository;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.session.season.GroupSeason;
import com.sportconnect.session.season.GroupSeasonRepository;
import com.sportconnect.session.season.GroupSeasonSessionRepository;
import com.sportconnect.session.season.SeasonTransitions;
import com.sportconnect.social.post.api.dto.PostType;
import com.sportconnect.social.post.api.dto.SystemCode;
import com.sportconnect.social.post.entity.Post;
import com.sportconnect.social.post.repository.CommentLikeRepository;
import com.sportconnect.social.post.repository.CommentRepository;
import com.sportconnect.social.post.repository.PostLikeRepository;
import com.sportconnect.social.post.repository.PostRepository;
import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.repository.SportRepository;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import javax.sql.DataSource;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-55 slice 1: a group's seasons through the real pipeline (MockMvc, real wiring, the H2 round-trip, the real
 * {@code GlobalExceptionHandler}, the real {@code V073} reference seed for the group's timezone): who may read and write, the date
 * rules, the limit of two open seasons and the overlap, the edit and cancel rules, the links of a MANUAL season, the season's own thread,
 * the status job and the announcements, and two real-concurrency cases: two simultaneous creates for one group, and the status job
 * meeting a season somebody else holds.
 *
 * <p>Not run here: PostgreSQL's own row-lock behaviour and two real server instances (H2, one JVM).
 */
class GroupSeasonIntegrationTest extends RedisBaseIT {

    private static final String SEED = "db/changelog/changes/V073__seed_reference_data.sql";
    private static final String DEFAULT_LANGUAGE = "db/changelog/changes/V074__add_default_language_to_countries.sql";
    private static final Integer OWNER_ROLE_ID = 1;
    private static final Integer ADMIN_ROLE_ID = 2;
    private static final Integer MEMBER_ROLE_ID = 3;
    private static final ZoneId ZONE = ZoneId.of("Asia/Ho_Chi_Minh");

    @Autowired private DataSource dataSource;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private PlatformTransactionManager transactionManager;
    @Autowired private GroupSeasonService seasonService;
    @Autowired private SeasonTransitions transitions;
    @Autowired private GroupSeasonRepository seasonRepository;
    @Autowired private GroupSeasonSessionRepository linkRepository;
    @Autowired private GroupSessionSettingsRepository settingsRepository;
    @Autowired private SessionRepository sessionRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private GroupMemberRepository groupMemberRepository;
    @Autowired private PostRepository postRepository;
    @Autowired private CommentRepository commentRepository;
    @Autowired private CommentLikeRepository commentLikeRepository;
    @Autowired private PostLikeRepository postLikeRepository;
    @Autowired private SportRepository sportRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private CountryRepository countryRepository;
    @Autowired private RegionRepository regionRepository;
    @Autowired private LanguageRepository languageRepository;
    @Autowired private CacheManager cacheManager;

    private final AtomicLong postIds = new AtomicLong(9_000_000);

    private UUID ownerId;
    private UUID adminId;
    private UUID memberId;
    private UUID outsiderId;
    private UUID deactivatedId;
    private Long sportId;
    private Long vnCountryId;
    private Long vnRegionId;
    private Long groupId;
    private Long otherGroupId;
    private LocalDate today;

    @BeforeEach
    void setUp() {
        clearAll();
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator(
                new ClassPathResource(SEED), new ClassPathResource(DEFAULT_LANGUAGE));
        populator.setSqlScriptEncoding("UTF-8");
        populator.execute(dataSource);
        vnCountryId = countryRepository.findAll().stream().filter(c -> "VN".equals(c.getIso2())).findFirst().orElseThrow().getId();
        vnRegionId = regionRepository.findByCountryIdAndIsActiveTrueOrderByNameAsc(vnCountryId).get(0).getId();
        jdbcTemplate.update("UPDATE countries SET timezone = 'Asia/Ho_Chi_Minh' WHERE iso2 = 'VN'");

        ownerId = createUserWithRoles(true, "USER");
        adminId = createUserWithRoles(true, "USER");
        memberId = createUserWithRoles(true, "USER");
        outsiderId = createUserWithRoles(true, "USER");
        deactivatedId = createUserWithRoles(false, "USER");
        sportId = sportRepository.save(Sport.builder().name("SESSION-55 " + UUID.randomUUID()).isActive(true).statisticsEnabled(true).build()).getId();
        setSportSchema();
        groupId = saveGroup("SESSION-55 group");
        otherGroupId = saveGroup("SESSION-55 other group");
        join(groupId, ownerId, OWNER_ROLE_ID);
        join(groupId, adminId, ADMIN_ROLE_ID);
        join(groupId, memberId, MEMBER_ROLE_ID);
        join(groupId, deactivatedId, ADMIN_ROLE_ID);
        join(otherGroupId, ownerId, OWNER_ROLE_ID);
        today = LocalDate.now(ZONE);
    }

    @AfterEach
    void tearDown() {
        clearAll();
    }

    private void clearAll() {
        linkRepository.deleteAll();
        seasonRepository.deleteAll();
        sessionRepository.deleteAll();
        settingsRepository.deleteAll();
        commentLikeRepository.deleteAll();
        commentRepository.deleteAll();
        postLikeRepository.deleteAll();
        postRepository.deleteAll();
        groupMemberRepository.deleteAll();
        groupRepository.deleteAll();
        sportRepository.deleteAll();
        userRepository.deleteAll();
        regionRepository.deleteAllInBatch();
        countryRepository.deleteAllInBatch();
        languageRepository.deleteAllInBatch();
        evictSportCache();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    private void setSportSchema() {
        Sport sport = sportRepository.findById(sportId).orElseThrow();
        sport.setResultSchema(Map.of("version", 1, "maxRecords", 100, "record", Map.of("data", Map.of("type", "COMPETITIVE"),
                "scoreboard", Map.of("columns", List.of("games", "wins", "sessions")))));
        sportRepository.save(sport);
        evictSportCache();
    }

    private Long saveGroup(String name) {
        return groupRepository.save(Group.builder().countryId(vnCountryId).regionId(vnRegionId).groupName(name + " " + UUID.randomUUID())
                .createdBy(ownerId).isPrivate(false).isActive(true).sportId(sportId).build()).getId();
    }

    private void join(Long group, UUID userId, Integer roleId) {
        groupMemberRepository.save(GroupMember.builder().groupId(group).userId(userId).roleId(roleId).build());
    }

    private String base(Long group) {
        return "/api/sessions/group/" + group + "/seasons";
    }

    private Map<String, Object> body(String name, LocalDate start, LocalDate end) {
        Map<String, Object> body = new HashMap<>();
        body.put("name", name);
        body.put("startDate", start.toString());
        body.put("endDate", end.toString());
        return body;
    }

    private ResultActions sendAs(UUID userId, String method, String path, Object body) throws Exception {
        var builder = switch (method) {
            case "POST" -> post(path);
            case "PUT" -> put(path);
            case "DELETE" -> delete(path);
            default -> get(path);
        };
        builder.header("Authorization", bearer(userId));
        if (body != null) {
            builder.contentType(MediaType.APPLICATION_JSON).content(toJson(body));
        }
        return mockMvc.perform(builder);
    }

    private ResultActions getAs(UUID userId, String path) throws Exception {
        return sendAs(userId, "GET", path, null);
    }

    private Long createAs(UUID userId, Map<String, Object> body) throws Exception {
        String json = sendAs(userId, "POST", base(groupId), body).andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(json).get("data").get("id").asLong();
    }

    private Long createSeason(String name, int fromToday, int toToday) throws Exception {
        return createAs(ownerId, body(name, today.plusDays(fromToday), today.plusDays(toToday)));
    }

    private GroupSeason reload(Long id) {
        return seasonRepository.findById(id).orElseThrow();
    }

    private void setStatus(Long id, SeasonStatus status) {
        GroupSeason season = reload(id);
        season.setStatus(status);
        seasonRepository.save(season);
    }

    private Long sessionOn(Long group, LocalDate date) {
        Instant start = ZonedDateTime.of(date, java.time.LocalTime.of(10, 0), ZONE).toInstant();
        return sessionRepository.save(Session.builder().title("S " + date).groupId(group).isPublic(false).postId(postIds.incrementAndGet())
                .sessionType(SessionType.GROUP_RECURRING).createdBy(ownerId).sportId(sportId).locationId(1L)
                .scheduledStart(start).scheduledEndAt(start.plusSeconds(5400)).status(SessionStatus.COMPLETED).capacity(10)
                .feeType(FeeType.FREE).initialSlot(0).gameMood(5).autoApprove(true).build()).getId();
    }

    private List<Post> systemPosts() {
        return postRepository.findAll().stream().filter(p -> p.getPostType() == PostType.GROUP_SYSTEM).toList();
    }

    // ---- defaults and permissions -----------------------------------------------------------------------------------------

    @Test
    void defaults_showTheGroupsEffectiveStatListItsTimezoneAndToday_toAnOwnerOrAdmin_andNobodyElse() throws Exception {
        getAs(ownerId, base(groupId) + "/defaults").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.statsConfig.columns[0]").value("games"))
                .andExpect(jsonPath("$.data.statsConfig.columns[2]").value("sessions"))
                .andExpect(jsonPath("$.data.timezone").value("Asia/Ho_Chi_Minh"))
                .andExpect(jsonPath("$.data.today").value(today.toString()))
                .andExpect(jsonPath("$.data.maxDays").value(31));
        getAs(adminId, base(groupId) + "/defaults").andExpect(status().isOk());
        getAs(memberId, base(groupId) + "/defaults").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_ADMIN_REQUIRED"));
        getAs(outsiderId, base(groupId) + "/defaults").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_MEMBER_REQUIRED"));
        getAs(ownerId, base(999_999L) + "/defaults").andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("GROUP_NOT_FOUND"));
    }

    @Test
    void create_asAnOwnerOrAdmin_makesAScheduledSeasonWithItsOwnStatListAnchorPostAndAnnouncement() throws Exception {
        String json = sendAs(ownerId, "POST", base(groupId), body("December", today.plusDays(1), today.plusDays(10)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.status").value("SCHEDULED"))
                .andExpect(jsonPath("$.data.collectionMode").value("AUTO"))
                .andExpect(jsonPath("$.data.inheritRanks").value(false))
                .andExpect(jsonPath("$.data.timezone").value("Asia/Ho_Chi_Minh"))
                .andExpect(jsonPath("$.data.statsConfig.columns[1]").value("wins"))
                .andReturn().getResponse().getContentAsString();
        Long id = objectMapper.readTree(json).get("data").get("id").asLong();
        createAs(adminId, body("January", today.plusDays(20), today.plusDays(25)));

        GroupSeason season = reload(id);
        assertThat(season.getStatsConfig()).containsKey("columns");
        assertThat(postRepository.findById(season.getPostId()).orElseThrow().getPostType()).isEqualTo(PostType.SEASON_POST);
        assertThat(systemPosts()).extracting(Post::getSystemCode).contains(SystemCode.GROUP_SEASON_CREATED);
    }

    @Test
    void create_byAPlainMemberAnOutsiderOrADeactivatedAdmin_isRefused_andNothingIsWritten() throws Exception {
        Map<String, Object> request = body("Nope", today.plusDays(1), today.plusDays(5));
        sendAs(memberId, "POST", base(groupId), request).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_ADMIN_REQUIRED"));
        sendAs(outsiderId, "POST", base(groupId), request).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_MEMBER_REQUIRED"));
        // the per-request gate refuses a deactivated account before the controller runs, whatever role it still holds in the group
        int status = sendAs(deactivatedId, "POST", base(groupId), request).andReturn().getResponse().getStatus();
        assertThat(status).isIn(401, 403);
        assertThat(seasonRepository.findAll()).isEmpty();
    }

    // ---- the date rules -------------------------------------------------------------------------------------------------------

    @Test
    void create_refusesTheDatesThatBreakARule_withTheirOwnCodes() throws Exception {
        sendAs(ownerId, "POST", base(groupId), body("Past", today.minusDays(1), today.plusDays(3))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_START_IN_PAST"));
        sendAs(ownerId, "POST", base(groupId), body("Backwards", today.plusDays(5), today.plusDays(4))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_DATES_INVALID"));
        sendAs(ownerId, "POST", base(groupId), body("Long", today, today.plusDays(31))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_TOO_LONG"));
        sendAs(ownerId, "POST", base(groupId), body("Exactly 31", today, today.plusDays(30))).andExpect(status().isCreated());
        // a blank name on create is caught by the request validation; a whitespace-only one on an edit by the service
        sendAs(ownerId, "POST", base(groupId), body("", today.plusDays(40), today.plusDays(41))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"));
        Long id = createSeason("Named", 50, 51);
        sendAs(ownerId, "PUT", base(groupId) + "/" + id, Map.of("name", "   ")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_NAME_REQUIRED"));
    }

    @Test
    void create_withoutATimezoneForTheGroupsRegion_is409_andNoZoneIsGuessed() throws Exception {
        jdbcTemplate.update("UPDATE countries SET timezone = NULL");

        sendAs(ownerId, "POST", base(groupId), body("No zone", today.plusDays(1), today.plusDays(5))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_TIMEZONE_MISSING"));
        assertThat(seasonRepository.findAll()).isEmpty();
    }

    @Test
    void create_whenTheSportHasNoStatistics_is409() throws Exception {
        Sport sport = sportRepository.findById(sportId).orElseThrow();
        sport.setStatisticsEnabled(false);
        sportRepository.save(sport);
        evictSportCache();

        sendAs(ownerId, "POST", base(groupId), body("Off", today.plusDays(1), today.plusDays(5))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_STATISTICS_NOT_AVAILABLE"));
    }

    // ---- the limit and the overlap --------------------------------------------------------------------------------------------

    @Test
    void aGroupHoldsAtMostTwoOpenSeasons_aCancelledOneFreesAPlace_aCompletedOneDoesNotCount() throws Exception {
        Long first = createSeason("One", 1, 5);
        createSeason("Two", 10, 15);

        sendAs(ownerId, "POST", base(groupId), body("Three", today.plusDays(20), today.plusDays(25))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_LIMIT"));

        sendAs(ownerId, "POST", base(groupId) + "/" + first + "/cancel", null).andExpect(status().isOk());
        Long third = createSeason("Three", 20, 25);
        assertThat(reload(third).getStatus()).isEqualTo(SeasonStatus.SCHEDULED);

        setStatus(third, SeasonStatus.COMPLETED);
        createSeason("Four", 30, 35);
    }

    @Test
    void theEndDayIsOccupied_theNextSeasonStartsTheDayAfter_aCancelledSeasonFreesItsDays() throws Exception {
        Long first = createSeason("One", 1, 10);

        sendAs(ownerId, "POST", base(groupId), body("Touching", today.plusDays(10), today.plusDays(15))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_OVERLAP"))
                .andExpect(jsonPath("$.errorParams.seasonId").value(first));
        sendAs(ownerId, "POST", base(groupId), body("Inside", today.plusDays(3), today.plusDays(4))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_OVERLAP"));
        createSeason("Next", 11, 15);

        sendAs(ownerId, "POST", base(groupId) + "/" + first + "/cancel", null).andExpect(status().isOk());
        createSeason("Reuse", 2, 8);
    }

    @Test
    void anotherGroupsSeasonsNeverBlockThisGroup() throws Exception {
        seasonService.create(otherGroupId, ownerId, CreateSeasonRequest.builder().name("Other").startDate(today.plusDays(1))
                .endDate(today.plusDays(10)).build());

        createSeason("Mine", 1, 10);
    }

    // ---- edit, cancel ------------------------------------------------------------------------------------------------------------

    @Test
    void update_changesAScheduledSeason_andChecksTheDatesAndOverlapAgain_excludingItself() throws Exception {
        Long one = createSeason("One", 1, 5);
        createSeason("Two", 10, 15);

        sendAs(adminId, "PUT", base(groupId) + "/" + one, Map.of("name", "Renamed", "endDate", today.plusDays(8).toString(), "collectionMode", "MANUAL"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.data.name").value("Renamed"))
                .andExpect(jsonPath("$.data.collectionMode").value("MANUAL"));
        sendAs(adminId, "PUT", base(groupId) + "/" + one, Map.of("endDate", today.plusDays(12).toString())).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_OVERLAP"));
        sendAs(adminId, "PUT", base(groupId) + "/" + one, Map.of("startDate", today.minusDays(1).toString())).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_START_IN_PAST"));
        sendAs(memberId, "PUT", base(groupId) + "/" + one, Map.of("name", "x")).andExpect(status().isForbidden());

        assertThat(reload(one).getName()).isEqualTo("Renamed");
        assertThat(reload(one).getEndDate()).isEqualTo(today.plusDays(8));
    }

    @Test
    void update_isRefusedOnceTheSeasonIsNoLongerScheduled_beforeAnyField() throws Exception {
        Long id = createSeason("One", 1, 5);
        for (SeasonStatus status : List.of(SeasonStatus.ONGOING, SeasonStatus.COMPLETED, SeasonStatus.FINALISED, SeasonStatus.CANCELLED)) {
            setStatus(id, status);
            sendAs(ownerId, "PUT", base(groupId) + "/" + id, Map.of("name", "Late")).andExpect(status().isConflict())
                    .andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_NOT_EDITABLE"));
        }
        assertThat(reload(id).getName()).isEqualTo("One");
    }

    @Test
    void cancel_stopsAScheduledOrOngoingSeason_keepsItReadable_announcesIt_andIsFinalOtherwise() throws Exception {
        Long scheduled = createSeason("One", 1, 5);
        Long ongoing = createSeason("Two", 10, 15);
        setStatus(ongoing, SeasonStatus.ONGOING);

        sendAs(adminId, "POST", base(groupId) + "/" + scheduled + "/cancel", null).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.status").value("CANCELLED")).andExpect(jsonPath("$.data.cancelledAt").exists());
        sendAs(ownerId, "POST", base(groupId) + "/" + ongoing + "/cancel", null).andExpect(status().isOk());

        assertThat(reload(scheduled).getCancelledBy()).isEqualTo(adminId);
        getAs(memberId, base(groupId) + "/" + scheduled).andExpect(status().isOk()).andExpect(jsonPath("$.data.status").value("CANCELLED"));
        assertThat(systemPosts()).extracting(Post::getSystemCode).contains(SystemCode.GROUP_SEASON_CANCELLED);
        sendAs(ownerId, "POST", base(groupId) + "/" + scheduled + "/cancel", null).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_NOT_CANCELLABLE"));
        Long done = createSeason("Three", 20, 25);
        for (SeasonStatus status : List.of(SeasonStatus.COMPLETED, SeasonStatus.FINALISED)) {
            setStatus(done, status);
            sendAs(ownerId, "POST", base(groupId) + "/" + done + "/cancel", null).andExpect(status().isConflict());
        }
        sendAs(memberId, "POST", base(groupId) + "/" + done + "/cancel", null).andExpect(status().isForbidden());
    }

    // ---- reads ---------------------------------------------------------------------------------------------------------------------

    @Test
    void reads_areForMembers_aSeasonOfAnotherGroupIs404_andTheListFiltersByStatusAndPages() throws Exception {
        Long one = createSeason("One", 1, 5);
        Long two = createSeason("Two", 10, 15);
        setStatus(two, SeasonStatus.CANCELLED);

        getAs(memberId, base(groupId) + "/" + one).andExpect(status().isOk()).andExpect(jsonPath("$.data.name").value("One"))
                .andExpect(jsonPath("$.data.likeCount").value(0)).andExpect(jsonPath("$.data.isLikedByCurrentUser").value(false));
        getAs(outsiderId, base(groupId) + "/" + one).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_MEMBER_REQUIRED"));
        getAs(ownerId, base(otherGroupId) + "/" + one).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_NOT_FOUND"));

        getAs(memberId, base(groupId)).andExpect(status().isOk()).andExpect(jsonPath("$.data.totalElements").value(2))
                .andExpect(jsonPath("$.data.content[0].name").value("Two"));
        getAs(memberId, base(groupId) + "?status=SCHEDULED").andExpect(jsonPath("$.data.totalElements").value(1))
                .andExpect(jsonPath("$.data.content[0].name").value("One"));
        getAs(memberId, base(groupId) + "?status=SCHEDULED&status=CANCELLED&size=1").andExpect(jsonPath("$.data.content.length()").value(1))
                .andExpect(jsonPath("$.data.totalPages").value(2));
        getAs(outsiderId, base(groupId)).andExpect(status().isForbidden());
    }

    // ---- links ----------------------------------------------------------------------------------------------------------------------

    @Test
    void links_areForAManualSeasonThatIsOngoingOrCompleted_onlyOfThisGroupsSessionsInRange_andIdempotent() throws Exception {
        Long auto = createSeason("Auto", 1, 5);
        Long manual = createAs(ownerId, new HashMap<>(Map.of("name", "Manual", "startDate", today.plusDays(10).toString(),
                "endDate", today.plusDays(15).toString(), "collectionMode", "MANUAL")));
        Long inRange = sessionOn(groupId, today.plusDays(12));
        Long outOfRange = sessionOn(groupId, today.plusDays(30));
        Long otherGroups = sessionOn(otherGroupId, today.plusDays(12));
        String path = base(groupId) + "/" + manual + "/sessions";

        setStatus(auto, SeasonStatus.ONGOING);
        sendAs(ownerId, "PUT", base(groupId) + "/" + auto + "/sessions", Map.of("add", List.of(inRange))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_LINKS_NOT_ALLOWED"));
        sendAs(ownerId, "PUT", path, Map.of("add", List.of(inRange))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_LINKS_NOT_ALLOWED"));

        setStatus(manual, SeasonStatus.ONGOING);
        sendAs(ownerId, "PUT", path, Map.of("add", List.of(inRange))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].sessionId").value(inRange))
                .andExpect(jsonPath("$.data[0].localDate").value(today.plusDays(12).toString()));
        sendAs(adminId, "PUT", path, Map.of("add", List.of(inRange))).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(1));
        sendAs(ownerId, "PUT", path, Map.of("add", List.of(outOfRange))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_SESSION_INVALID")).andExpect(jsonPath("$.errorParams.reason").value("OUT_OF_RANGE"));
        sendAs(ownerId, "PUT", path, Map.of("add", List.of(otherGroups))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorParams.reason").value("NOT_IN_GROUP"));
        sendAs(ownerId, "PUT", path, Map.of("add", List.of(987_654L))).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorParams.reason").value("NOT_FOUND"));
        sendAs(memberId, "PUT", path, Map.of("add", List.of(inRange))).andExpect(status().isForbidden());
        List<Long> tooMany = new ArrayList<>();
        for (long i = 1; i <= 21; i++) {
            tooMany.add(i);
        }
        sendAs(ownerId, "PUT", path, Map.of("add", tooMany)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorParams.reason").value("TOO_MANY"));
        assertThat(linkRepository.countBySeasonId(manual)).isEqualTo(1);
        getAs(memberId, base(groupId) + "/" + manual).andExpect(jsonPath("$.data.linkedSessionCount").value(1));

        sendAs(ownerId, "PUT", path, Map.of("remove", List.of(inRange, 123L))).andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(0));
        setStatus(manual, SeasonStatus.COMPLETED);
        sendAs(ownerId, "PUT", path, Map.of("add", List.of(inRange))).andExpect(status().isOk());
        setStatus(manual, SeasonStatus.FINALISED);
        sendAs(ownerId, "PUT", path, Map.of("remove", List.of(inRange))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_SEASON_LINKS_NOT_ALLOWED"));
        assertThat(linkRepository.countBySeasonId(manual)).isEqualTo(1);
    }

    @Test
    void aSessionIsDatedInTheSeasonsTimezone_notUtc() throws Exception {
        Long manual = createAs(ownerId, new HashMap<>(Map.of("name", "Edge", "startDate", today.plusDays(10).toString(),
                "endDate", today.plusDays(10).toString(), "collectionMode", "MANUAL")));
        setStatus(manual, SeasonStatus.ONGOING);
        // 00:30 on the season's day in Ho Chi Minh City is still the day before in UTC
        Instant start = ZonedDateTime.of(today.plusDays(10), java.time.LocalTime.of(0, 30), ZONE).toInstant();
        Long session = sessionRepository.save(Session.builder().title("Late night").groupId(groupId).isPublic(false)
                .postId(postIds.incrementAndGet()).sessionType(SessionType.GROUP_RECURRING).createdBy(ownerId).sportId(sportId).locationId(1L)
                .scheduledStart(start).scheduledEndAt(start.plusSeconds(3600)).status(SessionStatus.COMPLETED).capacity(10)
                .feeType(FeeType.FREE).initialSlot(0).gameMood(5).autoApprove(true).build()).getId();

        sendAs(ownerId, "PUT", base(groupId) + "/" + manual + "/sessions", Map.of("add", List.of(session))).andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].localDate").value(today.plusDays(10).toString()));
    }

    // ---- the season's thread ----------------------------------------------------------------------------------------------------------

    @Test
    void theSeasonsThread_isForTheGroupsMembers_andItsAnchorIsNeverReadableThroughThePostsApi() throws Exception {
        Long id = createSeason("One", 1, 5);
        Long postId = reload(id).getPostId();

        sendAs(memberId, "POST", base(groupId) + "/" + id + "/comments", Map.of("content", "Good luck")).andExpect(status().isCreated());
        sendAs(outsiderId, "POST", base(groupId) + "/" + id + "/comments", Map.of("content", "Hi")).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_MEMBER_REQUIRED"));
        getAs(adminId, base(groupId) + "/" + id + "/comments").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.content[0].content").value("Good luck"));
        getAs(outsiderId, base(groupId) + "/" + id + "/comments").andExpect(status().isForbidden());

        sendAs(memberId, "POST", base(groupId) + "/" + id + "/like", null).andExpect(status().isOk());
        getAs(memberId, base(groupId) + "/" + id).andExpect(jsonPath("$.data.likeCount").value(1))
                .andExpect(jsonPath("$.data.isLikedByCurrentUser").value(true));
        sendAs(memberId, "DELETE", base(groupId) + "/" + id + "/like", null).andExpect(status().isOk());
        getAs(memberId, base(groupId) + "/" + id).andExpect(jsonPath("$.data.likeCount").value(0));

        // the anchor is in no feed and no direct read, like a session's: the posts API answers 404 for every caller
        getAs(ownerId, "/api/posts/" + postId).andExpect(status().isNotFound());
        getAs(memberId, "/api/posts/" + postId + "/comments").andExpect(status().isNotFound());
        sendAs(ownerId, "PUT", "/api/posts/" + postId, Map.of("content", "x")).andExpect(status().is4xxClientError());
    }

    // ---- the status job -----------------------------------------------------------------------------------------------------------------

    @Test
    void theStatusJob_startsASeasonOnItsFirstDay_announcesIt_completesItAfterItsLastDay_andDoesNothingTwice() throws Exception {
        Long startsToday = createSeason("Today", 0, 3);
        Long later = createSeason("Later", 10, 12);

        assertThat(transitions.tick()).isEqualTo(1);
        assertThat(reload(startsToday).getStatus()).isEqualTo(SeasonStatus.ONGOING);
        assertThat(reload(later).getStatus()).isEqualTo(SeasonStatus.SCHEDULED);
        assertThat(systemPosts()).extracting(Post::getSystemCode).contains(SystemCode.GROUP_SEASON_STARTED);
        assertThat(transitions.tick()).isZero();
        assertThat(systemPosts().stream().filter(p -> p.getSystemCode() == SystemCode.GROUP_SEASON_STARTED)).hasSize(1);

        // a season whose last day is over (written directly: the API refuses a past date) completes on the next pass
        GroupSeason season = reload(startsToday);
        season.setStartDate(today.minusDays(5));
        season.setEndDate(today.minusDays(2));
        seasonRepository.save(season);
        assertThat(transitions.tick()).isEqualTo(1);
        assertThat(reload(startsToday).getStatus()).isEqualTo(SeasonStatus.COMPLETED);
        assertThat(transitions.tick()).isZero();
    }

    @Test
    void theStatusJob_takesBothStepsWhenItWasDownForDays_andNeverStartsACancelledSeason() throws Exception {
        Long missed = createSeason("Missed", 1, 3);
        Long cancelled = createSeason("Cancelled", 10, 12);
        GroupSeason season = reload(missed);
        season.setStartDate(today.minusDays(10));
        season.setEndDate(today.minusDays(7));
        seasonRepository.save(season);
        GroupSeason other = reload(cancelled);
        other.setStartDate(today.minusDays(1));
        other.setEndDate(today.plusDays(2));
        other.setStatus(SeasonStatus.CANCELLED);
        seasonRepository.save(other);

        assertThat(transitions.tick()).isEqualTo(1);

        assertThat(reload(missed).getStatus()).isEqualTo(SeasonStatus.COMPLETED);
        assertThat(reload(cancelled).getStatus()).isEqualTo(SeasonStatus.CANCELLED);
        assertThat(systemPosts()).extracting(Post::getSystemCode).contains(SystemCode.GROUP_SEASON_STARTED);
    }

    // ---- concurrency -------------------------------------------------------------------------------------------------------------------------

    @Test
    void twoSimultaneousCreatesWithOverlappingDates_onlyOneWins_theOtherGetsTheOverlapError() throws Exception {
        int threads = 4;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CyclicBarrier barrier = new CyclicBarrier(threads);
        List<Future<String>> results = new ArrayList<>();
        for (int i = 0; i < threads; i++) {
            final int n = i;
            Callable<String> task = () -> {
                barrier.await(10, TimeUnit.SECONDS);
                try {
                    seasonService.create(groupId, ownerId, CreateSeasonRequest.builder().name("Race " + n)
                            .startDate(today.plusDays(1)).endDate(today.plusDays(10)).collectionMode(SeasonCollectionMode.AUTO).build());
                    return "created";
                } catch (com.sportconnect.common.exception.ConflictException e) {
                    return e.getErrorCode();
                }
            };
            results.add(pool.submit(task));
        }
        List<String> outcomes = new ArrayList<>();
        for (Future<String> result : results) {
            outcomes.add(result.get(60, TimeUnit.SECONDS));
        }
        pool.shutdown();

        assertThat(outcomes.stream().filter("created"::equals)).hasSize(1);
        assertThat(outcomes.stream().filter("SESSION_SEASON_OVERLAP"::equals)).hasSize(threads - 1);
        assertThat(seasonRepository.findByGroupIdAndStatusNot(groupId, SeasonStatus.CANCELLED)).hasSize(1);
    }

    @Test
    void theStatusJob_skipsASeasonSomeoneElseHoldsTheRowOf_andDoesItOnTheNextPass() throws Exception {
        Long id = createSeason("Held", 0, 3);
        TransactionTemplate template = new TransactionTemplate(transactionManager);
        ExecutorService pool = Executors.newSingleThreadExecutor();
        CyclicBarrier locked = new CyclicBarrier(2);
        CyclicBarrier release = new CyclicBarrier(2);
        Future<?> holder = pool.submit(() -> template.executeWithoutResult(tx -> {
            seasonRepository.findByIdForUpdate(id);
            try {
                locked.await(10, TimeUnit.SECONDS);
                release.await(10, TimeUnit.SECONDS);
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }));
        locked.await(10, TimeUnit.SECONDS);

        long begun = System.nanoTime();
        assertThat(transitions.tick()).isZero();
        long tookMs = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - begun);
        assertThat(reload(id).getStatus()).isEqualTo(SeasonStatus.SCHEDULED);
        // SKIP LOCKED: the held season is passed over at once, never waited for (a plain FOR UPDATE would wait for the lock timeout) and no error is recorded
        assertThat(tookMs).isLessThan(1000);
        assertThat(reload(id).getLastError()).isNull();

        release.await(10, TimeUnit.SECONDS);
        holder.get(10, TimeUnit.SECONDS);
        pool.shutdown();
        assertThat(transitions.tick()).isEqualTo(1);
        assertThat(reload(id).getStatus()).isEqualTo(SeasonStatus.ONGOING);
    }

    @Test
    void anEditAndACancelOfOneSeason_neverBothSucceedOnItsOldStatus() throws Exception {
        Long id = createSeason("Contested", 5, 9);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CyclicBarrier barrier = new CyclicBarrier(2);
        Future<String> cancel = pool.submit(() -> {
            barrier.await(10, TimeUnit.SECONDS);
            seasonService.cancel(groupId, id, ownerId);
            return "cancelled";
        });
        Future<String> edit = pool.submit(() -> {
            barrier.await(10, TimeUnit.SECONDS);
            try {
                seasonService.update(groupId, id, ownerId, com.sportconnect.session.api.dto.UpdateSeasonRequest.builder().name("Edited").build());
                return "edited";
            } catch (com.sportconnect.common.exception.ConflictException e) {
                return e.getErrorCode();
            }
        });
        assertThat(cancel.get(60, TimeUnit.SECONDS)).isEqualTo("cancelled");
        String edited = edit.get(60, TimeUnit.SECONDS);
        pool.shutdown();

        GroupSeason season = reload(id);
        assertThat(season.getStatus()).isEqualTo(SeasonStatus.CANCELLED);
        // whichever ran second saw the other's result under the season lock: an edit after the cancel is refused, an edit before it was kept
        assertThat(edited).isIn("edited", "SESSION_SEASON_NOT_EDITABLE");
        assertThat(season.getName()).isEqualTo("edited".equals(edited) ? "Edited" : "Contested");
    }

    private JsonNode json(ResultActions result) throws Exception {
        return objectMapper.readTree(result.andReturn().getResponse().getContentAsString());
    }
}
