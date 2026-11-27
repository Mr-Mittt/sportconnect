package com.sportconnect.integration;

import com.sportconnect.group.api.dto.CreateGroupRequest;
import com.sportconnect.group.api.dto.UpdateGroupRequest;
import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.entity.GroupSettings;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.group.repository.GroupSettingsRepository;
import com.sportconnect.reference.entity.Region;
import com.sportconnect.reference.repository.CountryRepository;
import com.sportconnect.reference.repository.LanguageRepository;
import com.sportconnect.reference.repository.RegionRepository;
import com.sportconnect.social.post.repository.PostRepository;
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
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import javax.sql.DataSource;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * B25: a group's required country and region through the real pipeline (MockMvc, real wiring, H2 round-trip, the real
 * {@code V073} reference seed): the owner's data as the default at creation, the validation of what is sent, who may change it
 * (owner and admin yes, a plain member 403), the {@code NOT NULL} write path, and the timezone derived from the region, else the
 * country. The migration {@code V110} itself is PostgreSQL-only SQL and is checked by hand against the dev database (see the
 * ticket); H2 here carries the same columns through {@code schema.sql}.
 */
class GroupGeoIntegrationTest extends RedisBaseIT {

    private static final String SEED = "db/changelog/changes/V073__seed_reference_data.sql";
    private static final String DEFAULT_LANGUAGE = "db/changelog/changes/V074__add_default_language_to_countries.sql";
    private static final Integer OWNER_ROLE_ID = 1;
    private static final Integer ADMIN_ROLE_ID = 2;
    private static final Integer MEMBER_ROLE_ID = 3;
    private static final Long DEFAULT_GROUP_TYPE_ID = 1L;

    @Autowired private DataSource dataSource;
    @Autowired private JdbcTemplate jdbcTemplate;
    @Autowired private UserRepository userRepository;
    @Autowired private SportRepository sportRepository;
    @Autowired private UserSportProfileRepository profileRepository;
    @Autowired private GroupRepository groupRepository;
    @Autowired private GroupSettingsRepository groupSettingsRepository;
    @Autowired private GroupMemberRepository groupMemberRepository;
    @Autowired private PostRepository postRepository;
    @Autowired private CountryRepository countryRepository;
    @Autowired private RegionRepository regionRepository;
    @Autowired private LanguageRepository languageRepository;
    @Autowired private CacheManager cacheManager;

    private Long vnCountryId;
    private Long vnRegionId;
    private Long otherCountryId;
    private Long otherRegionId;
    private Long sportId;
    private UUID ownerId;
    private UUID adminId;
    private UUID memberId;
    private UUID noGeoUserId;
    private Long groupId;

