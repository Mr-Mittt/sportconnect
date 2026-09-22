package com.sportconnect.integration;

import com.sportconnect.group.api.dto.UpdateGroupRecurrenceRequest;
import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.entity.GroupSettings;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.group.repository.GroupSettingsRepository;
import com.sportconnect.location.api.dto.LocationResponse;
import com.sportconnect.location.api.service.LocationService;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.sport.entity.Sport;
import com.sportconnect.sport.repository.SportRepository;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.cache.CacheManager;
import org.springframework.http.MediaType;

import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-38 — proves the {@code REQUIRES_NEW} fix on {@code SessionGenerationService
 * .generateForConfigs} actually isolates a real generation failure from the caller's own
 * transaction, which no Spock unit test (a mocked {@code PlatformTransactionManager} doesn't
 * exist) can prove. The original try/catch-only design looked correct in every mocked test and
 * still let a caught exception mark the whole physical transaction rollback-only — only a real
 * {@code @SpringBootTest} exercising a genuine failure through real Spring transaction management
 * could have caught that, and did (see this ticket's own doc for the full trail).
 *
 * <p>{@link LocationService} is the one collaborator replaced with a {@code @MockBean} here — the
 * rest of the chain (real {@code GroupServiceImpl}, real {@code SessionServiceImpl}, real
 * {@code SessionGenerationService}, real transaction manager, real DB) is untouched. This is a
 * deliberate, narrow substitution to make an otherwise-rare failure deterministic, not a step back
 * to a fully-mocked test: what's being proved (transaction isolation) is 100% real; only the
 * trigger for the failure is synthetic. {@code getLocation} (used by {@code updateGroupRecurrence}'s
 * own upfront sport-match validation) is stubbed to behave normally; only
 * {@code getLocationsByIds} (used inside {@code generateForConfigs}) is made to fail.
 */
class GroupSessionGenerationFailureIsolationIntegrationTest extends BaseIT {

    private static final Integer OWNER_ROLE_ID = 1;
    private static final Long DEFAULT_GROUP_TYPE_ID = 1L;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SportRepository sportRepository;

    @Autowired
    private GroupRepository groupRepository;

    @Autowired
    private GroupSettingsRepository groupSettingsRepository;

    @Autowired
    private GroupMemberRepository groupMemberRepository;

    @Autowired
    private SessionRepository sessionRepository;

    @Autowired
    private CacheManager cacheManager;

    @MockBean
    private LocationService locationService;

    private UUID ownerId;
    private Long sportId;
    private static final Long LOCATION_ID = 1L;

    @BeforeEach
    void setUpFixtures() {
        clearAll();

        ownerId = userRepository.save(User.builder()
                .email("session38-fail-owner_" + System.nanoTime() + "@example.com")
                .passwordHash("hash")
                .firstName("Owner")
                .lastName("User")
                .username("s38fail_" + System.nanoTime())
                .isActive(true)
                .build()).getId();

        sportId = sportRepository.save(Sport.builder()
                .name("SESSION-38 Failure Badminton " + UUID.randomUUID())
                .isActive(true)
                .build()).getId();
        evictSportCache();

        // Used by updateGroupRecurrence's own upfront "recurrenceLocationId's sport matches the
        // group's sport" validation — must keep behaving normally so the request gets far enough
        // to actually attempt generation.
        when(locationService.getLocation(eq(LOCATION_ID)))
                .thenReturn(LocationResponse.builder().id(LOCATION_ID).sportId(sportId).build());
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
        evictSportCache();
    }

    private void clearAll() {
        sessionRepository.deleteAll();
        groupMemberRepository.deleteAll();
        groupSettingsRepository.deleteAll();
        groupRepository.deleteAll();
        sportRepository.deleteAll();
        userRepository.deleteAll();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    private Long createGroupWithOwner() {
        Group group = groupRepository.save(Group.builder()
                .groupName("SESSION-38 Failure Group " + UUID.randomUUID())
                .createdBy(ownerId)
                .isPrivate(true)
                .isActive(true)
                .sportId(sportId)
                .build());
        groupSettingsRepository.save(GroupSettings.builder()
                .groupId(group.getId())
                .groupTypeId(DEFAULT_GROUP_TYPE_ID)
                .autoGenerateSessions(true)
                .build());
        groupMemberRepository.save(GroupMember.builder()
                .groupId(group.getId())
                .userId(ownerId)
                .roleId(OWNER_ROLE_ID)
                .build());
        return group.getId();
    }

    @Test
    void updateGroupRecurrence_aRealGenerationFailure_stillSucceedsAndPersistsTheRecurrenceChange() throws Exception {
        Long groupId = createGroupWithOwner();
        // The failure that used to poison the caller's own transaction — thrown from inside
        // generateForConfigs, deep inside the REQUIRES_NEW-isolated generation attempt.
        when(locationService.getLocationsByIds(any()))
                .thenThrow(new RuntimeException("simulated LocationService outage"));

        UpdateGroupRecurrenceRequest request = UpdateGroupRecurrenceRequest.builder()
                .recurrenceDayOfWeek(DayOfWeek.SUNDAY)
                .recurrenceTime(LocalTime.of(10, 0))
                .recurrenceLocationId(LOCATION_ID)
                .build();

        authenticateAs(ownerId);
        // The whole point: this must still be 200, not the UnexpectedRollbackException-driven 500
        // the pre-REQUIRES_NEW design produced.
        mockMvc.perform(put("/api/groups/" + groupId + "/recurrence")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(request)))
                .andExpect(status().isOk());

        // The recurrence change itself must have actually been persisted — this is the concrete
        // thing REQUIRES_NEW protects, not just "no 500 got returned".
        Group updated = groupRepository.findById(groupId).orElseThrow();
        assertThat(updated.getRecurrenceDayOfWeek()).isEqualTo(DayOfWeek.SUNDAY);
        assertThat(updated.getRecurrenceTime()).isEqualTo(LocalTime.of(10, 0));

        // And no partial/corrupt session was left behind by the failed generation attempt.
        List<?> sessions = sessionRepository.findAll();
        assertThat(sessions).isEmpty();
    }
}
