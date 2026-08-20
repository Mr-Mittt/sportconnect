package com.sportconnect.integration;

import com.sportconnect.group.api.dto.CreateGroupRequest;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.group.repository.GroupSettingsRepository;
import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.entity.UserSportProfile;
import com.sportconnect.sport.repository.SportRepository;
import com.sportconnect.sport.repository.UserSportProfileRepository;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cache.CacheManager;
import org.springframework.http.MediaType;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A7 end-to-end coverage for the two conditions that gate creating a sport-tagged entity: the sport
 * must still be active (reported as 404, per A7 collapsing inactive into not-found), and the
 * caller's sport profile must not be soft-deleted.
 *
 * <p>Every case here goes through a real {@code MockMvc} request, real {@code GroupController} /
 * {@code GroupServiceImpl} / {@code SportServiceImpl} / {@code SportLookupCache} /
 * {@code UserSportProfileServiceImpl} beans, and a real H2-backed DB round trip.
 * {@code GroupServiceImplSpec} and {@code UserSportProfileServiceImplSpec} cover the branch logic
 * with collaborators mocked; this class exists because those mocks cannot prove the part that
 * actually broke — that {@code existsByUserIdAndSportIdAndIsActiveTrue} really excludes a
 * soft-deleted row at the database level. A mocked {@code hasActiveProfileForActiveSport} returns
 * whatever the test says it does, which is exactly how the original bug survived: the old query
 * matched soft-deleted profiles, and no test could see it.
 *
 * <p>{@link #cacheManager} is cleared per-test on purpose. {@code SportLookupCache} caches the whole
 * sport map with no TTL, so a sport row inserted or flipped by one test would otherwise be invisible
 * to the next one in the same Spring context.
 */
class SportActiveGateIntegrationTest extends BaseIT {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SportRepository sportRepository;

    @Autowired
    private UserSportProfileRepository profileRepository;

    @Autowired
    private GroupRepository groupRepository;

    @Autowired
    private GroupMemberRepository groupMemberRepository;

    @Autowired
    private GroupSettingsRepository groupSettingsRepository;

    @Autowired
    private CacheManager cacheManager;

    private UUID userId;
    private Long activeSportId;
    private Long inactiveSportId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();

        userId = userRepository.save(User.builder()
                .email("a7-gate@example.com")
                .passwordHash("hash")
                .firstName("Gate")
                .lastName("Tester")
                .username("a7gate")
                .isActive(true)
                .build()).getId();

        activeSportId = sportRepository.save(
                Sport.builder().name("A7 Badminton").isActive(true).build()).getId();
        inactiveSportId = sportRepository.save(
                Sport.builder().name("A7 Tennis").isActive(false).build()).getId();

        evictSportCache();
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
        evictSportCache();
    }

    private void clearAll() {
        groupSettingsRepository.deleteAll();
        groupMemberRepository.deleteAll();
        groupRepository.deleteAll();
        profileRepository.deleteAll();
        sportRepository.deleteAll();
        userRepository.deleteAll();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    private UserSportProfile profileFor(Long sportId, boolean active) {
        return profileRepository.save(UserSportProfile.builder()
                .userId(userId)
                .sportId(sportId)
                .skillLevel("Intermediate")
                .isActive(active)
                .build());
    }

    private String createGroupJson(Long sportId, String name) throws Exception {
        return toJson(CreateGroupRequest.builder()
                .sportId(sportId)
                .groupName(name)
                .description("A7 gate test")
                .isPrivate(false)
                .build());
    }

    @Test
    void createGroup_succeeds_whenSportActiveAndProfileActive() throws Exception {
        authenticateAs(userId);
        profileFor(activeSportId, true);

        mockMvc.perform(post("/api/groups")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createGroupJson(activeSportId, "A7 Happy Path")))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.groupName").value("A7 Happy Path"));
    }

    @Test
    void createGroup_rejects_whenSportDeactivated() throws Exception {
        authenticateAs(userId);
        // The user genuinely holds an active profile — only the sport was switched off. A7 treats
        // that as indistinguishable from a sport that never existed, so this is a 404, not a 400
        // about a profile the user actually has.
        profileFor(inactiveSportId, true);

        mockMvc.perform(post("/api/groups")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createGroupJson(inactiveSportId, "A7 Inactive Sport")))
                .andExpect(status().isNotFound());
    }

    @Test
    void createGroup_rejects_whenProfileSoftDeleted() throws Exception {
        authenticateAs(userId);
        // The A7 bug, end to end: before the fix this returned 200. deleteProfile only flips
        // isActive, and the old existsByUserIdAndSportId matched the row regardless.
        profileFor(activeSportId, false);

        mockMvc.perform(post("/api/groups")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createGroupJson(activeSportId, "A7 Deleted Profile")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message")
                        .value("You must have a sport profile for this sport to create a group"));
    }

    @Test
    void createProfile_reactivatesSoftDeletedRow_ratherThanViolatingTheUniqueConstraint() throws Exception {
        // (user_id, sport_id) is UNIQUE, and deleteProfile only flips isActive - so inserting a
        // second row would fail at the database. Only a real DB round trip proves the reactivation
        // path actually avoids that; a mocked repository would accept either implementation.
        authenticateAs(userId);
        UserSportProfile deleted = profileFor(activeSportId, false);

        mockMvc.perform(post("/api/sports/profiles")
                        .contentType(MediaType.APPLICATION_JSON)
                        // Raw JSON rather than the DTO: sport-impl declares sport-api as
                        // implementation, so its DTOs are not on the server test classpath.
                        .content("{\"sportId\":" + activeSportId + ",\"skillLevel\":\"Advanced\"}"))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.id").value(deleted.getId().intValue()))
                .andExpect(jsonPath("$.data.skillLevel").value("Advanced"));

        assertThat(profileRepository.findAll()).hasSize(1);
        assertThat(profileRepository.findById(deleted.getId()).orElseThrow().getIsActive()).isTrue();
    }

    @Test
    void createGroup_rejects_whenNoProfileAtAll() throws Exception {
        authenticateAs(userId);
        // Regression guard for the pre-existing behaviour A7 must not have changed.
        mockMvc.perform(post("/api/groups")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(createGroupJson(activeSportId, "A7 No Profile")))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message")
                        .value("You must have a sport profile for this sport to create a group"));
    }
}