    @BeforeEach
    void setUp() {
        clearAll();
        ResourceDatabasePopulator populator = new ResourceDatabasePopulator(
                new ClassPathResource(SEED), new ClassPathResource(DEFAULT_LANGUAGE));
        populator.setSqlScriptEncoding("UTF-8");
        populator.execute(dataSource);
        vnCountryId = countryRepository.findAll().stream().filter(c -> "VN".equals(c.getIso2())).findFirst().orElseThrow().getId();
        vnRegionId = regionRepository.findByCountryIdAndIsActiveTrueOrderByNameAsc(vnCountryId).get(0).getId();
        // V110 sets Vietnam's zone in the real database; H2 is built from schema.sql, so the same update is made here.
        jdbcTemplate.update("UPDATE countries SET timezone = 'Asia/Ho_Chi_Minh' WHERE iso2 = 'VN'");
        // A second country with one region and no timezone, for the "region of another country" and "no zone" cases.
        jdbcTemplate.update("INSERT INTO countries (iso2, iso3, name) VALUES ('ZZ', 'ZZZ', 'Zedland')");
        otherCountryId = countryRepository.findAll().stream().filter(c -> "ZZ".equals(c.getIso2())).findFirst().orElseThrow().getId();
        otherRegionId = regionRepository.save(Region.builder().countryId(otherCountryId).isoCode("ZZ-1")
                .name("Zed One").nativeName("Zed One").build()).getId();

        sportId = sportRepository.save(Sport.builder().name("B25 Badminton " + UUID.randomUUID()).isActive(true).build()).getId();
        evictSportCache();
        ownerId = saveUser("owner", true);
        adminId = saveUser("admin", true);
        memberId = saveUser("member", true);
        noGeoUserId = saveUser("nogeo", false);
        profileRepository.save(UserSportProfile.builder().userId(ownerId).sportId(sportId).skillLevel("Intermediate").isActive(true).build());
        profileRepository.save(UserSportProfile.builder().userId(noGeoUserId).sportId(sportId).skillLevel("Intermediate").isActive(true).build());

        Group group = groupRepository.save(Group.builder().countryId(vnCountryId).regionId(vnRegionId)
                .groupName("B25 Group").createdBy(ownerId).isPrivate(false).isActive(true).sportId(sportId).build());
        groupId = group.getId();
        groupSettingsRepository.save(GroupSettings.builder().groupId(groupId).groupTypeId(DEFAULT_GROUP_TYPE_ID).build());
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(ownerId).roleId(OWNER_ROLE_ID).build());
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(adminId).roleId(ADMIN_ROLE_ID).build());
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(memberId).roleId(MEMBER_ROLE_ID).build());
    }

    @AfterEach
    void tearDown() {
        clearAll();
        evictSportCache();
    }

    private void clearAll() {
        postRepository.deleteAll();
        groupMemberRepository.deleteAll();
        groupSettingsRepository.deleteAll();
        groupRepository.deleteAll();
        profileRepository.deleteAll();
        sportRepository.deleteAll();
        userRepository.deleteAll();
        regionRepository.deleteAllInBatch();
        countryRepository.deleteAllInBatch();
        languageRepository.deleteAllInBatch();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    private UUID saveUser(String name, boolean withGeo) {
        User.UserBuilder builder = User.builder()
                .email("b25-" + name + "_" + System.nanoTime() + "@example.com")
                .firstName("B25").lastName(name).username("b25" + name + System.nanoTime()).isActive(true);
        if (withGeo) {
            builder.countryId(vnCountryId).regionId(vnRegionId);
        }
        return userRepository.save(builder.build()).getId();
    }

    private String createBody(String name, Long countryId, Long regionId) throws Exception {
        return toJson(CreateGroupRequest.builder().sportId(sportId).groupName(name).isPrivate(false)
                .countryId(countryId).regionId(regionId).build());
    }

    @Test
    void createGroup_withNoGeoSent_takesTheOwnersCountryAndRegion_andAnswersTheTimezone() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(post("/api/groups").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("B25 Defaults", null, null)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.countryId").value(vnCountryId))
                .andExpect(jsonPath("$.data.regionId").value(vnRegionId))
                .andExpect(jsonPath("$.data.timezone").value("Asia/Ho_Chi_Minh"));

        Group saved = groupRepository.findAll().stream().filter(g -> "B25 Defaults".equals(g.getGroupName())).findFirst().orElseThrow();
        assertThat(saved.getCountryId()).isEqualTo(vnCountryId);
        assertThat(saved.getRegionId()).isEqualTo(vnRegionId);
    }

    @Test
    void createGroup_withNoGeoSent_andAnOwnerWithNone_is400GroupGeoRequired_andWritesNothing() throws Exception {
        authenticateAs(noGeoUserId);

        mockMvc.perform(post("/api/groups").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("B25 Nothing", null, null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("GROUP_GEO_REQUIRED"));

        assertThat(groupRepository.findAll()).noneMatch(g -> "B25 Nothing".equals(g.getGroupName()));
    }

    @Test
    void createGroup_withOnlyACountry_is400GroupGeoIncomplete() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(post("/api/groups").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("B25 Half", vnCountryId, null)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("GROUP_GEO_INCOMPLETE"));
    }

    @Test
    void createGroup_withARegionOfAnotherCountry_is400RegionUnknown() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(post("/api/groups").with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(createBody("B25 Mismatch", vnCountryId, otherRegionId)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("REGION_UNKNOWN"));

        assertThat(groupRepository.findAll()).noneMatch(g -> "B25 Mismatch".equals(g.getGroupName()));
    }

    @Test
    void updateGroup_asOwnerAndAdmin_changesBothAndTheTimezoneFollowsTheRegion() throws Exception {
        // The region of the other country has no zone of its own and neither has its country: no zone is invented.
        authenticateAs(ownerId);
        mockMvc.perform(put("/api/groups/" + groupId).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(UpdateGroupRequest.builder().countryId(otherCountryId).regionId(otherRegionId).build())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.countryId").value(otherCountryId))
                .andExpect(jsonPath("$.data.regionId").value(otherRegionId))
                .andExpect(jsonPath("$.data.timezone").doesNotExist());

        // An admin may change it back; a region's own zone overrides its country's.
        jdbcTemplate.update("UPDATE regions SET timezone = 'Asia/Bangkok' WHERE id = ?", vnRegionId);
        authenticateAs(adminId);
        mockMvc.perform(put("/api/groups/" + groupId).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(UpdateGroupRequest.builder().countryId(vnCountryId).regionId(vnRegionId).build())))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.timezone").value("Asia/Bangkok"));

        Group saved = groupRepository.findById(groupId).orElseThrow();
        assertThat(saved.getCountryId()).isEqualTo(vnCountryId);
        assertThat(saved.getRegionId()).isEqualTo(vnRegionId);
    }

    @Test
    void updateGroup_asAPlainMember_is403_andChangesNothing() throws Exception {
        authenticateAs(memberId);

        mockMvc.perform(put("/api/groups/" + groupId).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(UpdateGroupRequest.builder().countryId(otherCountryId).regionId(otherRegionId).build())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_ADMIN_REQUIRED"));

        assertThat(groupRepository.findById(groupId).orElseThrow().getRegionId()).isEqualTo(vnRegionId);
    }

    @Test
    void updateGroup_withALoneRegion_is400GroupGeoIncomplete_andChangesNothing() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(put("/api/groups/" + groupId).with(csrf()).contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(UpdateGroupRequest.builder().regionId(otherRegionId).build())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("GROUP_GEO_INCOMPLETE"));

        assertThat(groupRepository.findById(groupId).orElseThrow().getRegionId()).isEqualTo(vnRegionId);
    }

    @Test
    void getGroup_answersTheCountryRegionAndTimezone() throws Exception {
        authenticateAs(memberId);

        mockMvc.perform(get("/api/groups/" + groupId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.countryId").value(vnCountryId))
                .andExpect(jsonPath("$.data.regionId").value(vnRegionId))
                .andExpect(jsonPath("$.data.timezone").value("Asia/Ho_Chi_Minh"));
    }

    @Test
    void aGroupWithoutACountryOrRegion_cannotBeWritten() {
        assertThatThrownBy(() -> groupRepository.saveAndFlush(Group.builder()
                .groupName("B25 No Geo").createdBy(ownerId).isActive(true).sportId(sportId).build()))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
