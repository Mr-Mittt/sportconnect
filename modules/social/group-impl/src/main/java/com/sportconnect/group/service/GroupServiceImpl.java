package com.sportconnect.group.service;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.NotFoundException;
import com.sportconnect.group.api.dto.CreateGroupRequest;
import com.sportconnect.group.api.dto.CreateInvitationRequest;
import com.sportconnect.group.api.dto.CreateJoinRequestRequest;
import com.sportconnect.group.api.dto.GroupInfoResponse;
import com.sportconnect.group.api.dto.GroupInvitationResponse;
import com.sportconnect.group.api.dto.GroupMemberResponse;
import com.sportconnect.group.api.dto.GroupResponse;
import com.sportconnect.group.api.dto.GroupSearchResponse;
import com.sportconnect.group.api.dto.GroupSettingsResponse;
import com.sportconnect.group.api.dto.JoinRequestResponse;
import com.sportconnect.group.api.dto.PinnedPostResponse;
import com.sportconnect.group.api.dto.UpdateGroupRequest;
import com.sportconnect.group.api.dto.UpdateGroupSettingsRequest;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.group.entity.Group;
import com.sportconnect.group.entity.GroupInvitation;
import com.sportconnect.group.entity.GroupJoinRequest;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.entity.GroupPinnedPost;
import com.sportconnect.group.entity.GroupRole;
import com.sportconnect.group.entity.GroupSettings;
import com.sportconnect.group.repository.GroupInvitationRepository;
import com.sportconnect.group.repository.GroupJoinRequestRepository;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupPinnedPostRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.group.repository.GroupRoleRepository;
import com.sportconnect.group.repository.GroupSettingsRepository;
import com.sportconnect.social.post.api.dto.PostResponse;
import com.sportconnect.social.post.api.dto.PostType;
import com.sportconnect.social.post.api.service.PostService;
import com.sportconnect.sport.api.dto.UserSportProfileResponse;
import com.sportconnect.sport.api.service.UserSportProfileService;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.service.UserFriendService;
import com.sportconnect.user.api.service.UserService;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.annotation.Lazy;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
public class GroupServiceImpl implements GroupService {

    private final GroupRepository groupRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final GroupJoinRequestRepository joinRequestRepository;
    private final GroupSettingsRepository groupSettingsRepository;
    private final GroupRoleRepository groupRoleRepository;
    private final UserService userService;
    private final UserFriendService userFriendService;
    private final UserSportProfileService userSportProfileService;
    private final PostService postService;
    private final GroupPinnedPostRepository pinnedPostRepository;
    private final GroupInvitationRepository invitationRepository;

    /**
     * Explicit constructor (not {@code @RequiredArgsConstructor}) because {@code postService}
     * must be {@code @Lazy}: PostServiceImpl depends on GroupService too (membership/permission
     * checks), so eager construction of both beans forms a cycle Spring refuses to start with by
     * default. postService is only used here for a handful of pinned-post lookups — a lazy proxy
     * defers resolving the real PostServiceImpl bean until one of those calls actually happens,
     * which is well after both beans exist. Relying on Lombok to copy @Lazy onto a generated
     * constructor parameter is not guaranteed without a lombok.config entry, so this is spelled
     * out by hand instead.
     */
    public GroupServiceImpl(
            GroupRepository groupRepository,
            GroupMemberRepository groupMemberRepository,
            GroupJoinRequestRepository joinRequestRepository,
            GroupSettingsRepository groupSettingsRepository,
            GroupRoleRepository groupRoleRepository,
            UserService userService,
            UserFriendService userFriendService,
            UserSportProfileService userSportProfileService,
            @Lazy PostService postService,
            GroupPinnedPostRepository pinnedPostRepository,
            GroupInvitationRepository invitationRepository) {
        this.groupRepository = groupRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.joinRequestRepository = joinRequestRepository;
        this.groupSettingsRepository = groupSettingsRepository;
        this.groupRoleRepository = groupRoleRepository;
        this.userService = userService;
        this.userFriendService = userFriendService;
        this.userSportProfileService = userSportProfileService;
        this.postService = postService;
        this.pinnedPostRepository = pinnedPostRepository;
        this.invitationRepository = invitationRepository;
    }

    @Override
    @Transactional
    public GroupResponse createGroup(UUID userId, CreateGroupRequest request) {
        // Validate group name uniqueness
        if (groupRepository.existsByGroupName(request.getGroupName())) {
            throw new BadRequestException("Group name already exists");
        }

        // Validate creator has a sport profile for the requested sport
        if (!userSportProfileService.hasProfileForSport(userId, request.getSportId())) {
            throw new BadRequestException("You must have a sport profile for this sport to create a group");
        }

        // Create group
        Group group = Group.builder()
                .sportId(request.getSportId())
                .groupName(request.getGroupName())
                .description(request.getDescription())
                .avatarUrl(request.getAvatarUrl())
                .coverUrl(request.getCoverUrl())
                .isPrivate(request.getIsPrivate() != null ? request.getIsPrivate() : false)
                .isActive(true)
                .createdBy(userId)
                .build();

        group = groupRepository.save(group);
        log.info("Created group {} by user {}", group.getId(), userId);

        // Get group_owner role
        GroupRole ownerRole = groupRoleRepository.findByRoleName("group_owner")
                .orElseThrow(() -> new NotFoundException("Group owner role not found"));

        // Create owner membership
        GroupMember ownerMember = GroupMember.builder()
                .groupId(group.getId())
                .userId(userId)
                .roleId(ownerRole.getId())
                .build();
        groupMemberRepository.save(ownerMember);

        // Create default settings
        GroupSettings settings = GroupSettings.builder()
                .groupId(group.getId())
                .allowMemberPosts(true)
                .requirePostApproval(false)
                .allowMemberInvites(false)
                .build();
        groupSettingsRepository.save(settings);

        log.info("Created owner membership and default settings for group {}", group.getId());

        return mapToGroupResponse(group, userId);
    }

