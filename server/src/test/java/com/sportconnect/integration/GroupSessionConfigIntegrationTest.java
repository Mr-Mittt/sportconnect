package com.sportconnect.integration;

import com.fasterxml.jackson.databind.JsonNode;
import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.location.entity.Location;
import com.sportconnect.location.repository.LocationRepository;
import com.sportconnect.session.api.dto.RecurrenceMode;
import com.sportconnect.session.repository.GroupSessionRecurrenceRepository;
import com.sportconnect.session.repository.GroupSessionSettingsRepository;
import com.sportconnect.social.post.api.dto.PostType;
import com.sportconnect.social.post.api.dto.SystemCode;
import com.sportconnect.social.post.entity.Post;
import com.sportconnect.social.post.repository.PostRepository;
import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.repository.SportRepository;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-GROUP-4 through the real pipeline: a group's regular-session settings and recurrence configurations. Real tokens,
 * {@code GroupSessionConfigServiceImpl}, {@code GroupServiceImpl} permissions, the real tables, the {@code GROUP_SYSTEM}
 * post each change writes, and {@code GlobalExceptionHandler}. {@code GroupSessionConfigServiceImplSpec} covers every branch
 * with mocks.
 */
class GroupSessionConfigIntegrationTest extends RedisBaseIT {

    private static final Integer OWNER_ROLE_ID = 1;
    private static final Integer ADMIN_ROLE_ID = 2;
    private static final Integer MEMBER_ROLE_ID = 3;

    @Autowired private GroupSessionSettingsRepository settingsRepository;
    @Autowired private GroupSessionRecurrenceRepository recurrenceRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private GroupMemberRepository groupMemberRepository;
    @Autowired private PostRepository postRepository;
    @Autowired private LocationRepository locationRepository;
    @Autowired private SportRepository sportRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private CacheManager cacheManager;

