package com.sportconnect.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.location.entity.Location;
import com.sportconnect.location.repository.LocationRepository;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.record.SessionRecordRepository;
import com.sportconnect.session.repository.SessionOutboxEventRepository;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
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
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-70 through the real pipeline: an admin previews and applies the import of finished group sessions with their games.
 * Only an admin may call it; a session is created {@code COMPLETED} with its players {@code JOINED} and one record per game,
 * readable through the normal records endpoint although the session is long past the 24-hour edit window; nothing is notified or
 * commented; a name that matches no member or several blocks the whole apply before any write; a repeated apply skips.
 */
class SessionImportIntegrationTest extends RedisBaseIT {

    private static final Integer OWNER_ROLE_ID = 1;
    private static final Integer MEMBER_ROLE_ID = 3;
    private static final String TITLE = "BkBg's session on 29th, Oct 2026";

    @Autowired private SessionRepository sessionRepository;
    @Autowired private SessionParticipantRepository participantRepository;
    @Autowired private SessionRecordRepository recordRepository;
    @Autowired private SessionOutboxEventRepository outboxRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private GroupMemberRepository groupMemberRepository;
    @Autowired private PostRepository postRepository;
    @Autowired private CommentRepository commentRepository;
    @Autowired private LocationRepository locationRepository;
    @Autowired private SportRepository sportRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private CacheManager cacheManager;

