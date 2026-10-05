package com.sportconnect.integration;

import com.sportconnect.group.api.dto.CreateGroupRequest;
import com.sportconnect.group.api.dto.CreateJoinRequestRequest;
import com.sportconnect.group.api.dto.UpdateGroupGeneralDataRequest;
import com.sportconnect.group.api.dto.UpdateGroupRequest;
import com.sportconnect.group.entity.Group;
import com.sportconnect.group.api.dto.CreateInvitationRequest;
import com.sportconnect.group.api.dto.PinPostRequest;
import com.sportconnect.group.entity.GroupInvitation;
import com.sportconnect.group.entity.GroupJoinRequest;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.entity.GroupPinnedPost;
import com.sportconnect.group.entity.GroupSettings;
import com.sportconnect.group.repository.GroupInvitationRepository;
import com.sportconnect.group.repository.GroupJoinRequestRepository;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupPinnedPostRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.group.repository.GroupSettingsRepository;
import com.sportconnect.social.post.api.dto.PostType;
import com.sportconnect.social.post.entity.Post;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A11: the group module's authorization and not-found boundaries through the real pipeline
 * (MockMvc, real Spring wiring, real H2 round-trip, real {@code GlobalExceptionHandler}). Each case
 * asserts the HTTP status and {@code errorCode} beside the unchanged English {@code message}.
 *
 * <p>Covers the availability-vs-visibility split (404 vs 403), the 400→403 permission moves, the
 * 400→409 state conflicts, and the coded 400s that stayed 400, across group CRUD, membership and
 * roles, join requests, invitations and pinned posts. Rows for the paths under test are seeded
 * directly through the repositories (A11 added the join-request, invitation and pin tables to the
 * H2 test schema).
 *
 * <p>Extends {@link RedisBaseIT}, not {@link BaseIT}: the pin cases that pass the group checks go
 * through {@code PostService.getPostById}, whose response mapping touches {@code
 * StringRedisTemplate}. On plain {@code BaseIT} they pass on a machine with a dev Redis on
 * localhost and fail with a 500 in CI, which has none.
 *
 * <p>Not covered here: {@code GROUP_POST_NOT_FOUND} is unreachable through the API ({@code
 * PostService.getPostById} throws its own un-coded post-module 404 before the group check can see
 * a null; that un-coded 404 is A18's territory). {@code GROUP_MEMBER_NOT_FOUND} (role change or
 * ownership transfer for a non-member) is covered by the Spock spec only.
 */
class GroupErrorCodesIntegrationTest extends RedisBaseIT {

    private static final Integer OWNER_ROLE_ID = 1;
    private static final Integer ADMIN_ROLE_ID = 2;
    private static final Integer MEMBER_ROLE_ID = 3;
    private static final Long DEFAULT_GROUP_TYPE_ID = 1L;
    private static final Long TINY_GROUP_TYPE_ID = 99L;

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
    private GroupJoinRequestRepository joinRequestRepository;
    @Autowired
    private GroupInvitationRepository invitationRepository;
    @Autowired
    private GroupPinnedPostRepository pinnedPostRepository;
    @Autowired
    private PostRepository postRepository;
    @Autowired
    private JdbcTemplate jdbcTemplate;
    @Autowired
    private CacheManager cacheManager;

    private UUID ownerId;
    private UUID adminId;
    private UUID memberId;
    private UUID outsiderId;
    private Long sportId;
    private Long publicGroupId;
    private Long privateGroupId;

    @BeforeEach
    void setUp() {
        clearAll();
        ownerId = saveUser("owner");
        adminId = saveUser("admin");
        memberId = saveUser("member");
        outsiderId = saveUser("outsider");
        sportId = sportRepository.save(Sport.builder()
                .name("A11 Badminton " + UUID.randomUUID()).isActive(true).build()).getId();
        evictSportCache();
        publicGroupId = saveGroup("A11 Public Group", false);
        privateGroupId = saveGroup("A11 Private Group", true);
    }

    @AfterEach
    void tearDown() {
        clearAll();
        evictSportCache();
    }

