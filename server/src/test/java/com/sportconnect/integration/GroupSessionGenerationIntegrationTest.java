package com.sportconnect.integration;

import com.sportconnect.group.api.dto.UpdateGroupRecurrenceRequest;
import com.sportconnect.group.api.dto.UpdateGroupSettingsRequest;
import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.entity.GroupSettings;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.group.repository.GroupSettingsRepository;
import com.sportconnect.location.entity.Location;
import com.sportconnect.location.repository.LocationRepository;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.repository.SessionRepository;
import com.sportconnect.session.service.SessionGenerationService;
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

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * SESSION-38 real end-to-end coverage for the new {@code group-impl} -> {@code session-api}
 * cross-domain dependency. Specifically proves what no Spock unit test (hand-built mocks on both
 * sides) can: that the real {@code ApplicationContext} actually starts with
 * {@code GroupServiceImpl}'s new {@code @Lazy SessionService} field and {@code SessionServiceImpl}'s
 * pre-existing (now genuinely bidirectional) {@code GroupService} field — a {@code @Lazy}
 * misconfiguration only surfaces as a real {@code BeanCurrentlyInCreationException} at context
 * startup, never in a test that hand-constructs both services with mocks — and that the real call
 * chain (owner-facing endpoint -> {@code GroupServiceImpl} -> {@code SessionServiceImpl} ->
 * {@code GroupServiceImpl.getGroupRecurrenceConfigsByGroupIds} -> {@code SessionGenerationService
 * .generateForConfigs}) actually produces a {@code Session} row, not just that each link in the
 * chain was called with the right arguments.
 */
class GroupSessionGenerationIntegrationTest extends BaseIT {

    // Pre-seeded via server/src/test/resources/schema.sql's MERGE INTO group_roles/group_types —
    // mirrors production's V007 (roles) / V026 (types) seed data.
    private static final Integer OWNER_ROLE_ID = 1;
    private static final Long DEFAULT_GROUP_TYPE_ID = 1L;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private SportRepository sportRepository;

    @Autowired
    private LocationRepository locationRepository;

    @Autowired
    private GroupRepository groupRepository;

    @Autowired
    private GroupSettingsRepository groupSettingsRepository;

    @Autowired
    private GroupMemberRepository groupMemberRepository;

    @Autowired
    private SessionRepository sessionRepository;

    @Autowired
    private PostRepository postRepository;

    @Autowired
    private SessionGenerationService sessionGenerationService;

    @Autowired
    private CacheManager cacheManager;

    private UUID ownerId;
    private Long sportId;
    private Long locationId;

    @BeforeEach
    void setUpFixtures() {
        clearAll();

        ownerId = userRepository.save(User.builder()
                .email("session38-owner_" + System.nanoTime() + "@example.com")
                .passwordHash("hash")
                .firstName("Owner")
                .lastName("User")
                .username("s38owner_" + System.nanoTime())
                .isActive(true)
                .build()).getId();

        sportId = sportRepository.save(Sport.builder()
                .name("SESSION-38 Badminton " + UUID.randomUUID())
                .isActive(true)
                .build()).getId();
        evictSportCache();

        locationId = locationRepository.save(Location.builder()
                .sportId(sportId)
                .name("Court")
                .createdBy(ownerId)
                .build()).getId();
    }

    @AfterEach
    void tearDownFixtures() {
        clearAll();
        evictSportCache();
    }

    private void clearAll() {
        sessionRepository.deleteAll();
        postRepository.deleteAll();
        groupMemberRepository.deleteAll();
        groupSettingsRepository.deleteAll();
        groupRepository.deleteAll();
        locationRepository.deleteAll();
        sportRepository.deleteAll();
        userRepository.deleteAll();
    }

    private void evictSportCache() {
        if (cacheManager.getCache("sports") != null) {
            cacheManager.getCache("sports").clear();
        }
    }

