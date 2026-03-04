package com.sportconnect.group.service;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.NotFoundException;
import com.sportconnect.group.api.dto.*;
import com.sportconnect.group.api.service.GroupService;
import com.sportconnect.group.entity.*;
import com.sportconnect.group.repository.*;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class GroupServiceImpl implements GroupService {

    private final GroupRepository groupRepository;
    private final GroupMemberRepository groupMemberRepository;
    private final GroupJoinRequestRepository joinRequestRepository;
    private final GroupSettingsRepository groupSettingsRepository;
    private final GroupRoleRepository groupRoleRepository;
    private final UserRepository userRepository;

    @Override
    @Transactional
    public GroupResponse createGroup(UUID userId, CreateGroupRequest request) {
        // Validate group name uniqueness
        if (groupRepository.existsByGroupName(request.getGroupName())) {
            throw new BadRequestException("Group name already exists");
        }

        // Create group
        Group group = Group.builder()
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

        return mapToGroupResponse(group, currentUserId);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<GroupResponse> getUserGroups(UUID userId, Pageable pageable) {
        Page<GroupMember> memberships = groupMemberRepository.findByUserId(userId, pageable);
        
        return memberships.map(membership -> {
            Group group = groupRepository.findById(membership.getGroupId())
                    .orElseThrow(() -> new NotFoundException("Group not found"));
            return mapToGroupResponse(group, userId);
        });
    }

    @Override
    @Transactional(readOnly = true)
    public Page<GroupResponse> getPublicGroups(Pageable pageable) {
        return groupRepository.findByIsActiveTrueAndIsPrivateFalse(pageable)
                .map(group -> mapToGroupResponse(group, null));
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

        return groupMemberRepository.findByGroupId(groupId, pageable)
                .map(this::mapToGroupMemberResponse);
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

        return mapToJoinRequestResponse(joinRequest);
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

        return joinRequestRepository.findPendingRequestsByGroupId(groupId, pageable)
                .map(this::mapToJoinRequestResponse);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<JoinRequestResponse> getUserJoinRequests(UUID userId, Pageable pageable) {
        return joinRequestRepository.findByUserIdAndStatus(userId, "pending", pageable)
                .map(this::mapToJoinRequestResponse);
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

    // Helper methods
    private GroupResponse mapToGroupResponse(Group group, UUID currentUserId) {
        String createdByFullName = userRepository.findById(group.getCreatedBy())
                .map(User::getFullName)
                .orElse("Unknown User");

        long memberCount = groupMemberRepository.countByGroupId(group.getId());

        String currentUserRole = currentUserId != null ? getUserRoleInGroup(group.getId(), currentUserId) : null;

        return GroupResponse.builder()
                .id(group.getId())
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

    private GroupMemberResponse mapToGroupMemberResponse(GroupMember member) {
        String userFullName = userRepository.findById(member.getUserId())
                .map(User::getFullName)
                .orElse("Unknown User");

        String userAvatarUrl = userRepository.findById(member.getUserId())
                .map(User::getAvatarUrl)
                .orElse(null);

        GroupRole role = groupRoleRepository.findById(member.getRoleId())
                .orElse(null);

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

    private JoinRequestResponse mapToJoinRequestResponse(GroupJoinRequest request) {
        String groupName = groupRepository.findById(request.getGroupId())
                .map(Group::getGroupName)
                .orElse("Unknown Group");

        String userFullName = userRepository.findById(request.getUserId())
                .map(User::getFullName)
                .orElse("Unknown User");

        String userAvatarUrl = userRepository.findById(request.getUserId())
                .map(User::getAvatarUrl)
                .orElse(null);

        String reviewedByFullName = request.getReviewedBy() != null
                ? userRepository.findById(request.getReviewedBy())
                        .map(User::getFullName)
                        .orElse("Unknown User")
                : null;

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