    private UUID ownerId;
    private UUID adminId;
    private UUID memberId;
    private UUID otherMemberId;
    private UUID outsiderId;
    private Long sportId;
    private Long locationId;
    private Long otherSportLocationId;
    private Long groupId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        ownerId = createUserWithRoles(true, "USER");
        adminId = createUserWithRoles(true, "USER");
        memberId = createUserWithRoles(true, "USER");
        otherMemberId = createUserWithRoles(true, "USER");
        outsiderId = createUserWithRoles(true, "USER");
        sportId = sportRepository.save(Sport.builder().name("SESSION-GROUP-4 " + UUID.randomUUID()).isActive(true).build()).getId();
        Long otherSportId = sportRepository.save(Sport.builder().name("SESSION-GROUP-4 other " + UUID.randomUUID()).isActive(true).build()).getId();
        evictSportCache();
        locationId = locationRepository.save(Location.builder().sportId(sportId).name("Court").createdBy(ownerId).build()).getId();
        otherSportLocationId = locationRepository.save(Location.builder().sportId(otherSportId).name("Pool").createdBy(ownerId).build()).getId();
        groupId = groupRepository.save(Group.builder().groupName("SESSION-GROUP-4 " + UUID.randomUUID())
                .createdBy(ownerId).isPrivate(true).isActive(true).sportId(sportId).build()).getId();
        join(ownerId, OWNER_ROLE_ID);
        join(adminId, ADMIN_ROLE_ID);
        join(memberId, MEMBER_ROLE_ID);
        join(otherMemberId, MEMBER_ROLE_ID);
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
    }

    private void clearAll() {
        recurrenceRepository.deleteAll();
        settingsRepository.deleteAll();
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

    private void join(UUID userId, Integer roleId) {
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(userId).roleId(roleId).build());
    }

    private String base() {
        return "/api/sessions/group/" + groupId;
    }

    private ResultActions getAs(UUID userId, String path) throws Exception {
        return mockMvc.perform(get(base() + path).header("Authorization", bearer(userId)));
    }

    private ResultActions sendAs(UUID userId, String method, String path, Object body) throws Exception {
        var builder = switch (method) {
            case "POST" -> post(base() + path);
            case "PUT" -> put(base() + path);
            default -> delete(base() + path);
        };
        builder.header("Authorization", bearer(userId));
        if (body != null) {
            builder.contentType(MediaType.APPLICATION_JSON).content(toJson(body));
        }
        return mockMvc.perform(builder);
    }

    private Map<String, Object> complete(int dayKey, String startTime) {
        Map<String, Object> body = new HashMap<>();
        body.put("dayKey", dayKey);
        body.put("startTime", startTime);
        body.put("durationMinutes", 90);
        body.put("locationId", locationId);
        return body;
    }

    private Long createAs(UUID userId, Map<String, Object> body) throws Exception {
        String json = sendAs(userId, "POST", "/recurrences", body).andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return objectMapper.readTree(json).get("data").get("id").asLong();
    }

    private List<Post> systemPosts() {
        return postRepository.findAll().stream().filter(p -> p.getPostType() == PostType.GROUP_SYSTEM).toList();
    }

    // ---- settings ---------------------------------------------------------------------------------------------------

    @Test
    void settings_default_toOffAndWeekly_forAnyMember() throws Exception {
        getAs(memberId, "/settings").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.groupId").value(groupId))
                .andExpect(jsonPath("$.data.enabled").value(false))
                .andExpect(jsonPath("$.data.mode").value("WEEKLY"));
        assertThat(settingsRepository.count()).isZero();
    }

    @Test
    void anOwnerAndAnAdmin_changeTheSettings_andEachChangeWritesAGroupPostAuthoredByTheOwner() throws Exception {
        sendAs(adminId, "PUT", "/settings", Map.of("enabled", true)).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.enabled").value(true));
        sendAs(ownerId, "PUT", "/settings", Map.of("mode", "MONTHLY")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.mode").value("MONTHLY")).andExpect(jsonPath("$.data.enabled").value(true));

        assertThat(settingsRepository.findById(groupId).orElseThrow().getMode()).isEqualTo(RecurrenceMode.MONTHLY);
        List<Post> posts = systemPosts();
        assertThat(posts).extracting(Post::getSystemCode)
                .containsExactlyInAnyOrder(SystemCode.GROUP_SESSION_GENERATION_ON, SystemCode.GROUP_SESSION_MODE_CHANGED);
        // Authored as the group's current owner, never the admin who made the change; the admin's name is in the params.
        assertThat(posts).allSatisfy(p -> {
            assertThat(p.getUserId()).isEqualTo(ownerId);
            assertThat(p.getGroupId()).isEqualTo(groupId);
        });
        assertThat(posts.stream().filter(p -> p.getSystemCode() == SystemCode.GROUP_SESSION_GENERATION_ON).findFirst().orElseThrow()
                .getSystemParams()).containsEntry("mode", "WEEKLY").containsKey("name");
    }

    @Test
    void aSettingsUpdateThatChangesNothing_writesNoPost_andNoRow() throws Exception {
        sendAs(ownerId, "PUT", "/settings", Map.of("enabled", false, "mode", "WEEKLY")).andExpect(status().isOk());

        assertThat(systemPosts()).isEmpty();
        assertThat(settingsRepository.count()).isZero();
    }

    @Test
    void aPlainMember_cannotChangeSettings_403_andAnOutsiderCannotReadOrWrite() throws Exception {
        sendAs(memberId, "PUT", "/settings", Map.of("enabled", true)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_ADMIN_REQUIRED"));
        sendAs(outsiderId, "PUT", "/settings", Map.of("enabled", true)).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_MEMBER_REQUIRED"));
        getAs(outsiderId, "/settings").andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_MEMBER_REQUIRED"));

        assertThat(settingsRepository.count()).isZero();
        assertThat(systemPosts()).isEmpty();
    }

    @Test
    void anUnknownOrInactiveGroup_is404BeforeAnyPermissionAnswer() throws Exception {
        mockMvc.perform(get("/api/sessions/group/987654/settings").header("Authorization", bearer(ownerId)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.errorCode").value("GROUP_NOT_FOUND"));
        Group group = groupRepository.findById(groupId).orElseThrow();
        group.setIsActive(false);
        groupRepository.save(group);

        getAs(ownerId, "/settings").andExpect(status().isNotFound()).andExpect(jsonPath("$.errorCode").value("GROUP_NOT_FOUND"));
        sendAs(ownerId, "POST", "/recurrences", complete(1, "18:00")).andExpect(status().isNotFound());
    }

    // ---- recurrences ------------------------------------------------------------------------------------------------

    @Test
    void anAdmin_createsAConfiguration_inTheGroupsCurrentMode_andAMemberReadsIt() throws Exception {
        sendAs(ownerId, "PUT", "/settings", Map.of("mode", "MONTHLY")).andExpect(status().isOk());

        Long id = createAs(adminId, complete(31, "07:15"));

        getAs(memberId, "/recurrences").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(1))
                .andExpect(jsonPath("$.data[0].id").value(id))
                .andExpect(jsonPath("$.data[0].mode").value("MONTHLY"))
                .andExpect(jsonPath("$.data[0].dayKey").value(31))
                .andExpect(jsonPath("$.data[0].startTime").value("07:15:00"))
                .andExpect(jsonPath("$.data[0].durationMinutes").value(90))
                .andExpect(jsonPath("$.data[0].locationId").value(locationId))
                .andExpect(jsonPath("$.data[0].location.id").value(locationId))
                .andExpect(jsonPath("$.data[0].location.name").value("Court"))
                .andExpect(jsonPath("$.data[0].audience").value("ALL_MEMBERS"))
                .andExpect(jsonPath("$.data[0].feeType").value("FREE"))
                .andExpect(jsonPath("$.data[0].gameMood").value(5))
                .andExpect(jsonPath("$.data[0].draft").value(false))
                .andExpect(jsonPath("$.data[0].missing.length()").value(0));
        assertThat(systemPosts()).extracting(Post::getSystemCode).contains(SystemCode.GROUP_SESSION_RECURRENCE_ADDED);
    }

    // CLIENT-GROUP-SESSION-4: the response of a create, an update and the list carries the resolved location (real LocationService), so the
    // client lists a slot's place without asking for each location; a configuration with none has no location.
    @Test
    void everyConfigurationResponse_carriesTheResolvedLocation_andADraftWithoutOneHasNone() throws Exception {
        String created = sendAs(adminId, "POST", "/recurrences", complete(1, "18:00")).andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.location.id").value(locationId))
                .andExpect(jsonPath("$.data.location.name").value("Court"))
                .andReturn().getResponse().getContentAsString();
        Long id = objectMapper.readTree(created).get("data").get("id").asLong();

        Map<String, Object> noLocation = new HashMap<>();
        noLocation.put("dayKey", 2);
        noLocation.put("startTime", "19:00");
        sendAs(adminId, "POST", "/recurrences", noLocation).andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.locationId").doesNotExist())
                .andExpect(jsonPath("$.data.location").doesNotExist());

        sendAs(adminId, "PUT", "/recurrences/" + id, complete(1, "20:00")).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.location.name").value("Court"));

        getAs(memberId, "/recurrences").andExpect(status().isOk())
                .andExpect(jsonPath("$.data.length()").value(2))
                .andExpect(jsonPath("$.data[0].location.id").value(locationId))
                .andExpect(jsonPath("$.data[0].location.name").value("Court"))
                .andExpect(jsonPath("$.data[1].location").doesNotExist());
    }

    @Test
    void aConfigurationMissingItsLocationOrDuration_isSavedAsADraft_andSaysWhat() throws Exception {
        Map<String, Object> body = new HashMap<>();
        body.put("dayKey", 2);
        body.put("startTime", "19:00");

        String json = sendAs(adminId, "POST", "/recurrences", body).andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.draft").value(true))
                .andReturn().getResponse().getContentAsString();

        List<String> missing = new ArrayList<>();
        objectMapper.readTree(json).get("data").get("missing").forEach(n -> missing.add(n.asText()));
        assertThat(missing).containsExactly("locationId", "durationMinutes");
    }

    @Test
    void dayAndStartAreRequired_andTheDayMustFitTheMode() throws Exception {
        sendAs(adminId, "POST", "/recurrences", Map.of("startTime", "18:00")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECURRENCE_DAY_INVALID"));
        sendAs(adminId, "POST", "/recurrences", Map.of("dayKey", 8, "startTime", "18:00")).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECURRENCE_DAY_INVALID"));
        sendAs(adminId, "POST", "/recurrences", Map.of("dayKey", 3)).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECURRENCE_START_REQUIRED"));

        assertThat(recurrenceRepository.count()).isZero();
    }

    @Test
    void aLocationOfAnotherSport_isRefusedWithTheExistingMismatchCode() throws Exception {
        Map<String, Object> body = complete(1, "18:00");
        body.put("locationId", otherSportLocationId);

        sendAs(adminId, "POST", "/recurrences", body).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("GROUP_RECURRENCE_LOCATION_SPORT_MISMATCH"));

        assertThat(recurrenceRepository.count()).isZero();
        assertThat(systemPosts()).isEmpty();
    }

    @Test
    void aSixthConfigurationOnADay_is409_butAnotherDayOrTheOtherModeIsFine() throws Exception {
        for (int i = 0; i < 5; i++) {
            createAs(adminId, complete(1, String.format("%02d:00", 6 + i)));
        }

        sendAs(adminId, "POST", "/recurrences", complete(1, "20:00")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECURRENCE_DAY_LIMIT"))
                .andExpect(jsonPath("$.errorParams.limit").value(5));
        createAs(adminId, complete(2, "20:00"));

        // Switching the mode changes no row; in MONTHLY the same dayKey 1 starts a fresh count of 0.
        sendAs(ownerId, "PUT", "/settings", Map.of("mode", "MONTHLY")).andExpect(status().isOk());
        createAs(adminId, complete(1, "20:00"));
        assertThat(recurrenceRepository.count()).isEqualTo(7);
        getAs(memberId, "/recurrences").andExpect(status().isOk()).andExpect(jsonPath("$.data.length()").value(7));
    }

    @Test
    void aSpecificAudience_isStored_andReturned_andReplacedOnUpdate() throws Exception {
        Map<String, Object> body = complete(4, "18:00");
        body.put("audience", "SPECIFIC");
        body.put("audienceUserIds", List.of(memberId.toString(), otherMemberId.toString()));
        Long id = createAs(adminId, body);

        assertThat(recurrenceRepository.findById(id).orElseThrow().getAudienceUserIds())
                .containsExactly(memberId, otherMemberId);

        // Replace with one of the two (the whole list is replaced, a kept member included) and a new location note.
        Map<String, Object> replacement = complete(4, "18:00");
        replacement.put("audience", "SPECIFIC");
        replacement.put("audienceUserIds", List.of(memberId.toString()));
        replacement.put("locationNote", "Court 3");
        sendAs(ownerId, "PUT", "/recurrences/" + id, replacement).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.locationNote").value("Court 3"))
                .andExpect(jsonPath("$.data.audienceUserIds.length()").value(1));

        assertThat(recurrenceRepository.findById(id).orElseThrow().getAudienceUserIds()).containsExactly(memberId);
    }

    @Test
    void aSpecificAudienceNamingAnOutsider_is400_andNothingIsWritten() throws Exception {
        Map<String, Object> body = complete(4, "18:00");
        body.put("audience", "SPECIFIC");
        body.put("audienceUserIds", List.of(outsiderId.toString()));

        sendAs(adminId, "POST", "/recurrences", body).andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("SESSION_AUDIENCE_NOT_MEMBER"));

        assertThat(recurrenceRepository.count()).isZero();
        assertThat(systemPosts()).isEmpty();
    }

    @Test
    void updatingChangesTheFields_keepsTheMode_andWritesAPost_andCannotMoveOntoAFullDay() throws Exception {
        for (int i = 0; i < 5; i++) {
            createAs(adminId, complete(6, String.format("%02d:00", 6 + i)));
        }
        Long id = createAs(adminId, complete(1, "18:00"));

        Map<String, Object> changed = complete(1, "19:30");
        changed.put("durationMinutes", 60);
        sendAs(adminId, "PUT", "/recurrences/" + id, changed).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.startTime").value("19:30:00"))
                .andExpect(jsonPath("$.data.durationMinutes").value(60))
                .andExpect(jsonPath("$.data.mode").value("WEEKLY"));
        assertThat(systemPosts()).extracting(Post::getSystemCode).contains(SystemCode.GROUP_SESSION_RECURRENCE_UPDATED);

        // Day 6 already holds five: moving this one there is refused, and the row stays where it was.
        sendAs(adminId, "PUT", "/recurrences/" + id, complete(6, "19:30")).andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECURRENCE_DAY_LIMIT"));
        assertThat(recurrenceRepository.findById(id).orElseThrow().getDayKey()).isEqualTo(1);
        // Updating within a full day (day 6 again, same row) is not a collision with itself.
        Long onFullDay = recurrenceRepository.findAll().stream().filter(r -> r.getDayKey() == 6).findFirst().orElseThrow().getId();
        sendAs(adminId, "PUT", "/recurrences/" + onFullDay, complete(6, "23:00")).andExpect(status().isOk());
    }

    @Test
    void deleting_isAHardDelete_removesTheAudience_andWritesAPost_andAMemberCannotDelete() throws Exception {
        Map<String, Object> body = complete(5, "18:00");
        body.put("audience", "SPECIFIC");
        body.put("audienceUserIds", List.of(memberId.toString()));
        Long id = createAs(adminId, body);

        sendAs(memberId, "DELETE", "/recurrences/" + id, null).andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("SESSION_GROUP_ADMIN_REQUIRED"));
        assertThat(recurrenceRepository.findById(id)).isPresent();

        sendAs(adminId, "DELETE", "/recurrences/" + id, null).andExpect(status().isOk());

        assertThat(recurrenceRepository.findById(id)).isEmpty();
        assertThat(systemPosts()).extracting(Post::getSystemCode).contains(SystemCode.GROUP_SESSION_RECURRENCE_DELETED);
        sendAs(adminId, "DELETE", "/recurrences/" + id, null).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("SESSION_RECURRENCE_NOT_FOUND"));
    }

    @Test
    void aConfigurationOfAnotherGroup_isNotFoundHere() throws Exception {
        Long otherGroup = groupRepository.save(Group.builder().groupName("SESSION-GROUP-4 other " + UUID.randomUUID())
                .createdBy(ownerId).isPrivate(true).isActive(true).sportId(sportId).build()).getId();
        groupMemberRepository.save(GroupMember.builder().groupId(otherGroup).userId(ownerId).roleId(OWNER_ROLE_ID).build());
        Long id = createAs(adminId, complete(1, "18:00"));

        mockMvc.perform(delete("/api/sessions/group/" + otherGroup + "/recurrences/" + id).header("Authorization", bearer(ownerId)))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.errorCode").value("SESSION_RECURRENCE_NOT_FOUND"));
        assertThat(recurrenceRepository.findById(id)).isPresent();
    }

    @Test
    void theListIsOrderedByModeDayAndTime_bothModesShown() throws Exception {
        createAs(adminId, complete(3, "18:00"));
        createAs(adminId, complete(1, "20:00"));
        createAs(adminId, complete(1, "08:00"));
        sendAs(ownerId, "PUT", "/settings", Map.of("mode", "MONTHLY")).andExpect(status().isOk());
        createAs(adminId, complete(15, "09:00"));

        String json = getAs(memberId, "/recurrences").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
        JsonNode data = objectMapper.readTree(json).get("data");
        List<String> order = new ArrayList<>();
        data.forEach(n -> order.add(n.get("mode").asText() + ":" + n.get("dayKey").asInt() + ":" + n.get("startTime").asText()));
        assertThat(order).containsExactly("MONTHLY:15:09:00:00", "WEEKLY:1:08:00:00", "WEEKLY:1:20:00:00", "WEEKLY:3:18:00:00");
    }
}
