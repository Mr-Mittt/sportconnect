package com.sportconnect.group.api.service;

import com.sportconnect.group.api.dto.*;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.UUID;

public interface GroupService {

    // Group CRUD Operations
    GroupResponse createGroup(UUID userId, CreateGroupRequest request);
    
    GroupResponse getGroup(Long groupId, UUID currentUserId);
    
    Page<GroupResponse> getUserGroups(UUID userId, Pageable pageable);
    
    Page<GroupResponse> getPublicGroups(Pageable pageable);
    
    GroupResponse updateGroup(Long groupId, UUID userId, UpdateGroupRequest request);
    
    void deleteGroup(Long groupId, UUID userId);

    // Member Management
    void addMember(Long groupId, UUID adminUserId, UUID targetUserId, String roleName);
    
    void removeMember(Long groupId, UUID adminUserId, UUID targetUserId);
    
    void updateMemberRole(Long groupId, UUID adminUserId, UUID targetUserId, String newRoleName);
    
    Page<GroupMemberResponse> getGroupMembers(Long groupId, UUID currentUserId, Pageable pageable);
    
    void transferOwnership(Long groupId, UUID currentOwnerId, UUID newOwnerId);
    
    void leaveMember(Long groupId, UUID userId);

    // Join Request Management
    JoinRequestResponse createJoinRequest(UUID userId, CreateJoinRequestRequest request);
    
    void acceptJoinRequest(Long requestId, UUID adminUserId);
    
    void declineJoinRequest(Long requestId, UUID adminUserId);
    
    Page<JoinRequestResponse> getGroupJoinRequests(Long groupId, UUID adminUserId, Pageable pageable);
    
    Page<JoinRequestResponse> getUserJoinRequests(UUID userId, Pageable pageable);

    // Group Settings
    GroupSettingsResponse getGroupSettings(Long groupId, UUID userId);
    
    GroupSettingsResponse updateGroupSettings(Long groupId, UUID userId, UpdateGroupSettingsRequest request);

    // Permission Checks
    boolean isGroupOwner(Long groupId, UUID userId);
    
    boolean isGroupAdmin(Long groupId, UUID userId);
    
    boolean isGroupMember(Long groupId, UUID userId);
    
    boolean canManageMembers(Long groupId, UUID userId);
    
    boolean canManagePosts(Long groupId, UUID userId);
    
    String getUserRoleInGroup(Long groupId, UUID userId);
}