    @Override
    @Transactional(readOnly = true)
    public GroupResponse getGroup(Long groupId, UUID currentUserId) {
        Group group = groupRepository.findByIdAndIsActiveTrue(groupId)
                .orElseThrow(() -> new NotFoundException("Group not found"));

        GroupResponse response = mapToGroupResponse(group, currentUserId);

        List<GroupPinnedPost> topPins = pinnedPostRepository.findTop3ByGroupIdOrderByPinnedAtDesc(groupId);
        Map<Long, PostResponse> postsByPinnedPostId = postService.getPostsByIds(
                topPins.stream().map(GroupPinnedPost::getPostId).collect(Collectors.toList()),
                currentUserId);
        List<PostResponse> pinnedPosts = topPins.stream()
                .map(pin -> postsByPinnedPostId.get(pin.getPostId()))
                .filter(java.util.Objects::nonNull)
                .collect(Collectors.toList());

        response.setPinnedPosts(pinnedPosts);
        return response;
    }

    /**
     * {@inheritDoc}
     *
     * <p>Flow: fetches the membership page (already filtered to active groups at the query
     * level, via {@code findByUserIdAndGroupIsActiveTrue}), then does exactly 3 more flat batched
     * lookups regardless of page size — group + member-count ({@code findGroupsWithMemberCounts},
     * a same-domain JOIN), creator names (cross-domain {@code UserService.getUsersByIds}), and
     * role names ({@code groupRoleRepository.findAllById}, using role ids already present on the
     * page's {@code GroupMember} rows — no extra per-user membership lookup needed). This
     * replaced a prior per-page-item N+1 (5 queries per item) — see A8 in
     * {@code BACKLOG_MVP.md}.
     */
    @Override
    @Transactional(readOnly = true)
    public Page<GroupResponse> getUserGroups(UUID userId, Pageable pageable) {
        Page<GroupMember> memberships = groupMemberRepository.findByUserIdAndGroupIsActiveTrue(userId, pageable);

        List<Long> groupIds = memberships.getContent().stream()
                .map(GroupMember::getGroupId)
                .distinct()
                .collect(Collectors.toList());
        List<Object[]> groupRows = groupIds.isEmpty()
                ? List.of()
                : groupRepository.findGroupsWithMemberCounts(groupIds);
        Map<Long, Group> groupsById = groupRows.stream()
                .collect(Collectors.toMap(row -> ((Group) row[0]).getId(), row -> (Group) row[0]));
        Map<Long, Long> memberCountsById = groupRows.stream()
                .collect(Collectors.toMap(row -> ((Group) row[0]).getId(), row -> ((Number) row[1]).longValue()));

        List<UUID> creatorIds = groupsById.values().stream()
                .map(Group::getCreatedBy)
                .distinct()
                .collect(Collectors.toList());
        Map<UUID, UserResponse> creatorsById = creatorIds.isEmpty() ? Map.of() : userService.getUsersByIds(creatorIds);

        List<Integer> roleIds = memberships.getContent().stream()
                .map(GroupMember::getRoleId)
                .distinct()
                .collect(Collectors.toList());
        Map<Integer, GroupRole> rolesById = roleIds.isEmpty()
                ? Map.of()
                : groupRoleRepository.findAllById(roleIds).stream()
                        .collect(Collectors.toMap(GroupRole::getId, r -> r));

        return memberships.map(membership -> {
            Group group = groupsById.get(membership.getGroupId());
            return mapToGroupResponse(group, creatorsById, memberCountsById, rolesById, membership.getRoleId());
        });
    }

    @Override
    @Transactional(readOnly = true)
    public Page<GroupSearchResponse> getPublicGroups(UUID currentUserId, Long sportId, String keyword, Pageable pageable) {
        Page<Object[]> rawPage = currentUserId != null
                ? groupRepository.searchPublicGroupsWithCounts(currentUserId, sportId, keyword, pageable)
                : groupRepository.searchPublicGroupsAnon(sportId, keyword, pageable);

        if (rawPage.isEmpty()) {
            return org.springframework.data.domain.Page.empty(pageable);
        }

        Set<UUID> creatorIds = rawPage.getContent().stream()
                .map(row -> ((Group) row[0]).getCreatedBy())
                .collect(Collectors.toSet());
        Map<UUID, String> creatorNames = userService.getUsersByIds(new ArrayList<>(creatorIds)).values().stream()
                .collect(Collectors.toMap(UserResponse::getId, UserResponse::getFullName));

        List<GroupSearchResponse> sorted = rawPage.getContent().stream()
                .map(row -> {
                    Group g = (Group) row[0];
                    int memberCount = ((Number) row[1]).intValue();
                    boolean isMember = currentUserId != null && ((Number) row[2]).longValue() > 0;
                    return GroupSearchResponse.builder()
                            .id(g.getId())
                            .sportId(g.getSportId())
                            .groupName(g.getGroupName())
                            .description(g.getDescription())
                            .avatarUrl(g.getAvatarUrl())
                            .memberCount(memberCount)
                            .createdByFullName(creatorNames.getOrDefault(g.getCreatedBy(), "Unknown User"))
                            .isMember(isMember)
                            .build();
                })
                .sorted(Comparator
                        .<GroupSearchResponse, Boolean>comparing(r -> !r.getIsMember())
                        .thenComparing(r -> r.getIsMember() ? r.getGroupName() : "")
                        .thenComparing(Comparator.comparingInt(GroupSearchResponse::getMemberCount).reversed()))
                .collect(Collectors.toList());

        return new org.springframework.data.domain.PageImpl<>(sorted, pageable, rawPage.getTotalElements());
    }

    @Override
    @Transactional
    public GroupResponse updateGroup(Long groupId, UUID userId, UpdateGroupRequest request) {
        Group group = groupRepository.findByIdAndIsActiveTrue(groupId)
                .orElseThrow(() -> new NotFoundException("Group not found"));

        // Check permission (owner or admin)
        if (!canManageMembers(groupId, userId)) {
            throw new BadRequestException("Only group owner or admin can update group");
        }

        // Update fields if provided
        if (request.getGroupName() != null && !request.getGroupName().equals(group.getGroupName())) {
            if (groupRepository.existsByGroupName(request.getGroupName())) {
                throw new BadRequestException("Group name already exists");
            }
            group.setGroupName(request.getGroupName());
        }

        if (request.getDescription() != null) {
            group.setDescription(request.getDescription());
        }

        if (request.getAvatarUrl() != null) {
            group.setAvatarUrl(request.getAvatarUrl());
        }

        if (request.getCoverUrl() != null) {
            group.setCoverUrl(request.getCoverUrl());
        }

        if (request.getIsPrivate() != null) {
            group.setIsPrivate(request.getIsPrivate());
        }

        if (request.getRules() != null) {
            group.setRules(request.getRules());
        }

        if (request.getSchedule() != null) {
            group.setSchedule(request.getSchedule());
        }

        group = groupRepository.save(group);
        log.info("Updated group {} by user {}", groupId, userId);

        return mapToGroupResponse(group, userId);
    }

