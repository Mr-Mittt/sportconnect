package com.sportconnect.group.api.service;

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
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import java.util.List;
import java.util.UUID;

public interface GroupService {

    // Group CRUD Operations
    GroupResponse createGroup(UUID userId, CreateGroupRequest request);
    
    /**
     * Returns full group details, including the top-3 pinned posts. Public groups are visible to
     * any caller. Private groups are visible only to members (owner/admin/member) — a non-member
     * or {@code null} {@code currentUserId} gets a {@code BadRequestException} rather than the
     * group's details, so callers can't read a private group's content just by knowing its id.
     */
    GroupResponse getGroup(Long groupId, UUID currentUserId);
    
    /**
     * Returns the groups {@code userId} is a member of. Ordering is whatever {@code pageable}
     * requests (no default sort applied). Only active (non-deleted) groups are included — a
     * membership row left over from a since-deleted group is silently excluded rather than
     * surfaced as an error.
     */
    Page<GroupResponse> getUserGroups(UUID userId, Pageable pageable);
    
    Page<GroupSearchResponse> getPublicGroups(UUID currentUserId, Long sportId, String keyword, Pageable pageable);
    
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

    void cancelJoinRequest(Long requestId, UUID callerId);

    // Group Info
    GroupInfoResponse getGroupInfo(Long groupId);

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

    // Pinned Posts
    PinnedPostResponse pinPost(Long groupId, UUID userId, Long postId);

    void unpinPost(Long groupId, UUID userId, Long postId);

    List<PinnedPostResponse> getPinnedPosts(Long groupId, UUID currentUserId);

    // Feed helpers
    List<Long> getGroupIdsBySportProfiles(UUID userId);

    List<Long> getGroupIdsForMember(UUID userId);

    // Invitations
    GroupInvitationResponse createInvitation(Long groupId, UUID inviterId, CreateInvitationRequest request);

    void approveInvitation(Long invitationId, UUID ownerId);

    void declineInvitation(Long invitationId, UUID ownerId);

    void acceptInvitation(Long invitationId, UUID inviteeId);

    void rejectInvitation(Long invitationId, UUID inviteeId);

    Page<GroupInvitationResponse> getGroupInvitations(Long groupId, UUID ownerId, Pageable pageable);

    Page<GroupInvitationResponse> getUserPendingInvitations(UUID userId, Pageable pageable);

    /**
     * Returns invitations {@code inviterId} sent for this group that are still in flight —
     * {@code "pending_owner"} (awaiting owner/admin approval) or {@code "pending_user"} (approved,
     * awaiting the invitee's response) — both statuses in a single page, distinguishable via each
     * row's {@link GroupInvitationResponse#getStatus()}. Terminal statuses (accepted/declined_*)
     * are never included, since a caller paging through their own "still waiting on" list has no
     * use for them here.
     */
    Page<GroupInvitationResponse> getMemberSentInvitations(Long groupId, UUID inviterId, Pageable pageable);
}