    private void clearAll() {
        pinnedPostRepository.deleteAll();
        invitationRepository.deleteAll();
        joinRequestRepository.deleteAll();
        postRepository.deleteAll();
        jdbcTemplate.update("DELETE FROM group_types WHERE id = ?", TINY_GROUP_TYPE_ID);
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

    private UUID saveUser(String name) {
        return userRepository.save(User.builder()
                .email("a11-" + name + "_" + System.nanoTime() + "@example.com")
                .passwordHash("hash").firstName("A11").lastName(name)
                .username("a11" + name + System.nanoTime()).isActive(true).build()).getId();
    }

    /** Saves a group owned by {@link #ownerId} with an admin and a plain member. */
    private Long saveGroup(String name, boolean isPrivate) {
        Group group = groupRepository.save(Group.builder()
                .groupName(name).createdBy(ownerId).isPrivate(isPrivate).isActive(true).sportId(sportId).build());
        groupSettingsRepository.save(GroupSettings.builder()
                .groupId(group.getId()).groupTypeId(DEFAULT_GROUP_TYPE_ID).build());
        saveMember(group.getId(), ownerId, OWNER_ROLE_ID);
        saveMember(group.getId(), adminId, ADMIN_ROLE_ID);
        saveMember(group.getId(), memberId, MEMBER_ROLE_ID);
        return group.getId();
    }

    private void saveMember(Long groupId, UUID userId, Integer roleId) {
        groupMemberRepository.save(GroupMember.builder().groupId(groupId).userId(userId).roleId(roleId).build());
    }

    // ---- 404 availability ------------------------------------------------------------------

    @Test
    void getGroup_whenTheGroupDoesNotExist_is404GroupNotFound() throws Exception {
        authenticateAs(outsiderId);

        mockMvc.perform(get("/api/groups/999999"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("GROUP_NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("Group not found"));
    }

    @Test
    void getGroupMembers_whenTheGroupDoesNotExist_is404GroupNotFound() throws Exception {
        authenticateAs(memberId);

        mockMvc.perform(get("/api/groups/999999/members"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("GROUP_NOT_FOUND"));
    }

    // ---- 403 visibility --------------------------------------------------------------------

    @Test
    void getGroup_privateGroupAsNonMember_is403GroupPrivate() throws Exception {
        authenticateAs(outsiderId);

        mockMvc.perform(get("/api/groups/" + privateGroupId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_PRIVATE"))
                .andExpect(jsonPath("$.message").value("This group is private. Request to join to view its details"));
    }

    @Test
    void getGroupSettings_asNonMember_is403MemberRequired() throws Exception {
        authenticateAs(outsiderId);

        mockMvc.perform(get("/api/groups/" + publicGroupId + "/settings"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_MEMBER_REQUIRED"));
    }

    @Test
    void updateGroup_asPlainMember_is403AdminRequired() throws Exception {
        authenticateAs(memberId);

        mockMvc.perform(put("/api/groups/" + publicGroupId)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(UpdateGroupRequest.builder().description("changed").build())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_ADMIN_REQUIRED"))
                .andExpect(jsonPath("$.message").value("Only group owner or admin can update group"));
    }

    @Test
    void updateGroup_asAdmin_isNotRejected() throws Exception {
        authenticateAs(adminId);

        mockMvc.perform(put("/api/groups/" + publicGroupId)
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(UpdateGroupRequest.builder().description("changed").build())))
                .andExpect(status().isOk());
    }

    @Test
    void addMember_asPlainMember_is403AdminRequired() throws Exception {
        authenticateAs(memberId);

        mockMvc.perform(post("/api/groups/" + publicGroupId + "/members")
                        .with(csrf())
                        .param("targetUserId", outsiderId.toString()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_ADMIN_REQUIRED"));
    }

    @Test
    void deleteGroup_asAdmin_is403OwnerRequired() throws Exception {
        authenticateAs(adminId);

        mockMvc.perform(delete("/api/groups/" + publicGroupId).with(csrf()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_OWNER_REQUIRED"));
    }

    @Test
    void updateMemberRole_asAdmin_is403OwnerRequired() throws Exception {
        authenticateAs(adminId);

        mockMvc.perform(put("/api/groups/" + publicGroupId + "/members/" + memberId + "/role")
                        .with(csrf())
                        .param("newRoleName", "group_admin"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_OWNER_REQUIRED"));
    }

    // ---- 409 conflicts ---------------------------------------------------------------------

    @Test
    void updateGroupGeneralData_withANameAnotherGroupHolds_is409NameTaken() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(put("/api/groups/" + publicGroupId + "/generalData")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(UpdateGroupGeneralDataRequest.builder()
                                .groupName("A11 Private Group").build())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("GROUP_NAME_TAKEN"))
                .andExpect(jsonPath("$.message").value("Group name already exists"));
    }

    @Test
    void createJoinRequest_whenAlreadyAMember_is409AlreadyMember() throws Exception {
        authenticateAs(memberId);

        mockMvc.perform(post("/api/groups/join-requests")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(CreateJoinRequestRequest.builder().groupName("A11 Public Group").build())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("GROUP_ALREADY_MEMBER"));
    }

    // ---- coded 400s that stayed 400 --------------------------------------------------------

    @Test
    void createGroup_withoutASportProfile_is400SportProfileRequired() throws Exception {
        authenticateAs(outsiderId);

        mockMvc.perform(post("/api/groups")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(CreateGroupRequest.builder()
                                .sportId(sportId).groupName("A11 New Group").isPrivate(false).build())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("GROUP_SPORT_PROFILE_REQUIRED"));
    }

    @Test
    void leaveGroup_asOwner_is400OwnerCannotLeave() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(delete("/api/groups/" + publicGroupId + "/leave").with(csrf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("GROUP_OWNER_CANNOT_LEAVE"));
    }

    @Test
    void removeMember_targetingTheOwner_is400OwnerCannotBeRemoved() throws Exception {
        authenticateAs(adminId);

        mockMvc.perform(delete("/api/groups/" + publicGroupId + "/members/" + ownerId).with(csrf()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("GROUP_OWNER_CANNOT_BE_REMOVED"));
    }

    @Test
    void updateMemberRole_assigningTheOwnerRole_is400OwnerRoleProtected() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(put("/api/groups/" + publicGroupId + "/members/" + memberId + "/role")
                        .with(csrf())
                        .param("newRoleName", "group_owner"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("GROUP_OWNER_ROLE_PROTECTED"));
    }

    // ---- fixtures for the join-request / invitation / pin cases ----------------------------

    private Long seedJoinRequest(Long groupId, UUID userId, String status) {
        return joinRequestRepository.save(GroupJoinRequest.builder()
                .groupId(groupId).userId(userId).status(status).build()).getId();
    }

    private Long seedInvitation(Long groupId, UUID inviterId, UUID inviteeId, String status) {
        return invitationRepository.save(GroupInvitation.builder()
                .groupId(groupId).inviterId(inviterId).inviteeId(inviteeId).status(status).build()).getId();
    }

    /** {@code allowMemberInvites} defaults to false and gates every inviter, owner included. */
    private void enableMemberInvites(Long groupId) {
        GroupSettings settings = groupSettingsRepository.findByGroupId(groupId).orElseThrow();
        settings.setAllowMemberInvites(true);
        groupSettingsRepository.save(settings);
    }

    private Long seedPost(PostType type, Long groupId) {
        return postRepository.save(Post.builder()
                .userId(ownerId).groupId(groupId).postType(type).content("content")
                .visibility("public").isActive(true).build()).getId();
    }

    private void seedPin(Long groupId, Long postId) {
        pinnedPostRepository.save(GroupPinnedPost.builder()
                .groupId(groupId).postId(postId).pinnedBy(ownerId).build());
    }

    // ---- getGroup success control (needs group_pinned_posts) --------------------------------

    @Test
    void getGroup_privateGroupAsMember_is200() throws Exception {
        authenticateAs(memberId);

        mockMvc.perform(get("/api/groups/" + privateGroupId))
                .andExpect(status().isOk());
    }

    // ---- join requests ---------------------------------------------------------------------

    @Test
    void createJoinRequest_whenOneIsAlreadyPending_is409JoinRequestAlreadyPending() throws Exception {
        seedJoinRequest(publicGroupId, outsiderId, "pending");
        authenticateAs(outsiderId);

        mockMvc.perform(post("/api/groups/join-requests")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(CreateJoinRequestRequest.builder().groupName("A11 Public Group").build())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("GROUP_JOIN_REQUEST_ALREADY_PENDING"));
    }

    @Test
    void createJoinRequest_whenTheGroupIsFull_is400CapacityReachedWithMax() throws Exception {
        jdbcTemplate.update("MERGE INTO group_types (id, type_name, max_members) KEY(id) VALUES (?, 'A11_TINY', 3)",
                TINY_GROUP_TYPE_ID);
        GroupSettings settings = groupSettingsRepository.findByGroupId(publicGroupId).orElseThrow();
        settings.setGroupTypeId(TINY_GROUP_TYPE_ID);
        groupSettingsRepository.save(settings);
        authenticateAs(outsiderId);

        mockMvc.perform(post("/api/groups/join-requests")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(CreateJoinRequestRequest.builder().groupName("A11 Public Group").build())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("GROUP_MEMBER_CAPACITY_REACHED"))
                .andExpect(jsonPath("$.errorParams.max").value(3));
    }

    @Test
    void acceptJoinRequest_asPlainMember_is403AdminRequired() throws Exception {
        Long requestId = seedJoinRequest(publicGroupId, outsiderId, "pending");
        authenticateAs(memberId);

        mockMvc.perform(put("/api/groups/join-requests/" + requestId + "/accept").with(csrf()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_ADMIN_REQUIRED"));
    }

    @Test
    void acceptJoinRequest_whenItIsNoLongerPending_is409JoinRequestNotPending() throws Exception {
        Long requestId = seedJoinRequest(publicGroupId, outsiderId, "declined");
        authenticateAs(ownerId);

        mockMvc.perform(put("/api/groups/join-requests/" + requestId + "/accept").with(csrf()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("GROUP_JOIN_REQUEST_NOT_PENDING"));
    }

    @Test
    void acceptJoinRequest_whenItDoesNotExist_is404JoinRequestNotFound() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(put("/api/groups/join-requests/999999/accept").with(csrf()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("GROUP_JOIN_REQUEST_NOT_FOUND"));
    }

    @Test
    void getGroupJoinRequests_asPlainMember_is403AdminRequired() throws Exception {
        authenticateAs(memberId);

        mockMvc.perform(get("/api/groups/" + publicGroupId + "/join-requests"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_ADMIN_REQUIRED"));
    }

    @Test
    void cancelJoinRequest_ofSomeoneElse_is403RequesterOnly() throws Exception {
        Long requestId = seedJoinRequest(publicGroupId, outsiderId, "pending");
        authenticateAs(memberId);

        mockMvc.perform(delete("/api/groups/join-requests/" + requestId).with(csrf()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_REQUESTER_ONLY"));
    }

    @Test
    void cancelJoinRequest_whenTheGroupWasDeleted_is404GroupNotFound() throws Exception {
        Long requestId = seedJoinRequest(publicGroupId, outsiderId, "pending");
        Group group = groupRepository.findById(publicGroupId).orElseThrow();
        group.setIsActive(false);
        groupRepository.save(group);
        authenticateAs(outsiderId);

        mockMvc.perform(delete("/api/groups/join-requests/" + requestId).with(csrf()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("GROUP_NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("Group no longer exists"));
    }

    // ---- invitations -----------------------------------------------------------------------

    @Test
    void createInvitation_asNonMember_is403MemberRequired() throws Exception {
        authenticateAs(outsiderId);

        mockMvc.perform(post("/api/groups/" + publicGroupId + "/invitations")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(CreateInvitationRequest.builder().inviteeId(UUID.randomUUID()).build())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_MEMBER_REQUIRED"));
    }

    @Test
    void createInvitation_whenMemberInvitesAreDisabled_is403MemberInvitesDisabled() throws Exception {
        authenticateAs(memberId);

        mockMvc.perform(post("/api/groups/" + publicGroupId + "/invitations")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(CreateInvitationRequest.builder().inviteeId(outsiderId).build())))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_MEMBER_INVITES_DISABLED"));
    }

    @Test
    void createInvitation_ofAnExistingMember_is409AlreadyMember() throws Exception {
        enableMemberInvites(publicGroupId);
        authenticateAs(ownerId);

        mockMvc.perform(post("/api/groups/" + publicGroupId + "/invitations")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(CreateInvitationRequest.builder().inviteeId(memberId).build())))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("GROUP_ALREADY_MEMBER"));
    }

    @Test
    void createInvitation_ofANonFriend_is400NotFriends() throws Exception {
        enableMemberInvites(publicGroupId);
        authenticateAs(ownerId);

        mockMvc.perform(post("/api/groups/" + publicGroupId + "/invitations")
                        .with(csrf())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(toJson(CreateInvitationRequest.builder().inviteeId(outsiderId).build())))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("GROUP_NOT_FRIENDS"));
    }

    @Test
    void approveInvitation_asPlainMember_is403AdminRequired() throws Exception {
        Long invitationId = seedInvitation(publicGroupId, memberId, outsiderId, "pending_owner");
        authenticateAs(memberId);

        mockMvc.perform(put("/api/groups/invitations/" + invitationId + "/approve").with(csrf()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_ADMIN_REQUIRED"));
    }

    @Test
    void approveInvitation_whenItDoesNotExist_is404InvitationNotFound() throws Exception {
        authenticateAs(ownerId);

        mockMvc.perform(put("/api/groups/invitations/999999/approve").with(csrf()))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("GROUP_INVITATION_NOT_FOUND"));
    }

    @Test
    void approveInvitation_whenNotPendingOwnerApproval_is409InvitationNotPending() throws Exception {
        Long invitationId = seedInvitation(publicGroupId, memberId, outsiderId, "pending_user");
        authenticateAs(ownerId);

        mockMvc.perform(put("/api/groups/invitations/" + invitationId + "/approve").with(csrf()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("GROUP_INVITATION_NOT_PENDING"));
    }

    @Test
    void acceptInvitation_byAnotherUser_is403InviteeOnly() throws Exception {
        Long invitationId = seedInvitation(publicGroupId, ownerId, outsiderId, "pending_user");
        authenticateAs(memberId);

        mockMvc.perform(put("/api/groups/invitations/" + invitationId + "/accept").with(csrf()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_INVITEE_ONLY"));
    }

    @Test
    void acceptInvitation_whenNotPendingTheInviteesResponse_is409InvitationNotPending() throws Exception {
        Long invitationId = seedInvitation(publicGroupId, ownerId, outsiderId, "pending_owner");
        authenticateAs(outsiderId);

        mockMvc.perform(put("/api/groups/invitations/" + invitationId + "/accept").with(csrf()))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("GROUP_INVITATION_NOT_PENDING"));
    }

    @Test
    void cancelInvitation_ofSomeoneElses_is403InviterOnly() throws Exception {
        Long invitationId = seedInvitation(publicGroupId, memberId, outsiderId, "pending_owner");
        authenticateAs(adminId);

        mockMvc.perform(delete("/api/groups/invitations/" + invitationId).with(csrf()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_INVITER_ONLY"));
    }

    @Test
    void getGroupInvitations_asPlainMember_is403AdminRequired() throws Exception {
        authenticateAs(memberId);

        mockMvc.perform(get("/api/groups/" + publicGroupId + "/invitations"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_ADMIN_REQUIRED"));
    }

    // ---- pinned posts ----------------------------------------------------------------------

    private ResultActions pin(Long groupId, Long postId) throws Exception {
        return mockMvc.perform(post("/api/groups/" + groupId + "/pins")
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content(toJson(PinPostRequest.builder().postId(postId).build())));
    }

    @Test
    void pinPost_asPlainMember_is403AdminRequired() throws Exception {
        Long postId = seedPost(PostType.GROUP_POST, publicGroupId);
        authenticateAs(memberId);

        pin(publicGroupId, postId)
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_ADMIN_REQUIRED"));
    }

    @Test
    void pinPost_inAGroupThatDoesNotExist_is404GroupNotFound() throws Exception {
        authenticateAs(ownerId);

        pin(999999L, 1L)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("GROUP_NOT_FOUND"));
    }

    @Test
    void pinPost_whenAlreadyPinned_is409PostAlreadyPinned() throws Exception {
        Long postId = seedPost(PostType.GROUP_POST, publicGroupId);
        seedPin(publicGroupId, postId);
        authenticateAs(ownerId);

        pin(publicGroupId, postId)
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("GROUP_POST_ALREADY_PINNED"));
    }

    @Test
    void pinPost_whenTenArePinned_is400PinLimitReachedWithMax() throws Exception {
        for (long i = 1; i <= 10; i++) {
            seedPin(publicGroupId, 1000L + i);
        }
        Long postId = seedPost(PostType.GROUP_POST, publicGroupId);
        authenticateAs(ownerId);

        pin(publicGroupId, postId)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("GROUP_PIN_LIMIT_REACHED"))
                .andExpect(jsonPath("$.errorParams.max").value(10));
    }

    @Test
    void pinPost_fromAnotherGroup_is400PostNotPinnable() throws Exception {
        Long postId = seedPost(PostType.GROUP_POST, privateGroupId);
        authenticateAs(ownerId);

        pin(publicGroupId, postId)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("GROUP_POST_NOT_PINNABLE"));
    }

    @Test
    void pinPost_thatIsNotAGroupPost_is400PostNotPinnable() throws Exception {
        Long postId = seedPost(PostType.USER_FEED, publicGroupId);
        authenticateAs(ownerId);

        pin(publicGroupId, postId)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("GROUP_POST_NOT_PINNABLE"));
    }

    @Test
    void unpinPost_asPlainMember_is403AdminRequired() throws Exception {
        authenticateAs(memberId);

        mockMvc.perform(delete("/api/groups/" + publicGroupId + "/pins/1").with(csrf()))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_ADMIN_REQUIRED"));
    }

    @Test
    void getPinnedPosts_asNonMember_is403MemberRequired() throws Exception {
        authenticateAs(outsiderId);

        mockMvc.perform(get("/api/groups/" + publicGroupId + "/pins"))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.errorCode").value("GROUP_MEMBER_REQUIRED"));
    }
}
