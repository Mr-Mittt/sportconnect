package com.sportconnect.integration;

import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.entity.GroupSettings;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.group.repository.GroupSettingsRepository;
import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.repository.SportRepository;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.http.MediaType;

import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * GROUP-1 through the real pipeline: the old single weekly recurrence rule is gone from the group module (its endpoints, its
 * columns, its flag), and the group endpoints that sat next to it still work without them.
 */
class GroupOldRecurrenceRuleRemovedIntegrationTest extends RedisBaseIT {

    private static final Integer OWNER_ROLE_ID = 1;

    @Autowired private GroupRepository groupRepository;
    @Autowired private GroupMemberRepository groupMemberRepository;
    @Autowired private GroupSettingsRepository groupSettingsRepository;
    @Autowired private SportRepository sportRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private CacheManager cacheManager;

    private UUID ownerId;
    private Long groupId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();
        ownerId = createUserWithRoles(true, "USER");
        Long sportId = sportRepository.save(Sport.builder().name("GROUP-1 " + UUID.randomUUID()).isActive(true).build()).getId();
        evictSportCache();
        groupId = groupRepository.save(Group.builder().countryId(1L).regionId(1L).groupName("GROUP-1 " + UUID.randomUUID()).createdBy(ownerId)
                .isPrivate(false).isActive(true).sportId(sportId).build()).getId();
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(ownerId).roleId(OWNER_ROLE_ID).build());
        groupSettingsRepository.save(GroupSettings.builder().groupId(groupId).groupTypeId(1L).build());
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
    }

    private void clearAll() {
        groupSettingsRepository.deleteAll();
        groupMemberRepository.deleteAll();
        groupRepository.deleteAll();
        userRepository.deleteAll();
        sportRepository.deleteAll();
        evictSportCache();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    @Test
    void theOldRecurrenceEndpoints_areGone() throws Exception {
        // No handler any more: the framework answers 404 (an unknown path) or 405, never the old 200 or its coded errors.
        int get = mockMvc.perform(get("/api/groups/{id}/recurrence", groupId).header("Authorization", bearer(ownerId)))
                .andReturn().getResponse().getStatus();
        int put = mockMvc.perform(put("/api/groups/{id}/recurrence", groupId).header("Authorization", bearer(ownerId))
                        .contentType(MediaType.APPLICATION_JSON).content("{\"recurrenceTime\":\"18:00\"}"))
                .andReturn().getResponse().getStatus();
        org.assertj.core.api.Assertions.assertThat(get).isIn(404, 405);
        org.assertj.core.api.Assertions.assertThat(put).isIn(404, 405);
    }

    @Test
    void theGroupSettings_stillWork_withoutTheAutoGenerateFlag() throws Exception {
        mockMvc.perform(get("/api/groups/{id}/settings", groupId).header("Authorization", bearer(ownerId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.groupId").value(groupId))
                .andExpect(jsonPath("$.data.allowMemberPosts").exists())
                .andExpect(jsonPath("$.data.autoGenerateSessions").doesNotExist());

        // A client that still sends the removed field is not an error: the unknown property is ignored.
        mockMvc.perform(put("/api/groups/{id}/settings", groupId).header("Authorization", bearer(ownerId))
                        .contentType(MediaType.APPLICATION_JSON).content(toJson(Map.of("allowMemberPosts", false, "autoGenerateSessions", true))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.allowMemberPosts").value(false))
                .andExpect(jsonPath("$.data.autoGenerateSessions").doesNotExist());
    }

    @Test
    void aGroupIsStillReadable_andSavedWithoutTheRecurrenceColumns() throws Exception {
        mockMvc.perform(get("/api/groups/{id}", groupId).header("Authorization", bearer(ownerId)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(groupId));
        Group group = groupRepository.findById(groupId).orElseThrow();
        group.setDescription("still saves");
        groupRepository.saveAndFlush(group);
    }
}