    private UUID adminId;
    private UUID ownerId;
    private UUID hieu;
    private UUID duc;
    private UUID anhA;
    private UUID anhB;
    private UUID deactivated;
    private Long sportId;
    private Long locationId;
    private Long groupId;
    private LocalDate day;

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        day = LocalDate.now().minusDays(40);
        adminId = named(createUserWithRoles(true, "USER", "ADMIN"), "Admin", "Root");
        ownerId = named(createUserWithRoles(true, "USER"), "Bao", "Nguyen");
        hieu = named(createUserWithRoles(true, "USER"), "Hiếu", "Nguyen");
        duc = named(createUserWithRoles(true, "USER"), "Đức", "Tran");
        anhA = named(createUserWithRoles(true, "USER"), "Ánh", "Nguyen");
        anhB = named(createUserWithRoles(true, "USER"), "Ánh", "Vãng Lai");
        deactivated = named(createUserWithRoles(false, "USER"), "Gone", "Person");
        sportId = sportRepository.save(Sport.builder().name("SESSION-70 " + UUID.randomUUID()).isActive(true)
                .resultSchema(Map.of("maxRecords", 50, "record", Map.of("data", Map.of("playersPerSide", Map.of("min", 1, "max", 2)))))
                .build()).getId();
        evictSportCache();
        locationId = locationRepository.save(Location.builder().sportId(sportId).name("Tin sport").timezone("Asia/Ho_Chi_Minh")
                .createdBy(ownerId).build()).getId();
        groupId = groupRepository.save(Group.builder().groupName("B-k-B-g").createdBy(ownerId).isPrivate(true).isActive(true)
                .sportId(sportId).build()).getId();
        join(ownerId, OWNER_ROLE_ID);
        for (UUID member : List.of(hieu, duc, anhA, anhB, deactivated)) {
            join(member, MEMBER_ROLE_ID);
        }
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
    }

    private void clearAll() {
        outboxRepository.deleteAll();
        commentRepository.deleteAll();
        recordRepository.deleteAll();
        participantRepository.deleteAll();
        sessionRepository.deleteAll();
        postRepository.deleteAll();
        groupMemberRepository.deleteAll();
        groupRepository.deleteAll();
        locationRepository.deleteAll();
        userRepository.deleteAll();
        sportRepository.deleteAll();
        evictSportCache();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    private UUID named(UUID userId, String first, String last) {
        User user = userRepository.findById(userId).orElseThrow();
        user.setFirstName(first);
        user.setLastName(last);
        userRepository.save(user);
        return userId;
    }

    private void join(UUID userId, Integer roleId) {
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(userId).roleId(roleId).build());
    }

    private Map<String, Object> game(List<String> winners, List<String> losers) {
        return Map.of("winners", winners, "losers", losers);
    }

    private Map<String, Object> session(String title, List<Map<String, Object>> games) {
        return Map.of("title", title, "localDate", day.toString(), "startTime", "07:00", "endTime", "09:00", "games", games);
    }

    /** Two games with names that each match exactly one member (Bao is the owner). */
    private Map<String, Object> request(List<Map<String, Object>> sessions, Map<String, Object> aliases) {
        Map<String, Object> body = new java.util.HashMap<>();
        body.put("groupId", groupId);
        body.put("locationId", locationId);
        body.put("sessions", sessions);
        if (aliases != null) {
            body.put("aliases", aliases);
        }
        return body;
    }

    private List<Map<String, Object>> cleanSessions() {
        return List.of(session(TITLE, List.of(
                game(List.of("hieu", "DUC"), List.of("Bao")),
                game(List.of("Bao"), List.of("Hieu", "Duc")))));
    }

    private ResultActions as(String bearer, String path, Object body) throws Exception {
        return mockMvc.perform(post("/api/sessions/import" + path).header("Authorization", bearer)
                .contentType(MediaType.APPLICATION_JSON).content(toJson(body)));
    }

    // ---- who may call it --------------------------------------------------------------------------------------------

    @Test
    void aPlainUser_cannotPreviewOrApply_andNothingIsWritten() throws Exception {
        as(bearer(ownerId), "/preview", request(cleanSessions(), null)).andExpect(status().isForbidden());
        as(bearer(ownerId), "", request(cleanSessions(), null)).andExpect(status().isForbidden());

        assertThat(sessionRepository.count()).isZero();
    }

    @Test
    void aDeactivatedAdmin_isRefused_andNothingIsWritten() throws Exception {
        UUID deactivatedAdmin = createUserWithRoles(false, "USER", "ADMIN");

        as(bearer(deactivatedAdmin), "", request(cleanSessions(), null)).andExpect(status().is4xxClientError());

        assertThat(sessionRepository.count()).isZero();
    }

    // ---- preview ----------------------------------------------------------------------------------------------------

    @Test
    void preview_matchesNamesByFirstName_andWritesNothing() throws Exception {
        as(bearer(adminId), "/preview", request(cleanSessions(), null))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.canApply").value(true))
                .andExpect(jsonPath("$.data.hostUserId").value(ownerId.toString()))
                .andExpect(jsonPath("$.data.unresolved.length()").value(0))
                .andExpect(jsonPath("$.data.sessions[0].exists").value(false))
                .andExpect(jsonPath("$.data.sessions[0].games[0].winners[0].userId").value(hieu.toString()))
                .andExpect(jsonPath("$.data.sessions[0].games[0].winners[1].userId").value(duc.toString()));

        assertThat(sessionRepository.count()).isZero();
        assertThat(postRepository.count()).isZero();
    }

    @Test
    void preview_listsAnAmbiguousAndAnUnknownName_withTheirCandidates() throws Exception {
        List<Map<String, Object>> sessions = List.of(session(TITLE, List.of(game(List.of("Anh", "Anh_VL"), List.of("Bao")))));

        String json = as(bearer(adminId), "/preview", request(sessions, null)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.canApply").value(false)).andReturn().getResponse().getContentAsString();

        JsonNode unresolved = objectMapper.readTree(json).get("data").get("unresolved");
        assertThat(unresolved).hasSize(2);
        assertThat(unresolved.get(0).get("name").asText()).isEqualTo("Anh");
        assertThat(unresolved.get(0).get("candidates")).hasSize(2);
        assertThat(unresolved.get(1).get("name").asText()).isEqualTo("Anh_VL");
        assertThat(unresolved.get(1).get("candidates")).isEmpty();
    }

    // ---- apply ------------------------------------------------------------------------------------------------------

    @Test
    void apply_createsACompletedSession_withPlayersAndOneRecordPerGame_noNotificationNoComment() throws Exception {
        as(bearer(adminId), "", request(cleanSessions(), null))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.created").value(1))
                .andExpect(jsonPath("$.data.results[0].status").value("CREATED"));

        Session session = sessionRepository.findAll().get(0);
        assertThat(session.getStatus()).isEqualTo(SessionStatus.COMPLETED);
        assertThat(session.getGroupId()).isEqualTo(groupId);
        assertThat(session.getSportId()).isEqualTo(sportId);
        assertThat(session.getLocationId()).isEqualTo(locationId);
        assertThat(session.getCreatedBy()).isEqualTo(ownerId);
        assertThat(session.getTitle()).isEqualTo(TITLE);
        // 07:00 and 09:00 in Vietnam (UTC+7) are 00:00 and 02:00 UTC the same day.
        assertThat(session.getScheduledStart()).isEqualTo(day.atStartOfDay().toInstant(java.time.ZoneOffset.UTC));
        assertThat(session.getScheduledEndAt()).isEqualTo(day.atTime(2, 0).toInstant(java.time.ZoneOffset.UTC));
        assertThat(postRepository.findById(session.getPostId())).isPresent();

        List<SessionParticipant> participants = participantRepository.findAll();
        assertThat(participants).extracting(SessionParticipant::getUserId).containsExactlyInAnyOrder(ownerId, hieu, duc);
        assertThat(participants).allMatch(p -> p.getStatus() == ParticipantStatus.JOINED);
        assertThat(recordRepository.count()).isEqualTo(2);

        assertThat(outboxRepository.count()).isZero();
        assertThat(commentRepository.count()).isZero();
    }

    @Test
    void theImportedGames_areReadableThroughTheRecordsEndpoint_longAfterTheEditWindow() throws Exception {
        as(bearer(adminId), "", request(cleanSessions(), null)).andExpect(status().isOk());
        Long sessionId = sessionRepository.findAll().get(0).getId();

        String json = mockMvc.perform(get("/api/sessions/{id}/records", sessionId).header("Authorization", bearer(hieu)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString();

        JsonNode records = objectMapper.readTree(json).get("data");
        assertThat(records).hasSize(2);
        JsonNode first = records.get(0).get("data").get("teams");
        assertThat(first.get(0).get("players").get(0).asText()).isEqualTo(hieu.toString());
        assertThat(first.get(0).get("players").get(1).asText()).isEqualTo(duc.toString());
        assertThat(first.get(1).get("players").get(0).asText()).isEqualTo(ownerId.toString());
        assertThat(first.get(0).get("scores").get(0).isNull()).isTrue();
    }

    @Test
    void anAliasSettlesAnAmbiguousName() throws Exception {
        List<Map<String, Object>> sessions = List.of(session(TITLE, List.of(game(List.of("Anh", "Anh_VL"), List.of("Bao")))));
        Map<String, Object> aliases = Map.of("Anh", anhA.toString(), "Anh_VL", anhB.toString());

        as(bearer(adminId), "", request(sessions, aliases)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.created").value(1));

        assertThat(participantRepository.findAll()).extracting(SessionParticipant::getUserId)
                .containsExactlyInAnyOrder(ownerId, anhA, anhB);
    }

    @Test
    void anUnresolvedName_blocksTheWholeApply_beforeAnyWrite() throws Exception {
        List<Map<String, Object>> sessions = List.of(
                session(TITLE, List.of(game(List.of("Hieu"), List.of("Bao")))),
                session("second", List.of(game(List.of("Anh"), List.of("Bao")))));

        as(bearer(adminId), "", request(sessions, null)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_IMPORT_UNRESOLVED_NAMES"));

        assertThat(sessionRepository.count()).isZero();
        assertThat(recordRepository.count()).isZero();
        assertThat(postRepository.count()).isZero();
    }

    @Test
    void aDeactivatedMember_isNeverMatched() throws Exception {
        List<Map<String, Object>> sessions = List.of(session(TITLE, List.of(game(List.of("Gone"), List.of("Bao")))));

        as(bearer(adminId), "", request(sessions, null)).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_IMPORT_UNRESOLVED_NAMES"));

        assertThat(sessionRepository.count()).isZero();
    }

    @Test
    void aRepeatedApply_skipsTheSessionsAlreadyThere() throws Exception {
        as(bearer(adminId), "", request(cleanSessions(), null)).andExpect(status().isOk());

        as(bearer(adminId), "", request(cleanSessions(), null)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.created").value(0))
                .andExpect(jsonPath("$.data.skipped").value(1))
                .andExpect(jsonPath("$.data.results[0].status").value("SKIPPED"));

        assertThat(sessionRepository.count()).isEqualTo(1);
        assertThat(recordRepository.count()).isEqualTo(2);
        assertThat(postRepository.count()).isEqualTo(1);
    }

    @Test
    void aSessionThatHasNotEnded_isRefused() throws Exception {
        Map<String, Object> future = new java.util.HashMap<>(session(TITLE, List.of(game(List.of("Hieu"), List.of("Bao")))));
        future.put("localDate", LocalDate.now().plusDays(3).toString());

        as(bearer(adminId), "", request(List.of(future), null)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_IMPORT_NOT_FINISHED"));

        assertThat(sessionRepository.count()).isZero();
    }

    @Test
    void aMissingGroup_isNotFound_andAHostOutsideTheGroup_isRefused() throws Exception {
        Map<String, Object> missing = request(cleanSessions(), null);
        missing.put("groupId", 999999L);
        as(bearer(adminId), "", missing).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("GROUP_NOT_FOUND"));

        Map<String, Object> outsider = request(cleanSessions(), null);
        outsider.put("hostUserId", adminId.toString());
        as(bearer(adminId), "", outsider).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_IMPORT_HOST_NOT_MEMBER"));

        assertThat(sessionRepository.count()).isZero();
        assertThat(new ArrayList<>(participantRepository.findAll())).isEmpty();
    }
}