    private Long createGroupWithOwner(boolean autoGenerateSessions) {
        Group group = groupRepository.save(Group.builder()
                .groupName("SESSION-38 Group " + UUID.randomUUID())
                .createdBy(ownerId)
                .isPrivate(true)
                .isActive(true)
                .sportId(sportId)
                .build());
        groupSettingsRepository.save(GroupSettings.builder()
                .groupId(group.getId())
                .groupTypeId(DEFAULT_GROUP_TYPE_ID)
                .autoGenerateSessions(autoGenerateSessions)
                .build());
        groupMemberRepository.save(GroupMember.builder()
                .groupId(group.getId())
                .userId(ownerId)
                .roleId(OWNER_ROLE_ID)
                .build());
        return group.getId();
    }

    @Test
    void updateGroupSettings_enablingAutoGenerateWithAnIncompleteRule_isANoOpNotAnError() throws Exception {
        Long groupId = createGroupWithOwner(false);
        UpdateGroupSettingsRequest request = UpdateGroupSettingsRequest.builder()
                .autoGenerateSessions(true)
                .build();

        authenticateAs(ownerId);
        mockMvc.perform(put("/api/groups/" + groupId + "/settings")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(request)))
                .andExpect(status().isOk());

        assertThat(sessionRepository.count()).isZero();
    }

    @Test
    void updateGroupRecurrence_completingAnAlreadyEnabledGroupsRule_createsTheNextOccurrence() throws Exception {
        Long groupId = createGroupWithOwner(true);
        UpdateGroupRecurrenceRequest request = UpdateGroupRecurrenceRequest.builder()
                .recurrenceDayOfWeek(DayOfWeek.SUNDAY)
                .recurrenceTime(LocalTime.of(10, 0))
                .recurrenceLocationId(locationId)
                .build();

        authenticateAs(ownerId);
        mockMvc.perform(put("/api/groups/" + groupId + "/recurrence")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(request)))
                .andExpect(status().isOk());

        List<Session> created = sessionRepository.findAll();
        assertThat(created).hasSize(1);
        assertThat(created.get(0).getGroupId()).isEqualTo(groupId);
        assertThat(created.get(0).getSessionType()).isEqualTo(SessionType.GROUP_RECURRING);
        assertThat(created.get(0).getStatus()).isEqualTo(SessionStatus.SCHEDULED);
    }

    @Test
    void closePastSessions_completingAGroupRecurringSession_generatesItsGroupsNextOccurrence() {
        Long groupId = createGroupWithOwner(true);
        Group group = groupRepository.findById(groupId).orElseThrow();
        group.setRecurrenceDayOfWeek(DayOfWeek.SUNDAY);
        group.setRecurrenceTime(LocalTime.of(10, 0));
        group.setRecurrenceLocationId(locationId);
        groupRepository.save(group);

        sessionRepository.save(Session.builder()
                .groupId(groupId)
                .isPublic(false)
                .postId(System.nanoTime())
                .sessionType(SessionType.GROUP_RECURRING)
                .createdBy(ownerId)
                .sportId(sportId)
                .locationId(locationId)
                .scheduledStart(Instant.now().minusSeconds(3600))
                .scheduledEndAt(Instant.now().minusSeconds(1))
                .status(SessionStatus.ONGOING)
                .build());

        sessionGenerationService.closePastSessions();

        List<Session> all = sessionRepository.findAll();
        assertThat(all).hasSize(2);
        assertThat(all).anyMatch(s -> s.getStatus() == SessionStatus.COMPLETED);
        assertThat(all).anyMatch(s -> s.getStatus() == SessionStatus.SCHEDULED && s.getGroupId().equals(groupId));
    }

    /** Closes a real IT gap: {@code updateGroupRecurrence}'s happy path was covered, but
     * {@code updateGroupSettings}'s own happy path (actually creating a session, not just the
     * no-op-on-incomplete-rule case already covered above) never was — a different call site
     * feeding the same shared trigger. */
    @Test
    void updateGroupSettings_enablingAutoGenerateWithACompleteRule_createsTheNextOccurrence() throws Exception {
        Long groupId = createGroupWithOwner(false);
        Group group = groupRepository.findById(groupId).orElseThrow();
        group.setRecurrenceDayOfWeek(DayOfWeek.SUNDAY);
        group.setRecurrenceTime(LocalTime.of(10, 0));
        group.setRecurrenceLocationId(locationId);
        groupRepository.save(group);

        UpdateGroupSettingsRequest request = UpdateGroupSettingsRequest.builder()
                .autoGenerateSessions(true)
                .build();

        authenticateAs(ownerId);
        mockMvc.perform(put("/api/groups/" + groupId + "/settings")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(request)))
                .andExpect(status().isOk());

        List<Session> created = sessionRepository.findAll();
        assertThat(created).hasSize(1);
        assertThat(created.get(0).getGroupId()).isEqualTo(groupId);
    }

    /** Closes a real IT gap: the idempotency backstop (`existsByGroupIdAndScheduledStart`) is the
     * exact catch block that silently masked the missing-postId bug this ticket found — proving it
     * actually prevents a duplicate, for real, rather than trusting the mocked Spock coverage
     * alone. */
    @Test
    void updateGroupRecurrence_calledTwiceForTheSameCompleteRule_createsOnlyOneSession() throws Exception {
        Long groupId = createGroupWithOwner(true);
        UpdateGroupRecurrenceRequest request = UpdateGroupRecurrenceRequest.builder()
                .recurrenceDayOfWeek(DayOfWeek.SUNDAY)
                .recurrenceTime(LocalTime.of(10, 0))
                .recurrenceLocationId(locationId)
                .build();

        authenticateAs(ownerId);
        mockMvc.perform(put("/api/groups/" + groupId + "/recurrence")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(request)))
                .andExpect(status().isOk());
        mockMvc.perform(put("/api/groups/" + groupId + "/recurrence")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(request)))
                .andExpect(status().isOk());

        assertThat(sessionRepository.count()).isEqualTo(1);
    }

    /** Closes a real IT gap: SESSION-38's own no-N+1 requirement ("must batch-resolve recurrence
     * configs/locations for the whole batch, not call out once per session") was only proven by a
     * mocked Spock test asserting the call shape — this proves the batched call actually resolves
     * and generates correctly for two distinct real groups in the same completed-sessions page. */
    @Test
    void closePastSessions_completingSessionsForTwoDifferentGroups_generatesBothGroupsNextOccurrences() {
        Long groupAId = createGroupWithOwner(true);
        Group groupA = groupRepository.findById(groupAId).orElseThrow();
        groupA.setRecurrenceDayOfWeek(DayOfWeek.SUNDAY);
        groupA.setRecurrenceTime(LocalTime.of(10, 0));
        groupA.setRecurrenceLocationId(locationId);
        groupRepository.save(groupA);

        Long groupBId = createGroupWithOwner(true);
        Group groupB = groupRepository.findById(groupBId).orElseThrow();
        groupB.setRecurrenceDayOfWeek(DayOfWeek.MONDAY);
        groupB.setRecurrenceTime(LocalTime.of(18, 0));
        groupB.setRecurrenceLocationId(locationId);
        groupRepository.save(groupB);

        sessionRepository.save(Session.builder()
                .groupId(groupAId).isPublic(false).postId(System.nanoTime())
                .sessionType(SessionType.GROUP_RECURRING).createdBy(ownerId).sportId(sportId)
                .locationId(locationId).scheduledStart(Instant.now().minusSeconds(3600))
                .scheduledEndAt(Instant.now().minusSeconds(1)).status(SessionStatus.ONGOING)
                .build());
        sessionRepository.save(Session.builder()
                .groupId(groupBId).isPublic(false).postId(System.nanoTime())
                .sessionType(SessionType.GROUP_RECURRING).createdBy(ownerId).sportId(sportId)
                .locationId(locationId).scheduledStart(Instant.now().minusSeconds(3600))
                .scheduledEndAt(Instant.now().minusSeconds(1)).status(SessionStatus.ONGOING)
                .build());

        sessionGenerationService.closePastSessions();

        List<Session> all = sessionRepository.findAll();
        assertThat(all).hasSize(4); // 2 original (now COMPLETED) + 2 newly generated
        assertThat(all).filteredOn(s -> s.getStatus() == SessionStatus.COMPLETED).hasSize(2);
        assertThat(all).filteredOn(s -> s.getStatus() == SessionStatus.SCHEDULED)
                .extracting(Session::getGroupId)
                .containsExactlyInAnyOrder(groupAId, groupBId);
    }
}