    @Override
    @Transactional
    public void deleteGroup(Long groupId, UUID userId) {
        Group group = groupRepository.findByIdAndIsActiveTrue(groupId)
                .orElseThrow(() -> new NotFoundException("Group not found"));

        // Only owner can delete
        if (!isGroupOwner(groupId, userId)) {
            throw new BadRequestException("Only group owner can delete group");
        }

        group.setIsActive(false);
        groupRepository.save(group);
        log.info("Deleted group {} by user {}", groupId, userId);
    }

    @Override
    @Transactional
    public void addMember(Long groupId, UUID adminUserId, UUID targetUserId, String roleName) {
        // Verify group exists
        if (!groupRepository.existsById(groupId)) {
            throw new NotFoundException("Group not found");
        }

        // Check permission
        if (!canManageMembers(groupId, adminUserId)) {
            throw new BadRequestException("Only group owner or admin can add members");
        }

        // Check if already member
        if (groupMemberRepository.existsByGroupIdAndUserId(groupId, targetUserId)) {
            throw new BadRequestException("User is already a member");
        }

        // Get role
        GroupRole role = groupRoleRepository.findByRoleName(roleName)
                .orElseThrow(() -> new NotFoundException("Role not found"));

        // Create membership
        GroupMember member = GroupMember.builder()
                .groupId(groupId)
                .userId(targetUserId)
                .roleId(role.getId())
                .build();
        groupMemberRepository.save(member);

        log.info("Added user {} to group {} with role {} by admin {}", targetUserId, groupId, roleName, adminUserId);
    }

    @Override
    @Transactional
    public void removeMember(Long groupId, UUID adminUserId, UUID targetUserId) {
        // Verify group exists
        if (!groupRepository.existsById(groupId)) {
            throw new NotFoundException("Group not found");
        }

        // Check permission
        if (!canManageMembers(groupId, adminUserId)) {
            throw new BadRequestException("Only group owner or admin can remove members");
        }

        // Cannot remove owner
        if (isGroupOwner(groupId, targetUserId)) {
            throw new BadRequestException("Cannot remove group owner");
        }

        // Remove membership
        groupMemberRepository.deleteByGroupIdAndUserId(groupId, targetUserId);
        log.info("Removed user {} from group {} by admin {}", targetUserId, groupId, adminUserId);
    }

