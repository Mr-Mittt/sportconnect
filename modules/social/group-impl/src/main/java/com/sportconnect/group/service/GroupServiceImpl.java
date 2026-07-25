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
import com.sportconnect.group.entity.GroupInvitationInviter;
import com.sportconnect.group.entity.GroupJoinRequest;
import com.sportconnect.group.entity.GroupMember;
import com.sportconnect.group.entity.GroupPinnedPost;
import com.sportconnect.group.entity.GroupRole;
import com.sportconnect.group.entity.GroupSettings;
import com.sportconnect.group.entity.GroupType;
import com.sportconnect.group.repository.GroupInvitationInviterRepository;
import com.sportconnect.group.repository.GroupInvitationRepository;
import com.sportconnect.group.repository.GroupJoinRequestRepository;
import com.sportconnect.group.repository.GroupMemberRepository;
import com.sportconnect.group.repository.GroupPinnedPostRepository;
import com.sportconnect.group.repository.GroupRepository;
import com.sportconnect.group.repository.GroupRoleRepository;
import com.sportconnect.group.repository.GroupSettingsRepository;
import com.sportconnect.group.repository.GroupTypeRepository;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
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
    private final GroupTypeRepository groupTypeRepository;
    private final UserService userService;
    private final UserFriendService userFriendService;
    private final UserSportProfileService userSportProfileService;
    private final PostService postService;
    private final GroupPinnedPostRepository pinnedPostRepository;
    private final GroupInvitationRepository invitationRepository;
    private final GroupInvitationInviterRepository invitationInviterRepository;

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
            GroupTypeRepository groupTypeRepository,
            UserService userService,
            UserFriendService userFriendService,
            UserSportProfileService userSportProfileService,
            @Lazy PostService postService,
            GroupPinnedPostRepository pinnedPostRepository,
            GroupInvitationRepository invitationRepository,
            GroupInvitationInviterRepository invitationInviterRepository) {
        this.groupRepository = groupRepository;
        this.groupMemberRepository = groupMemberRepository;
        this.joinRequestRepository = joinRequestRepository;
        this.groupSettingsRepository = groupSettingsRepository;
        this.groupRoleRepository = groupRoleRepository;
        this.groupTypeRepository = groupTypeRepository;
        this.userService = userService;
        this.userFriendService = userFriendService;
        this.userSportProfileService = userSportProfileService;
        this.postService = postService;
        this.pinnedPostRepository = pinnedPostRepository;
        this.invitationRepository = invitationRepository;
        this.invitationInviterRepository = invitationInviterRepository;
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

        // Create default settings — every group is silently created as the DEFAULT type;
        // changing type is a separate, not-yet-built ticket (see BACKLOG_MVP.md).
        GroupType defaultType = groupTypeRepository.findByTypeName("DEFAULT")
                .orElseThrow(() -> new NotFoundException("Default group type not found"));
        GroupSettings settings = GroupSettings.builder()
                .groupId(group.getId())
                .allowMemberPosts(true)
                .requirePostApproval(false)
                .allowMemberInvites(false)
                .groupTypeId(defaultType.getId())
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

        // Privacy gate before the (relatively expensive) response mapping and pinned-post fetch below —
        // membership is checked, not ownership/admin specifically, since isGroupMember covers all three roles.
        if (Boolean.TRUE.equals(group.getIsPrivate())
                && (currentUserId == null || !isGroupMember(groupId, currentUserId))) {
            throw new BadRequestException("This group is private. Request to join to view its details");
        }

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
    public Page<GroupSearchResponse> getPublicGroups(UUID currentUserId, Long sportId, List<Long> sportIds, String keyword, Pageable pageable) {
        // A10: sportIds (non-empty) takes priority over the legacy single sportId — the two
        // are never combined/ORed. A single sportId is wrapped into a one-element list so the
        // repository only ever has to reason about one IN-based filter shape.
        List<Long> effectiveSportIds = (sportIds != null && !sportIds.isEmpty())
                ? sportIds
                : (sportId != null ? List.of(sportId) : null);

        Page<Object[]> rawPage = currentUserId != null
                ? groupRepository.searchPublicGroupsWithCounts(currentUserId, effectiveSportIds, keyword, pageable)
                : groupRepository.searchPublicGroupsAnon(effectiveSportIds, keyword, pageable);

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

        // groupName is the only unique constraint on `groups` — the pre-check above (line ~304) has
        // a narrow TOCTOU window against a concurrent rename to the same name; the DB constraint is
        // the real backstop, this just translates its violation into the same friendly error
        // instead of a generic 500 (B7 addendum).
        try {
            group = groupRepository.save(group);
        } catch (DataIntegrityViolationException e) {
            throw new BadRequestException("Group name already exists");
        }
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
    public void addMember(Long groupId, UUID adminUserId, UUID targetUserId) {
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

        // B9: owner/admin adds still go through the friends-only gate, same as a peer invite
        if (!userFriendService.areFriends(adminUserId, targetUserId)) {
            throw new BadRequestException("You can only add your friends");
        }

        boolean alreadyInvited = invitationRepository.existsByGroupIdAndInviteeIdAndStatusIn(
                groupId, targetUserId, List.of("pending_owner", "pending_user"));
        if (alreadyInvited) {
            throw new BadRequestException("User already has a pending invitation to this group");
        }

        checkMemberCapacityNotExceeded(groupId);

        // B11 rule 2: this is a third call site (alongside approveInvitation and
        // createSelfApprovedInvitation) where an invitation is about to enter pending_user — check
        // for an existing pending join request from the target first, same as the other two.
        Optional<GroupJoinRequest> pendingJoinRequest = joinRequestRepository
                .findByGroupIdAndUserIdAndStatus(groupId, targetUserId, "pending");

        // B9: self-approved invitation — owner/admin IS the approver, so it starts at
        // pending_user rather than pending_owner. Target must still accept via acceptInvitation —
        // unless rule 2 above already found a pending join request, in which case it's accepted here.
        GroupInvitation invitation = GroupInvitation.builder()
                .groupId(groupId)
                .inviterId(adminUserId)
                .inviteeId(targetUserId)
                .status(pendingJoinRequest.isPresent() ? "accepted" : "pending_user")
                .reviewedBy(adminUserId)
                .reviewedAt(LocalDateTime.now())
                .build();
        invitation = invitationRepository.save(invitation);
        recordCoInviter(invitation.getId(), adminUserId);

        if (pendingJoinRequest.isPresent()) {
            acceptJoinRequestAsSideEffect(pendingJoinRequest.get(), adminUserId, adminUserId);
        }

        log.info("Owner/admin {} invited user {} to group {} (self-approved{})", adminUserId, targetUserId, groupId,
                pendingJoinRequest.isPresent() ? ", auto-accepted via existing join request" : "");
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

        // B11 rule 3: an invitation already awaiting this user's response is at least as strong a
        // signal of intent as a fresh join request — accept it directly instead of creating a
        // second, independent pending item for the owner/admin to separately act on.
        Optional<GroupInvitation> pendingUserInvitation = invitationRepository
                .findByGroupIdAndInviteeIdAndStatusIn(group.getId(), userId, List.of("pending_user"));

        GroupJoinRequest joinRequest;
        if (pendingUserInvitation.isPresent()) {
            joinRequest = acceptInvitationAsJoinRequest(group, userId, request.getMessage(), pendingUserInvitation.get());
        } else {
            // Check if pending request exists
            if (joinRequestRepository.existsByGroupIdAndUserIdAndStatus(group.getId(), userId, "pending")) {
                throw new BadRequestException("You already have a pending request for this group");
            }

            checkMemberCapacityNotExceeded(group.getId());

            joinRequest = GroupJoinRequest.builder()
                    .groupId(group.getId())
                    .userId(userId)
                    .status("pending")
                    .message(request.getMessage())
                    .build();
            joinRequest = joinRequestRepository.save(joinRequest);
            log.info("Created join request {} for group {} by user {}", joinRequest.getId(), group.getId(), userId);
        }

        Group requestGroup = groupRepository.findById(joinRequest.getGroupId()).orElse(null);
        Map<Long, Group> groupsById = requestGroup != null
                ? Map.of(requestGroup.getId(), requestGroup)
                : Map.of();
        // B11 rule 3: a short-circuited join request already has reviewedBy set (the invitation's
        // approver) — resolve that name too, not just the requester's, so the response doesn't
        // silently show "Unknown User" for a reviewer that does exist.
        List<UUID> idsToResolve = joinRequest.getReviewedBy() != null
                ? List.of(userId, joinRequest.getReviewedBy())
                : List.of(userId);
        Map<UUID, UserResponse> usersById = userService.getUsersByIds(idsToResolve);
        return mapToJoinRequestResponse(joinRequest, groupsById, usersById);
    }

    /**
     * B11 rule 3: called when a {@code pending_user} invitation already exists for the requester.
     * Rather than silently skipping row creation, this still records a {@code GroupJoinRequest}
     * row — created directly as {@code accepted}, with {@code reviewedBy} attributed to whoever
     * approved the invitation ({@code invitation.getReviewedBy()}) — so the requester's join-request
     * history isn't missing this event, alongside accepting the invitation itself and creating the
     * membership. This deliberately leaves two accepted rows (one invitation, one join request) for
     * the same real-world join event; no attempt is made to merge or suppress either — see the note
     * left on GRP-7's backlog entry for the client-side display decision.
     */
    private GroupJoinRequest acceptInvitationAsJoinRequest(Group group, UUID userId, String message, GroupInvitation invitation) {
        finalizeMembership(group.getId(), userId, invitation.getInviterId());

        invitation.setStatus("accepted");
        invitationRepository.save(invitation);

        GroupJoinRequest joinRequest = GroupJoinRequest.builder()
                .groupId(group.getId())
                .userId(userId)
                .status("accepted")
                .message(message)
                .reviewedBy(invitation.getReviewedBy())
                .reviewedAt(LocalDateTime.now())
                .build();
        joinRequest = joinRequestRepository.save(joinRequest);

        log.info("Join request for group {} by user {} auto-accepted via existing invitation {}",
                group.getId(), userId, invitation.getId());
        return joinRequest;
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

        finalizeMembership(request.getGroupId(), request.getUserId(), null);

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
            existing = recordCoInviterIfNew(existing, inviterId, groupId);
            return mapSingleInvitationResponse(existing, group);
        }

        checkMemberCapacityNotExceeded(groupId);

        // B11 rule 1: an owner/admin's own invitation needs no self-approval — skip pending_owner
        // entirely and head straight for pending_user (still subject to rule 2, below).
        if (canManageMembers(groupId, inviterId)) {
            return createSelfApprovedInvitation(group, inviterId, inviteeId);
        }

        GroupInvitation invitation = GroupInvitation.builder()
                .groupId(groupId)
                .inviterId(inviterId)
                .inviteeId(inviteeId)
                .status("pending_owner")
                .build();
        invitation = invitationRepository.save(invitation);
        recordCoInviter(invitation.getId(), inviterId);

        log.info("Invitation created for user {} in group {} by member {}", inviteeId, groupId, inviterId);
        return mapSingleInvitationResponse(invitation, group);
    }

    /**
     * B14: called from {@code createInvitation}'s "already invited" branch when a second (or
     * later) member tries to invite someone who already has a pending invitation to this group.
     * If {@code inviterId} isn't already a recorded co-inviter, records them — and, if they're an
     * owner/admin and the invitation is still {@code pending_owner}, treats that exactly like
     * B11 rule 1 treats a brand-new self-approved invitation: no separate Approve click needed,
     * since they already have approval rights and are the one taking this action. Returns the
     * invitation as it stands after this call (possibly transitioned).
     */
    private GroupInvitation recordCoInviterIfNew(GroupInvitation invitation, UUID inviterId, Long groupId) {
        boolean isNewCoInviter = !invitationInviterRepository.existsByInvitationIdAndInviterId(invitation.getId(), inviterId);
        if (!isNewCoInviter) {
            return invitation;
        }
        recordCoInviter(invitation.getId(), inviterId);
        log.info("User {} joined invitation {} as a co-inviter", inviterId, invitation.getId());

        if ("pending_owner".equals(invitation.getStatus()) && canManageMembers(groupId, inviterId)) {
            invitation = transitionInvitationTowardPendingUser(invitation, inviterId);
            log.info("Invitation {} auto-approved via co-inviting owner/admin {}", invitation.getId(), inviterId);
        }
        return invitation;
    }

    private void recordCoInviter(Long invitationId, UUID inviterId) {
        invitationInviterRepository.save(GroupInvitationInviter.builder()
                .invitationId(invitationId)
                .inviterId(inviterId)
                .build());
    }

    /**
     * B11 rule 1: builds the owner/admin's self-approved invitation. Runs the same rule-2
     * join-request short-circuit that {@link #approveInvitation} runs — this is the other call
     * site where an invitation is about to enter {@code pending_user}.
     */
    private GroupInvitationResponse createSelfApprovedInvitation(Group group, UUID inviterId, UUID inviteeId) {
        Optional<GroupJoinRequest> pendingJoinRequest = joinRequestRepository
                .findByGroupIdAndUserIdAndStatus(group.getId(), inviteeId, "pending");

        GroupInvitation invitation = GroupInvitation.builder()
                .groupId(group.getId())
                .inviterId(inviterId)
                .inviteeId(inviteeId)
                .status(pendingJoinRequest.isPresent() ? "accepted" : "pending_user")
                .reviewedBy(inviterId)
                .reviewedAt(LocalDateTime.now())
                .build();
        invitation = invitationRepository.save(invitation);
        recordCoInviter(invitation.getId(), inviterId);

        if (pendingJoinRequest.isPresent()) {
            acceptJoinRequestAsSideEffect(pendingJoinRequest.get(), inviterId, inviterId);
        }

        log.info("Owner/admin {} invited user {} to group {} (self-approved{})",
                inviterId, inviteeId, group.getId(),
                pendingJoinRequest.isPresent() ? ", auto-accepted via existing join request" : "");
        return mapSingleInvitationResponse(invitation, group);
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

        invitation = transitionInvitationTowardPendingUser(invitation, ownerId);

        log.info("Invitation {} approved by {}{}", invitationId, ownerId,
                "accepted".equals(invitation.getStatus()) ? " (auto-accepted via existing join request)" : "");
    }

    /**
     * B11 rule 2 + B14: shared by every call site where an already-persisted invitation is about
     * to move from {@code pending_owner} toward {@code pending_user} —
     * {@link #approveInvitation}'s normal owner/admin approval, and B14's
     * {@link #recordCoInviterIfNew} auto-approval when an owner/admin joins as a co-inviter on a
     * still-pending row. (Not used by {@link #createSelfApprovedInvitation}/{@code addMember}'s
     * direct-add path — both build a brand-new row rather than mutate an existing one, a different
     * enough shape that forcing them through this helper wouldn't simplify anything.)
     *
     * Short-circuits straight to {@code accepted} if the invitee already has a {@code pending}
     * join request in flight for this group — that join request is at least as strong a signal of
     * intent as accepting the invitation would be, so there's no reason to make the invitee
     * separately act on both. {@code reviewerId} is credited as who reviewed it; the join-request
     * side effect (if any) still credits the invitation's original inviter as who gets the welcome
     * message, not necessarily {@code reviewerId}.
     */
    private GroupInvitation transitionInvitationTowardPendingUser(GroupInvitation invitation, UUID reviewerId) {
        Optional<GroupJoinRequest> pendingJoinRequest = joinRequestRepository
                .findByGroupIdAndUserIdAndStatus(invitation.getGroupId(), invitation.getInviteeId(), "pending");

        invitation.setStatus(pendingJoinRequest.isPresent() ? "accepted" : "pending_user");
        invitation.setReviewedBy(reviewerId);
        invitation.setReviewedAt(LocalDateTime.now());
        invitation = invitationRepository.save(invitation);

        if (pendingJoinRequest.isPresent()) {
            acceptJoinRequestAsSideEffect(pendingJoinRequest.get(), invitation.getInviterId(), reviewerId);
        } else {
            // TODO: notify — send in-app notification to invitee (pending ADR.md#in-app-notification)
        }
        return invitation;
    }

    /**
     * B11 rule 2: shared by both call sites where an invitation is about to enter
     * {@code pending_user} ({@link #approveInvitation}'s normal transition and
     * {@link #createSelfApprovedInvitation}'s direct-to-pending_user creation) when a pending join
     * request already exists for the same (group, invitee). Finalizes the membership crediting
     * {@code creditedInviterId} (the invitation's original inviter — may differ from
     * {@code reviewerId}, the owner/admin who performed this approving action), and marks the join
     * request itself {@code accepted} rather than leaving it dangling {@code pending}. Deliberately
     * leaves two accepted rows (the invitation, handled by the caller, and this join request) for
     * the same real-world join event — see the note left on GRP-7's backlog entry.
     */
    private void acceptJoinRequestAsSideEffect(GroupJoinRequest joinRequest, UUID creditedInviterId, UUID reviewerId) {
        finalizeMembership(joinRequest.getGroupId(), joinRequest.getUserId(), creditedInviterId);

        joinRequest.setStatus("accepted");
        joinRequest.setReviewedBy(reviewerId);
        joinRequest.setReviewedAt(LocalDateTime.now());
        joinRequestRepository.save(joinRequest);
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

        finalizeMembership(invitation.getGroupId(), inviteeId, invitation.getInviterId());

        invitation.setStatus("accepted");
        invitationRepository.save(invitation);

        log.info("Invitation {} accepted by user {}", invitationId, inviteeId);
    }

    @Override
    @Transactional
    public void rejectInvitation(Long invitationId, UUID inviteeId, String reason) {
        GroupInvitation invitation = invitationRepository.findById(invitationId)
                .orElseThrow(() -> new NotFoundException("Invitation not found"));

        if (!inviteeId.equals(invitation.getInviteeId())) {
            throw new BadRequestException("Only the invited user can reject this invitation");
        }
        if (!"pending_user".equals(invitation.getStatus())) {
            throw new BadRequestException("Invitation is not pending your response");
        }

        invitation.setStatus("declined_by_user");
        invitation.setRejectReason(reason);
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
        Group group = groupRepository.findById(groupId).orElse(null);
        Page<GroupInvitation> invitationsPage =
                invitationRepository.findByGroupIdAndStatus(groupId, "pending_owner", pageable);
        return mapInvitationPage(invitationsPage, group);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<GroupInvitationResponse> getDeclinedInvitations(Long groupId, UUID ownerId, Pageable pageable) {
        if (!groupRepository.existsById(groupId)) {
            throw new NotFoundException("Group not found");
        }
        if (!canManageMembers(groupId, ownerId)) {
            throw new BadRequestException("Only group owner or admin can view declined invitations");
        }
        Group group = groupRepository.findById(groupId).orElse(null);
        Page<GroupInvitation> invitationsPage =
                invitationRepository.findByGroupIdAndStatus(groupId, "declined_by_user", pageable);
        return mapInvitationPage(invitationsPage, group);
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
        Map<Long, Group> groupsById = groupIds.isEmpty()
                ? Map.of()
                : groupRepository.findAllById(groupIds).stream()
                        .collect(Collectors.toMap(Group::getId, group -> group));

        Map<Long, List<UUID>> coInviterIdsByInvitation = buildCoInviterIdsByInvitation(invitationsPage.getContent());
        Map<UUID, UserResponse> usersById =
                buildInviterInviteeUserMap(invitationsPage.getContent(), coInviterIdsByInvitation);

        return invitationsPage.map(inv -> mapToGroupInvitationResponse(
                inv, groupsById.get(inv.getGroupId()), usersById, coInviterIdsByInvitation));
    }

    private static final List<String> SENT_INVITATION_IN_FLIGHT_STATUSES = List.of("pending_owner", "pending_user");

    /**
     * Returns both {@code pending_owner} and {@code pending_user} rows for {@code inviterId} in one
     * page — the caller (or {@code GroupInvitationResponse#getStatus()} on each row) tells them
     * apart, so this doesn't need a separate call per status. B14: matches against any recorded
     * co-inviter, not just the row's original/first inviter — a member who joined an
     * already-pending invitation as a co-inviter sees it in their own sent-invitations list too.
     */
    @Override
    @Transactional(readOnly = true)
    public Page<GroupInvitationResponse> getMemberSentInvitations(Long groupId, UUID inviterId, Pageable pageable) {
        if (!groupRepository.existsById(groupId)) {
            throw new NotFoundException("Group not found");
        }
        if (!isGroupMember(groupId, inviterId)) {
            throw new BadRequestException("Only group members can view their sent invitations");
        }
        Group group = groupRepository.findById(groupId).orElse(null);
        Page<GroupInvitation> invitationsPage = invitationRepository.findByGroupIdAndCoInviterIdAndStatusIn(
                groupId, inviterId, SENT_INVITATION_IN_FLIGHT_STATUSES, pageable);
        return mapInvitationPage(invitationsPage, group);
    }

    /**
     * Shared by every invitation-listing method whose rows all belong to the same group (so one
     * {@code Group} covers the whole page) — batches the co-inviter lookup and user resolution
     * once per page rather than once per row (no N+1).
     */
    private Page<GroupInvitationResponse> mapInvitationPage(Page<GroupInvitation> invitationsPage, Group group) {
        Map<Long, List<UUID>> coInviterIdsByInvitation = buildCoInviterIdsByInvitation(invitationsPage.getContent());
        Map<UUID, UserResponse> usersById =
                buildInviterInviteeUserMap(invitationsPage.getContent(), coInviterIdsByInvitation);
        return invitationsPage.map(inv -> mapToGroupInvitationResponse(inv, group, usersById, coInviterIdsByInvitation));
    }

    /**
     * The inviter cancels their own invitation while it's still {@code pending_owner} — same
     * ownership-check + status-check + hard-delete shape as {@link #cancelJoinRequest}, no
     * "cancelled" status literal introduced.
     */
    @Override
    @Transactional
    public void cancelInvitation(Long invitationId, UUID callerId) {
        GroupInvitation invitation = invitationRepository.findById(invitationId)
                .orElseThrow(() -> new NotFoundException("Invitation not found"));

        // B14: any recorded co-inviter can withdraw their own invite, not just the original —
        // withdrawing only removes the caller's own group_invitation_inviters row; the invitation
        // itself is only deleted once its last co-inviter withdraws.
        if (!invitationInviterRepository.existsByInvitationIdAndInviterId(invitationId, callerId)) {
            throw new BadRequestException("You can only cancel your own invitation");
        }

        Group group = groupRepository.findById(invitation.getGroupId())
                .orElseThrow(() -> new NotFoundException("Group not found"));
        if (!Boolean.TRUE.equals(group.getIsActive())) {
            throw new BadRequestException("Group no longer exists");
        }

        if (!"pending_owner".equals(invitation.getStatus())) {
            throw new BadRequestException("Invitation is not pending owner approval");
        }

        invitationInviterRepository.deleteByInvitationIdAndInviterId(invitationId, callerId);
        long remainingCoInviters = invitationInviterRepository.countByInvitationId(invitationId);
        if (remainingCoInviters == 0) {
            invitationRepository.deleteById(invitationId);
            log.info("Cancelled invitation {} by user {} (last co-inviter, invitation deleted)", invitationId, callerId);
        } else {
            log.info("User {} withdrew as co-inviter from invitation {} ({} co-inviter(s) remain)",
                    callerId, invitationId, remainingCoInviters);
        }
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

    /**
     * B14: one query for every invitation id in the batch, grouped in memory — the N+1-safe way to
     * resolve "who has co-invited this person" across a whole {@code Page}, rather than one query
     * per row. Preserves {@code created_at} order (oldest-first) within each invitation's list.
     */
    private Map<Long, List<UUID>> buildCoInviterIdsByInvitation(List<GroupInvitation> invitations) {
        List<Long> invitationIds = invitations.stream()
                .map(GroupInvitation::getId)
                .distinct()
                .collect(Collectors.toList());
        if (invitationIds.isEmpty()) {
            return Map.of();
        }
        Map<Long, List<UUID>> result = new LinkedHashMap<>();
        for (GroupInvitationInviter row : invitationInviterRepository.findByInvitationIdInOrderByCreatedAt(invitationIds)) {
            result.computeIfAbsent(row.getInvitationId(), key -> new ArrayList<>()).add(row.getInviterId());
        }
        return result;
    }

    private Map<UUID, UserResponse> buildInviterInviteeUserMap(List<GroupInvitation> invitations,
                                                                Map<Long, List<UUID>> coInviterIdsByInvitation) {
        List<UUID> userIds = new ArrayList<>();
        for (GroupInvitation invitation : invitations) {
            userIds.add(invitation.getInviterId());
            userIds.add(invitation.getInviteeId());
        }
        coInviterIdsByInvitation.values().forEach(userIds::addAll);
        List<UUID> distinctUserIds = userIds.stream().distinct().collect(Collectors.toList());
        return distinctUserIds.isEmpty() ? Map.of() : userService.getUsersByIds(distinctUserIds);
    }

    /**
     * Single-invitation counterpart of {@link #mapInvitationPage} for call sites returning one
     * {@code GroupInvitationResponse} rather than a {@code Page} ({@link #createInvitation}'s two
     * return paths, {@link #createSelfApprovedInvitation}) — same batching helpers, sized to one.
     */
    private GroupInvitationResponse mapSingleInvitationResponse(GroupInvitation invitation, Group group) {
        Map<Long, List<UUID>> coInviterIdsByInvitation = buildCoInviterIdsByInvitation(List.of(invitation));
        Map<UUID, UserResponse> usersById = buildInviterInviteeUserMap(List.of(invitation), coInviterIdsByInvitation);
        return mapToGroupInvitationResponse(invitation, group, usersById, coInviterIdsByInvitation);
    }

    /**
     * B15: takes the already-loaded {@code Group} (rather than just its name) so {@code sportId}
     * can be read off the same row with no extra query — {@code Group.sportId} is required
     * (non-null) on every group, so a null here only ever means the {@code group} lookup itself
     * missed (defensive, same "Unknown Group" convention as the name fallback).
     */
    private GroupInvitationResponse mapToGroupInvitationResponse(GroupInvitation invitation, Group group,
                                                                  Map<UUID, UserResponse> usersById,
                                                                  Map<Long, List<UUID>> coInviterIdsByInvitation) {
        String groupName = group != null ? group.getGroupName() : "Unknown Group";
        Long sportId = group != null ? group.getSportId() : null;
        UserResponse inviter = usersById.get(invitation.getInviterId());
        UserResponse invitee = usersById.get(invitation.getInviteeId());
        String inviterFullName = inviter != null ? inviter.getFullName() : "Unknown User";
        String inviteeFullName = invitee != null ? invitee.getFullName() : "Unknown User";

        // B14: falls back to just the legacy single inviterId if this invitation predates the
        // co-inviter table somehow being empty for it (shouldn't happen post-migration/backfill,
        // but keeps this mapper defensive rather than emitting an empty list).
        List<UUID> coInviterIds = coInviterIdsByInvitation.getOrDefault(invitation.getId(), List.of(invitation.getInviterId()));
        List<String> inviterFullNames = coInviterIds.stream()
                .map(id -> {
                    UserResponse user = usersById.get(id);
                    return user != null ? user.getFullName() : "Unknown User";
                })
                .collect(Collectors.toList());

        return GroupInvitationResponse.builder()
                .id(invitation.getId())
                .groupId(invitation.getGroupId())
                .groupName(groupName)
                .sportId(sportId)
                .inviterId(invitation.getInviterId())
                .inviterFullName(inviterFullName)
                .inviterFullNames(inviterFullNames)
                .inviteeId(invitation.getInviteeId())
                .inviteeFullName(inviteeFullName)
                .status(invitation.getStatus())
                .reviewedBy(invitation.getReviewedBy())
                .reviewedAt(invitation.getReviewedAt())
                .rejectReason(invitation.getRejectReason())
                .createdAt(invitation.getCreatedAt())
                .updatedAt(invitation.getUpdatedAt())
                .build();
    }

    private GroupSettingsResponse mapToGroupSettingsResponse(GroupSettings settings) {
        GroupType groupType = groupTypeRepository.findById(settings.getGroupTypeId())
                .orElseThrow(() -> new NotFoundException("Group type not found"));
        return GroupSettingsResponse.builder()
                .id(settings.getId())
                .groupId(settings.getGroupId())
                .allowMemberPosts(settings.getAllowMemberPosts())
                .requirePostApproval(settings.getRequirePostApproval())
                .allowMemberInvites(settings.getAllowMemberInvites())
                .groupTypeName(groupType.getTypeName())
                .maxMembers(groupType.getMaxMembers())
                .createdAt(settings.getCreatedAt())
                .updatedAt(settings.getUpdatedAt())
                .build();
    }

    /**
     * Rejects joins/adds once a group is at its type's member cap. Called from every path that
     * inserts a {@code GroupMember} row (B7): addMember, acceptJoinRequest, acceptInvitation.
     *
     * <p>Row-locks the group's settings ({@code findByGroupIdForUpdate}, {@code SELECT ... FOR
     * UPDATE}) for the rest of the caller's transaction so two concurrent calls for the same group
     * — across instances or threads — can't both read the same pre-insert count and both pass: the
     * second caller blocks here until the first commits (or rolls back) its insert, then re-reads
     * the now-current count.
     */
    private void enforceMemberCapacity(Long groupId) {
        GroupSettings settings = groupSettingsRepository.findByGroupIdForUpdate(groupId)
                .orElseThrow(() -> new NotFoundException("Group settings not found"));
        checkMemberCapacity(groupId, settings);
    }

    /**
     * Early, unlocked capacity check for {@code createJoinRequest}/{@code createInvitation}: fails
     * fast with a clear "group is full" error instead of letting a request/invitation sit around
     * only to be rejected later at accept-time by {@link #enforceMemberCapacity}, which remains the
     * authoritative, lock-protected guard against the group actually going over capacity.
     */
    private void checkMemberCapacityNotExceeded(Long groupId) {
        GroupSettings settings = groupSettingsRepository.findByGroupId(groupId)
                .orElseThrow(() -> new NotFoundException("Group settings not found"));
        checkMemberCapacity(groupId, settings);
    }

    private void checkMemberCapacity(Long groupId, GroupSettings settings) {
        GroupType groupType = groupTypeRepository.findById(settings.getGroupTypeId())
                .orElseThrow(() -> new NotFoundException("Group type not found"));
        long currentMembers = groupMemberRepository.countByGroupId(groupId);
        if (currentMembers >= groupType.getMaxMembers()) {
            throw new BadRequestException("Group has reached its maximum member capacity of "
                    + groupType.getMaxMembers());
        }
    }

    /**
     * Resolves the group's current owner's user id (B9) — queries the live {@code GroupMember}
     * row holding the {@code group_owner} role rather than {@code Group.createdBy}, since
     * ownership can move via {@link #transferOwnership}. Every group has exactly one owner by
     * construction (business rule 1 in this module's CLAUDE.md), so a missing owner row indicates
     * a data invariant violation rather than a normal "not found" case.
     */
    private UUID resolveGroupOwnerId(Long groupId) {
        GroupRole ownerRole = groupRoleRepository.findByRoleName("group_owner")
                .orElseThrow(() -> new NotFoundException("Group owner role not found"));
        return groupMemberRepository.findByGroupIdAndRoleId(groupId, ownerRole.getId()).stream()
                .findFirst()
                .map(GroupMember::getUserId)
                .orElseThrow(() -> new NotFoundException("Group owner not found"));
    }

    /**
     * Creates the {@code GROUP_SYSTEM} welcome post (B9) for a newly inserted {@code GroupMember}
     * row, authored by the group's current owner. Pass {@code inviterId = null} for a
     * self-requested join (nothing to credit); pass the inviter's id when the join came through
     * an invitation (including an owner/admin's {@code addMember}-initiated one) to mention them
     * by name.
     */
    private void postWelcomeMessage(Long groupId, UUID newMemberId, UUID inviterId) {
        List<UUID> idsToResolve = inviterId != null
                ? List.of(newMemberId, inviterId)
                : List.of(newMemberId);
        Map<UUID, UserResponse> usersById = userService.getUsersByIds(idsToResolve);
        String newMemberName = usersById.get(newMemberId).getFullName();

        String content = inviterId != null
                ? newMemberName + " joined the group — invited by " + usersById.get(inviterId).getFullName() + " 👋"
                : newMemberName + " joined the group 👋";

        postService.createSystemPost(groupId, resolveGroupOwnerId(groupId), content);
    }

    /**
     * Creates the {@code GroupMember} row and posts the welcome message for a newly accepted
     * membership — the shared final step behind {@code acceptJoinRequest}, {@code
     * acceptInvitation}, and B11's join-request/invitation reconciliation short-circuits
     * ({@link #acceptJoinRequestAsSideEffect}, {@link #acceptInvitationAsJoinRequest}). Enforces
     * the row-locked member-capacity guard ({@link #enforceMemberCapacity}) before inserting,
     * exactly like the two pre-existing accept paths did individually.
     */
    private void finalizeMembership(Long groupId, UUID userId, UUID creditedInviterId) {
        enforceMemberCapacity(groupId);

        GroupRole memberRole = groupRoleRepository.findByRoleName("group_member")
                .orElseThrow(() -> new NotFoundException("Member role not found"));

        GroupMember member = GroupMember.builder()
                .groupId(groupId)
                .userId(userId)
                .roleId(memberRole.getId())
                .build();
        groupMemberRepository.save(member);

        postWelcomeMessage(groupId, userId, creditedInviterId);
    }
}