    @Override
    @Transactional
    public void updateMemberRole(Long groupId, UUID adminUserId, UUID targetUserId, String newRoleName) {
        // Verify group exists
        if (!groupRepository.existsById(groupId)) {
            throw new NotFoundException("Group not found");
        }

        // Only owner can change roles
        if (!isGroupOwner(groupId, adminUserId)) {
            throw new BadRequestException("Only group owner can change member roles");
        }

        // Cannot change owner's role
        if (isGroupOwner(groupId, targetUserId)) {
            throw new BadRequestException("Cannot change owner's role. Transfer ownership instead.");
        }

        // Get membership
        GroupMember member = groupMemberRepository.findByGroupIdAndUserId(groupId, targetUserId)
                .orElseThrow(() -> new NotFoundException("Member not found"));

        // Get new role
        GroupRole newRole = groupRoleRepository.findByRoleName(newRoleName)
                .orElseThrow(() -> new NotFoundException("Role not found"));

        // Cannot assign owner role
        if ("group_owner".equals(newRoleName)) {
            throw new BadRequestException("Cannot assign owner role. Use transfer ownership instead.");
        }

        member.setRoleId(newRole.getId());
        groupMemberRepository.save(member);

        log.info("Updated user {} role to {} in group {} by owner {}", targetUserId, newRoleName, groupId, adminUserId);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<GroupMemberResponse> getGroupMembers(Long groupId, UUID currentUserId, Pageable pageable) {
        // Verify group exists
        if (!groupRepository.existsById(groupId)) {
            throw new NotFoundException("Group not found");
        }

        Page<GroupMember> membersPage = groupMemberRepository.findByGroupId(groupId, pageable);

        List<UUID> userIds = membersPage.getContent().stream()
                .map(GroupMember::getUserId)
                .distinct()
                .collect(Collectors.toList());
        Map<UUID, UserResponse> usersById = userIds.isEmpty() ? Map.of() : userService.getUsersByIds(userIds);

        List<Integer> roleIds = membersPage.getContent().stream()
                .map(GroupMember::getRoleId)
                .distinct()
                .collect(Collectors.toList());
        Map<Integer, GroupRole> rolesById = roleIds.isEmpty()
                ? Map.of()
                : groupRoleRepository.findAllById(roleIds).stream()
                        .collect(Collectors.toMap(GroupRole::getId, r -> r));

        return membersPage.map(member -> mapToGroupMemberResponse(member, usersById, rolesById));
    }

    @Override
    @Transactional
    public void transferOwnership(Long groupId, UUID currentOwnerId, UUID newOwnerId) {
        // Verify group exists
        if (!groupRepository.existsById(groupId)) {
            throw new NotFoundException("Group not found");
        }

        // Verify current owner
        if (!isGroupOwner(groupId, currentOwnerId)) {
            throw new BadRequestException("Only current owner can transfer ownership");
        }

        // Verify new owner is a member
        GroupMember newOwnerMember = groupMemberRepository.findByGroupIdAndUserId(groupId, newOwnerId)
                .orElseThrow(() -> new NotFoundException("New owner must be a group member"));

        // Get current owner membership
        GroupMember currentOwnerMember = groupMemberRepository.findByGroupIdAndUserId(groupId, currentOwnerId)
                .orElseThrow(() -> new NotFoundException("Current owner membership not found"));

        // Get roles
        GroupRole ownerRole = groupRoleRepository.findByRoleName("group_owner")
                .orElseThrow(() -> new NotFoundException("Owner role not found"));
        GroupRole adminRole = groupRoleRepository.findByRoleName("group_admin")
                .orElseThrow(() -> new NotFoundException("Admin role not found"));

        // Transfer ownership
        newOwnerMember.setRoleId(ownerRole.getId());
        currentOwnerMember.setRoleId(adminRole.getId());

        groupMemberRepository.save(newOwnerMember);
        groupMemberRepository.save(currentOwnerMember);

        log.info("Transferred ownership of group {} from {} to {}", groupId, currentOwnerId, newOwnerId);
    }

    @Override
    @Transactional
    public void leaveMember(Long groupId, UUID userId) {
        // Verify group exists
        if (!groupRepository.existsById(groupId)) {
            throw new NotFoundException("Group not found");
        }

        // Owner cannot leave, must transfer ownership first
        if (isGroupOwner(groupId, userId)) {
            throw new BadRequestException("Owner cannot leave group. Transfer ownership first.");
        }

        // Remove membership
        groupMemberRepository.deleteByGroupIdAndUserId(groupId, userId);
        log.info("User {} left group {}", userId, groupId);
    }

    @Override
    @Transactional
    public JoinRequestResponse createJoinRequest(UUID userId, CreateJoinRequestRequest request) {
        // Find group by name
        Group group = groupRepository.findByGroupName(request.getGroupName())
                .orElseThrow(() -> new NotFoundException("Group not found"));

        // Check if already a member
        if (groupMemberRepository.existsByGroupIdAndUserId(group.getId(), userId)) {
            throw new BadRequestException("You are already a member of this group");
        }

        // Check if pending request exists
        if (joinRequestRepository.existsByGroupIdAndUserIdAndStatus(group.getId(), userId, "pending")) {
            throw new BadRequestException("You already have a pending request for this group");
        }

        // Create join request
        GroupJoinRequest joinRequest = GroupJoinRequest.builder()
                .groupId(group.getId())
                .userId(userId)
                .status("pending")
                .message(request.getMessage())
                .build();

        joinRequest = joinRequestRepository.save(joinRequest);
        log.info("Created join request {} for group {} by user {}", joinRequest.getId(), group.getId(), userId);

        Group requestGroup = groupRepository.findById(joinRequest.getGroupId()).orElse(null);
        Map<Long, Group> groupsById = requestGroup != null
                ? Map.of(requestGroup.getId(), requestGroup)
                : Map.of();
        Map<UUID, UserResponse> usersById = userService.getUsersByIds(List.of(userId));
        return mapToJoinRequestResponse(joinRequest, groupsById, usersById);
    }

    @Override
    @Transactional
    public void acceptJoinRequest(Long requestId, UUID adminUserId) {
        GroupJoinRequest request = joinRequestRepository.findById(requestId)
                .orElseThrow(() -> new NotFoundException("Join request not found"));

        // Check permission
        if (!canManageMembers(request.getGroupId(), adminUserId)) {
            throw new BadRequestException("Only group owner or admin can accept join requests");
        }

        // Check if already accepted
        if (!"pending".equals(request.getStatus())) {
            throw new BadRequestException("Request is not pending");
        }

        // Get member role
        GroupRole memberRole = groupRoleRepository.findByRoleName("group_member")
                .orElseThrow(() -> new NotFoundException("Member role not found"));

        // Create membership
        GroupMember member = GroupMember.builder()
                .groupId(request.getGroupId())
                .userId(request.getUserId())
                .roleId(memberRole.getId())
                .build();
        groupMemberRepository.save(member);

        // Update request
        request.setStatus("accepted");
        request.setReviewedBy(adminUserId);
        request.setReviewedAt(LocalDateTime.now());
        joinRequestRepository.save(request);

        log.info("Accepted join request {} by admin {}", requestId, adminUserId);
    }

    @Override
    @Transactional
    public void declineJoinRequest(Long requestId, UUID adminUserId) {
        GroupJoinRequest request = joinRequestRepository.findById(requestId)
                .orElseThrow(() -> new NotFoundException("Join request not found"));

        // Check permission
        if (!canManageMembers(request.getGroupId(), adminUserId)) {
            throw new BadRequestException("Only group owner or admin can decline join requests");
        }

        // Check if already processed
        if (!"pending".equals(request.getStatus())) {
            throw new BadRequestException("Request is not pending");
        }

        // Update request
        request.setStatus("declined");
        request.setReviewedBy(adminUserId);
        request.setReviewedAt(LocalDateTime.now());
        joinRequestRepository.save(request);

        log.info("Declined join request {} by admin {}", requestId, adminUserId);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<JoinRequestResponse> getGroupJoinRequests(Long groupId, UUID adminUserId, Pageable pageable) {
        // Verify group exists
        if (!groupRepository.existsById(groupId)) {
            throw new NotFoundException("Group not found");
        }

        // Check permission
        if (!canManageMembers(groupId, adminUserId)) {
            throw new BadRequestException("Only group owner or admin can view join requests");
        }

        Page<GroupJoinRequest> requestsPage = joinRequestRepository.findPendingRequestsByGroupId(groupId, pageable);
        return mapJoinRequestsPage(requestsPage);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<JoinRequestResponse> getUserJoinRequests(UUID userId, Pageable pageable) {
        Page<GroupJoinRequest> requestsPage = joinRequestRepository.findByUserIdAndStatus(userId, "pending", pageable);
        return mapJoinRequestsPage(requestsPage);
    }

    @Override
    @Transactional
    public void cancelJoinRequest(Long requestId, UUID callerId) {
        GroupJoinRequest joinRequest = joinRequestRepository.findById(requestId)
                .orElseThrow(() -> new NotFoundException("Join request not found"));

        if (!joinRequest.getUserId().equals(callerId)) {
            throw new BadRequestException("You can only cancel your own request");
        }

        Group group = groupRepository.findById(joinRequest.getGroupId())
                .orElseThrow(() -> new NotFoundException("Group not found"));
        if (!Boolean.TRUE.equals(group.getIsActive())) {
            throw new BadRequestException("Group no longer exists");
        }

        if (!"pending".equals(joinRequest.getStatus())) {
            throw new BadRequestException("Request is not pending");
        }

        joinRequestRepository.deleteById(requestId);
        log.info("Cancelled join request {} by user {}", requestId, callerId);
    }

    @Override
    @Transactional(readOnly = true)
    public GroupInfoResponse getGroupInfo(Long groupId) {
        Group group = groupRepository.findByIdAndIsActiveTrue(groupId)
                .orElseThrow(() -> new NotFoundException("Group not found"));

        return GroupInfoResponse.builder()
                .groupId(group.getId())
                .groupName(group.getGroupName())
                .rules(group.getRules())
                .schedule(group.getSchedule())
                .updatedAt(group.getUpdatedAt())
                .build();
    }

    @Override
    @Transactional(readOnly = true)
    public GroupSettingsResponse getGroupSettings(Long groupId, UUID userId) {
        // Verify group exists
        if (!groupRepository.existsById(groupId)) {
            throw new NotFoundException("Group not found");
        }

        // Check if user is member
        if (!isGroupMember(groupId, userId)) {
            throw new BadRequestException("Only group members can view settings");
        }

        GroupSettings settings = groupSettingsRepository.findByGroupId(groupId)
                .orElseThrow(() -> new NotFoundException("Group settings not found"));

        return mapToGroupSettingsResponse(settings);
    }

    @Override
    @Transactional
    public GroupSettingsResponse updateGroupSettings(Long groupId, UUID userId, UpdateGroupSettingsRequest request) {
        // Verify group exists
        if (!groupRepository.existsById(groupId)) {
            throw new NotFoundException("Group not found");
        }

        // Only owner can update settings
        if (!isGroupOwner(groupId, userId)) {
            throw new BadRequestException("Only group owner can update settings");
        }

        GroupSettings settings = groupSettingsRepository.findByGroupId(groupId)
                .orElseThrow(() -> new NotFoundException("Group settings not found"));

        // Update fields if provided
        if (request.getAllowMemberPosts() != null) {
            settings.setAllowMemberPosts(request.getAllowMemberPosts());
        }
        if (request.getRequirePostApproval() != null) {
            settings.setRequirePostApproval(request.getRequirePostApproval());
        }
        if (request.getAllowMemberInvites() != null) {
            settings.setAllowMemberInvites(request.getAllowMemberInvites());
        }
        if (request.getMaxMembers() != null) {
            settings.setMaxMembers(request.getMaxMembers());
        }

        settings = groupSettingsRepository.save(settings);
        log.info("Updated settings for group {} by owner {}", groupId, userId);

        return mapToGroupSettingsResponse(settings);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isGroupOwner(Long groupId, UUID userId) {
        GroupRole ownerRole = groupRoleRepository.findByRoleName("group_owner")
                .orElse(null);
        if (ownerRole == null) return false;

        return groupMemberRepository.findByGroupIdAndUserId(groupId, userId)
                .map(member -> member.getRoleId().equals(ownerRole.getId()))
                .orElse(false);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isGroupAdmin(Long groupId, UUID userId) {
        GroupRole adminRole = groupRoleRepository.findByRoleName("group_admin")
                .orElse(null);
        if (adminRole == null) return false;

        return groupMemberRepository.findByGroupIdAndUserId(groupId, userId)
                .map(member -> member.getRoleId().equals(adminRole.getId()))
                .orElse(false);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean isGroupMember(Long groupId, UUID userId) {
        return groupMemberRepository.existsByGroupIdAndUserId(groupId, userId);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean canManageMembers(Long groupId, UUID userId) {
        return isGroupOwner(groupId, userId) || isGroupAdmin(groupId, userId);
    }

    @Override
    @Transactional(readOnly = true)
    public boolean canManagePosts(Long groupId, UUID userId) {
        return isGroupOwner(groupId, userId) || isGroupAdmin(groupId, userId);
    }

    @Override
    @Transactional(readOnly = true)
    public String getUserRoleInGroup(Long groupId, UUID userId) {
        return groupMemberRepository.findByGroupIdAndUserId(groupId, userId)
                .map(member -> groupRoleRepository.findById(member.getRoleId())
                        .map(GroupRole::getRoleName)
                        .orElse(null))
                .orElse(null);
    }

    // Feed helpers

    @Override
    @Transactional(readOnly = true)
    public List<Long> getGroupIdsBySportProfiles(UUID userId) {
        List<Long> sportIds = userSportProfileService.getUserProfiles(userId).stream()
                .map(UserSportProfileResponse::getSportId)
                .filter(id -> id != null)
                .collect(Collectors.toList());
        if (sportIds.isEmpty()) {
            return List.of();
        }
        return groupRepository.findGroupIdsByUserAndSportIds(userId, sportIds);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Long> getGroupIdsForMember(UUID userId) {
        return groupMemberRepository.findByUserId(userId).stream()
                .map(GroupMember::getGroupId)
                .collect(Collectors.toList());
    }

    // Pinned Posts

    @Override
    @Transactional
    public PinnedPostResponse pinPost(Long groupId, UUID userId, Long postId) {
        if (!groupRepository.existsById(groupId)) {
            throw new NotFoundException("Group not found");
        }

        if (!canManageMembers(groupId, userId)) {
            throw new BadRequestException("Only group owner or admin can pin posts");
        }

        long pinCount = pinnedPostRepository.countByGroupId(groupId);
        if (pinCount >= 10) {
            throw new BadRequestException("Pin limit reached (max 10). Unpin a post before pinning a new one.");
        }

        if (pinnedPostRepository.existsByGroupIdAndPostId(groupId, postId)) {
            throw new BadRequestException("Post is already pinned");
        }

        PostResponse post = postService.getPostById(postId, userId);
        if (post == null) {
            throw new NotFoundException("Post not found");
        }
        if (!groupId.equals(post.getGroupId())) {
            throw new BadRequestException("Post does not belong to this group");
        }
        if (PostType.GROUP_POST != post.getPostType()) {
            throw new BadRequestException("Only GROUP_POST posts can be pinned");
        }

        GroupPinnedPost pin = GroupPinnedPost.builder()
                .groupId(groupId)
                .postId(postId)
                .pinnedBy(userId)
                .build();
        pin = pinnedPostRepository.save(pin);

        log.info("Post {} pinned in group {} by user {}", postId, groupId, userId);

        return PinnedPostResponse.builder()
                .postId(pin.getPostId())
                .pinnedBy(pin.getPinnedBy())
                .pinnedAt(pin.getPinnedAt())
                .post(post)
                .build();
    }

    @Override
    @Transactional
    public void unpinPost(Long groupId, UUID userId, Long postId) {
        if (!groupRepository.existsById(groupId)) {
            throw new NotFoundException("Group not found");
        }

        if (!canManageMembers(groupId, userId)) {
            throw new BadRequestException("Only group owner or admin can unpin posts");
        }

        pinnedPostRepository.deleteByGroupIdAndPostId(groupId, postId);
        log.info("Post {} unpinned from group {} by user {}", postId, groupId, userId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<PinnedPostResponse> getPinnedPosts(Long groupId, UUID currentUserId) {
        if (!groupRepository.existsById(groupId)) {
            throw new NotFoundException("Group not found");
        }

        if (!isGroupMember(groupId, currentUserId)) {
            throw new BadRequestException("Only group members can view pinned posts");
        }

        List<GroupPinnedPost> pins = pinnedPostRepository.findByGroupIdOrderByPinnedAtDesc(groupId);
        Map<Long, PostResponse> postsByPinnedPostId = postService.getPostsByIds(
                pins.stream().map(GroupPinnedPost::getPostId).collect(Collectors.toList()),
                currentUserId);

        return pins.stream()
                .filter(pin -> postsByPinnedPostId.containsKey(pin.getPostId()))
                .map(pin -> PinnedPostResponse.builder()
                        .postId(pin.getPostId())
                        .pinnedBy(pin.getPinnedBy())
                        .pinnedAt(pin.getPinnedAt())
                        .post(postsByPinnedPostId.get(pin.getPostId()))
                        .build())
                .collect(Collectors.toList());
    }

    // Invitations

    @Override
    @Transactional
    public GroupInvitationResponse createInvitation(Long groupId, UUID inviterId, CreateInvitationRequest request) {
        Group group = groupRepository.findByIdAndIsActiveTrue(groupId)
                .orElseThrow(() -> new NotFoundException("Group not found"));

        if (!isGroupMember(groupId, inviterId)) {
            throw new BadRequestException("Only group members can send invitations");
        }

        GroupSettings settings = groupSettingsRepository.findByGroupId(groupId)
                .orElseThrow(() -> new NotFoundException("Group settings not found"));
        if (!Boolean.TRUE.equals(settings.getAllowMemberInvites())) {
            throw new BadRequestException("Member invitations are not allowed in this group");
        }

        UUID inviteeId = request.getInviteeId();

        if (groupMemberRepository.existsByGroupIdAndUserId(groupId, inviteeId)) {
            throw new BadRequestException("User is already a member of this group");
        }

        if (!userFriendService.areFriends(inviterId, inviteeId)) {
            throw new BadRequestException("You can only invite your friends");
        }

        boolean alreadyInvited = invitationRepository.existsByGroupIdAndInviteeIdAndStatusIn(
                groupId, inviteeId, List.of("pending_owner", "pending_user"));
        if (alreadyInvited) {
            GroupInvitation existing = invitationRepository
                    .findByGroupIdAndInviteeIdAndStatusIn(groupId, inviteeId, List.of("pending_owner", "pending_user"))
                    .orElseThrow();
            return mapToGroupInvitationResponse(existing, group.getGroupName(),
                    userService.getUsersByIds(List.of(existing.getInviterId(), existing.getInviteeId())));
        }

        GroupInvitation invitation = GroupInvitation.builder()
                .groupId(groupId)
                .inviterId(inviterId)
                .inviteeId(inviteeId)
                .status("pending_owner")
                .build();
        invitation = invitationRepository.save(invitation);

        log.info("Invitation created for user {} in group {} by member {}", inviteeId, groupId, inviterId);
        return mapToGroupInvitationResponse(invitation, group.getGroupName(),
                userService.getUsersByIds(List.of(invitation.getInviterId(), invitation.getInviteeId())));
    }

    @Override
    @Transactional
    public void approveInvitation(Long invitationId, UUID ownerId) {
        GroupInvitation invitation = invitationRepository.findById(invitationId)
                .orElseThrow(() -> new NotFoundException("Invitation not found"));

        if (!canManageMembers(invitation.getGroupId(), ownerId)) {
            throw new BadRequestException("Only group owner or admin can approve invitations");
        }
        if (!"pending_owner".equals(invitation.getStatus())) {
            throw new BadRequestException("Invitation is not pending owner approval");
        }

        invitation.setStatus("pending_user");
        invitation.setReviewedBy(ownerId);
        invitation.setReviewedAt(LocalDateTime.now());
        invitationRepository.save(invitation);

        // TODO: notify — send in-app notification to invitee (pending ADR.md#in-app-notification)

        log.info("Invitation {} approved by {}", invitationId, ownerId);
    }

    @Override
    @Transactional
    public void declineInvitation(Long invitationId, UUID ownerId) {
        GroupInvitation invitation = invitationRepository.findById(invitationId)
                .orElseThrow(() -> new NotFoundException("Invitation not found"));

        if (!canManageMembers(invitation.getGroupId(), ownerId)) {
            throw new BadRequestException("Only group owner or admin can decline invitations");
        }
        if (!"pending_owner".equals(invitation.getStatus())) {
            throw new BadRequestException("Invitation is not pending owner approval");
        }

        invitation.setStatus("declined_by_owner");
        invitation.setReviewedBy(ownerId);
        invitation.setReviewedAt(LocalDateTime.now());
        invitationRepository.save(invitation);

        log.info("Invitation {} declined by owner {}", invitationId, ownerId);
    }

    @Override
    @Transactional
    public void acceptInvitation(Long invitationId, UUID inviteeId) {
        GroupInvitation invitation = invitationRepository.findById(invitationId)
                .orElseThrow(() -> new NotFoundException("Invitation not found"));

        if (!inviteeId.equals(invitation.getInviteeId())) {
            throw new BadRequestException("Only the invited user can accept this invitation");
        }
        if (!"pending_user".equals(invitation.getStatus())) {
            throw new BadRequestException("Invitation is not pending your response");
        }

        GroupRole memberRole = groupRoleRepository.findByRoleName("group_member")
                .orElseThrow(() -> new NotFoundException("Group member role not found"));

        GroupMember member = GroupMember.builder()
                .groupId(invitation.getGroupId())
                .userId(inviteeId)
                .roleId(memberRole.getId())
                .build();
        groupMemberRepository.save(member);

        invitation.setStatus("accepted");
        invitationRepository.save(invitation);

        log.info("Invitation {} accepted by user {}", invitationId, inviteeId);
    }

    @Override
    @Transactional
    public void rejectInvitation(Long invitationId, UUID inviteeId) {
        GroupInvitation invitation = invitationRepository.findById(invitationId)
                .orElseThrow(() -> new NotFoundException("Invitation not found"));

        if (!inviteeId.equals(invitation.getInviteeId())) {
            throw new BadRequestException("Only the invited user can reject this invitation");
        }
        if (!"pending_user".equals(invitation.getStatus())) {
            throw new BadRequestException("Invitation is not pending your response");
        }

        invitation.setStatus("declined_by_user");
        invitationRepository.save(invitation);

        log.info("Invitation {} rejected by user {}", invitationId, inviteeId);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<GroupInvitationResponse> getGroupInvitations(Long groupId, UUID ownerId, Pageable pageable) {
        if (!groupRepository.existsById(groupId)) {
            throw new NotFoundException("Group not found");
        }
        if (!canManageMembers(groupId, ownerId)) {
            throw new BadRequestException("Only group owner or admin can view invitations");
        }
        String groupName = groupRepository.findById(groupId).map(Group::getGroupName).orElse("Unknown Group");
        Page<GroupInvitation> invitationsPage =
                invitationRepository.findByGroupIdAndStatus(groupId, "pending_owner", pageable);
        Map<UUID, UserResponse> usersById = buildInviterInviteeUserMap(invitationsPage.getContent());
        return invitationsPage.map(inv -> mapToGroupInvitationResponse(inv, groupName, usersById));
    }

    @Override
    @Transactional(readOnly = true)
    public Page<GroupInvitationResponse> getUserPendingInvitations(UUID userId, Pageable pageable) {
        Page<GroupInvitation> invitationsPage =
                invitationRepository.findByInviteeIdAndStatus(userId, "pending_user", pageable);

        List<Long> groupIds = invitationsPage.getContent().stream()
                .map(GroupInvitation::getGroupId)
                .distinct()
                .collect(Collectors.toList());
        Map<Long, String> groupNamesById = groupIds.isEmpty()
                ? Map.of()
                : groupRepository.findAllById(groupIds).stream()
                        .collect(Collectors.toMap(Group::getId, Group::getGroupName));

        Map<UUID, UserResponse> usersById = buildInviterInviteeUserMap(invitationsPage.getContent());

        return invitationsPage.map(inv -> {
            String groupName = groupNamesById.getOrDefault(inv.getGroupId(), "Unknown Group");
            return mapToGroupInvitationResponse(inv, groupName, usersById);
        });
    }

    @Override
    @Transactional(readOnly = true)
    public Page<GroupInvitationResponse> getMemberSentInvitations(Long groupId, UUID inviterId, Pageable pageable) {
        if (!groupRepository.existsById(groupId)) {
            throw new NotFoundException("Group not found");
        }
        if (!isGroupMember(groupId, inviterId)) {
            throw new BadRequestException("Only group members can view their sent invitations");
        }
        String groupName = groupRepository.findById(groupId).map(Group::getGroupName).orElse("Unknown Group");
        Page<GroupInvitation> invitationsPage =
                invitationRepository.findByGroupIdAndInviterIdAndStatus(groupId, inviterId, "pending_owner", pageable);
        Map<UUID, UserResponse> usersById = buildInviterInviteeUserMap(invitationsPage.getContent());
        return invitationsPage.map(inv -> mapToGroupInvitationResponse(inv, groupName, usersById));
    }

    // Helper methods
    private GroupResponse mapToGroupResponse(Group group, UUID currentUserId) {
        String createdByFullName = userService.getUsersByIds(List.of(group.getCreatedBy())).values().stream()
                .findFirst()
                .map(UserResponse::getFullName)
                .orElse("Unknown User");

        long memberCount = groupMemberRepository.countByGroupId(group.getId());

        String currentUserRole = currentUserId != null ? getUserRoleInGroup(group.getId(), currentUserId) : null;

        return GroupResponse.builder()
                .id(group.getId())
                .sportId(group.getSportId())
                .groupName(group.getGroupName())
                .description(group.getDescription())
                .avatarUrl(group.getAvatarUrl())
                .coverUrl(group.getCoverUrl())
                .isPrivate(group.getIsPrivate())
                .isActive(group.getIsActive())
                .createdBy(group.getCreatedBy())
                .createdByFullName(createdByFullName)
                .memberCount((int) memberCount)
                .currentUserRole(currentUserRole)
                .createdAt(group.getCreatedAt())
                .updatedAt(group.getUpdatedAt())
                .build();
    }

    private GroupResponse mapToGroupResponse(Group group,
                                              Map<UUID, UserResponse> creatorsById,
                                              Map<Long, Long> memberCountsById,
                                              Map<Integer, GroupRole> rolesById,
                                              Integer currentUserRoleId) {
        UserResponse creator = creatorsById.get(group.getCreatedBy());
        String createdByFullName = creator != null ? creator.getFullName() : "Unknown User";

        long memberCount = memberCountsById.getOrDefault(group.getId(), 0L);

        GroupRole role = currentUserRoleId != null ? rolesById.get(currentUserRoleId) : null;
        String currentUserRole = role != null ? role.getRoleName() : null;

        return GroupResponse.builder()
                .id(group.getId())
                .sportId(group.getSportId())
                .groupName(group.getGroupName())
                .description(group.getDescription())
                .avatarUrl(group.getAvatarUrl())
                .coverUrl(group.getCoverUrl())
                .isPrivate(group.getIsPrivate())
                .isActive(group.getIsActive())
                .createdBy(group.getCreatedBy())
                .createdByFullName(createdByFullName)
                .memberCount((int) memberCount)
                .currentUserRole(currentUserRole)
                .createdAt(group.getCreatedAt())
                .updatedAt(group.getUpdatedAt())
                .build();
    }

    private GroupMemberResponse mapToGroupMemberResponse(GroupMember member,
                                                          Map<UUID, UserResponse> usersById,
                                                          Map<Integer, GroupRole> rolesById) {
        UserResponse memberUser = usersById.get(member.getUserId());
        String userFullName = memberUser != null ? memberUser.getFullName() : "Unknown User";
        String userAvatarUrl = memberUser != null ? memberUser.getAvatarUrl() : null;

        GroupRole role = rolesById.get(member.getRoleId());

        return GroupMemberResponse.builder()
                .id(member.getId())
                .groupId(member.getGroupId())
                .userId(member.getUserId())
                .userFullName(userFullName)
                .userAvatarUrl(userAvatarUrl)
                .roleId(member.getRoleId())
                .roleName(role != null ? role.getRoleName() : null)
                .roleLevel(role != null ? role.getLevel() : null)
                .joinedAt(member.getJoinedAt())
                .build();
    }

    private Page<JoinRequestResponse> mapJoinRequestsPage(Page<GroupJoinRequest> requestsPage) {
        List<Long> groupIds = requestsPage.getContent().stream()
                .map(GroupJoinRequest::getGroupId)
                .distinct()
                .collect(Collectors.toList());
        Map<Long, Group> groupsById = groupIds.isEmpty()
                ? Map.of()
                : groupRepository.findAllById(groupIds).stream()
                        .collect(Collectors.toMap(Group::getId, g -> g));

        List<UUID> userIds = new ArrayList<>();
        for (GroupJoinRequest request : requestsPage.getContent()) {
            userIds.add(request.getUserId());
            if (request.getReviewedBy() != null) {
                userIds.add(request.getReviewedBy());
            }
        }
        List<UUID> distinctUserIds = userIds.stream().distinct().collect(Collectors.toList());
        Map<UUID, UserResponse> usersById = distinctUserIds.isEmpty()
                ? Map.of()
                : userService.getUsersByIds(distinctUserIds);

        return requestsPage.map(request -> mapToJoinRequestResponse(request, groupsById, usersById));
    }

    private JoinRequestResponse mapToJoinRequestResponse(GroupJoinRequest request,
                                                          Map<Long, Group> groupsById,
                                                          Map<UUID, UserResponse> usersById) {
        Group group = groupsById.get(request.getGroupId());
        String groupName = group != null ? group.getGroupName() : "Unknown Group";

        UserResponse requestUser = usersById.get(request.getUserId());
        String userFullName = requestUser != null ? requestUser.getFullName() : "Unknown User";
        String userAvatarUrl = requestUser != null ? requestUser.getAvatarUrl() : null;

        String reviewedByFullName = null;
        if (request.getReviewedBy() != null) {
            UserResponse reviewer = usersById.get(request.getReviewedBy());
            reviewedByFullName = reviewer != null ? reviewer.getFullName() : "Unknown User";
        }

        return JoinRequestResponse.builder()
                .id(request.getId())
                .groupId(request.getGroupId())
                .groupName(groupName)
                .userId(request.getUserId())
                .userFullName(userFullName)
                .userAvatarUrl(userAvatarUrl)
                .status(request.getStatus())
                .message(request.getMessage())
                .reviewedBy(request.getReviewedBy())
                .reviewedByFullName(reviewedByFullName)
                .reviewedAt(request.getReviewedAt())
                .createdAt(request.getCreatedAt())
                .updatedAt(request.getUpdatedAt())
                .build();
    }

    private Map<UUID, UserResponse> buildInviterInviteeUserMap(List<GroupInvitation> invitations) {
        List<UUID> userIds = new ArrayList<>();
        for (GroupInvitation invitation : invitations) {
            userIds.add(invitation.getInviterId());
            userIds.add(invitation.getInviteeId());
        }
        List<UUID> distinctUserIds = userIds.stream().distinct().collect(Collectors.toList());
        return distinctUserIds.isEmpty() ? Map.of() : userService.getUsersByIds(distinctUserIds);
    }

    private GroupInvitationResponse mapToGroupInvitationResponse(GroupInvitation invitation, String groupName,
                                                                  Map<UUID, UserResponse> usersById) {
        UserResponse inviter = usersById.get(invitation.getInviterId());
        UserResponse invitee = usersById.get(invitation.getInviteeId());
        String inviterFullName = inviter != null ? inviter.getFullName() : "Unknown User";
        String inviteeFullName = invitee != null ? invitee.getFullName() : "Unknown User";

        return GroupInvitationResponse.builder()
                .id(invitation.getId())
                .groupId(invitation.getGroupId())
                .groupName(groupName)
                .inviterId(invitation.getInviterId())
                .inviterFullName(inviterFullName)
                .inviteeId(invitation.getInviteeId())
                .inviteeFullName(inviteeFullName)
                .status(invitation.getStatus())
                .reviewedBy(invitation.getReviewedBy())
                .reviewedAt(invitation.getReviewedAt())
                .createdAt(invitation.getCreatedAt())
                .updatedAt(invitation.getUpdatedAt())
                .build();
    }

    private GroupSettingsResponse mapToGroupSettingsResponse(GroupSettings settings) {
        return GroupSettingsResponse.builder()
                .id(settings.getId())
                .groupId(settings.getGroupId())
                .allowMemberPosts(settings.getAllowMemberPosts())
                .requirePostApproval(settings.getRequirePostApproval())
                .allowMemberInvites(settings.getAllowMemberInvites())
                .maxMembers(settings.getMaxMembers())
                .createdAt(settings.getCreatedAt())
                .updatedAt(settings.getUpdatedAt())
                .build();
    }
}
