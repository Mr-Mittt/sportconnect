package com.sportconnect.group.controller;

import com.sportconnect.common.auth.SecurityUtils;
import com.sportconnect.common.dto.ApiResponse;
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
import com.sportconnect.group.api.dto.PinPostRequest;
import com.sportconnect.group.api.dto.PinnedPostResponse;
import com.sportconnect.group.api.dto.UpdateGroupRequest;
import com.sportconnect.group.api.dto.UpdateGroupSettingsRequest;
import com.sportconnect.group.api.service.GroupService;
import java.util.List;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/groups")
@RequiredArgsConstructor
public class GroupController {

    private final GroupService groupService;

    // Group CRUD Operations

    @PostMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupResponse>> createGroup(
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody CreateGroupRequest request) {
        GroupResponse response = groupService.createGroup(UUID.fromString(userIdStr), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Group created successfully", response));
    }

    @GetMapping("/{groupId}")
    public ResponseEntity<ApiResponse<GroupResponse>> getGroup(
            @PathVariable Long groupId,
            Authentication authentication) {
        GroupResponse response = groupService.getGroup(groupId, SecurityUtils.extractUserId(authentication));
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/user/{userId}")
    public ResponseEntity<ApiResponse<Page<GroupResponse>>> getUserGroups(
            @PathVariable UUID userId,
            Pageable pageable) {
        Page<GroupResponse> response = groupService.getUserGroups(userId, pageable);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/public")
    public ResponseEntity<ApiResponse<Page<GroupSearchResponse>>> getPublicGroups(
            @AuthenticationPrincipal String userIdStr,
            @RequestParam(required = false) Long sportId,
            @RequestParam(required = false) String keyword,
            Pageable pageable) {
        UUID currentUserId = userIdStr != null ? UUID.fromString(userIdStr) : null;
        Page<GroupSearchResponse> response = groupService.getPublicGroups(currentUserId, sportId, keyword, pageable);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PutMapping("/{groupId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupResponse>> updateGroup(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody UpdateGroupRequest request) {
        GroupResponse response = groupService.updateGroup(groupId, UUID.fromString(userIdStr), request);
        return ResponseEntity.ok(ApiResponse.success("Group updated successfully", response));
    }

    @DeleteMapping("/{groupId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> deleteGroup(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.deleteGroup(groupId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.<Void>success("Group deleted successfully", null));
    }

    // Member Management

    @PostMapping("/{groupId}/members")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> addMember(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr,
            @RequestParam UUID targetUserId,
            @RequestParam String roleName) {
        groupService.addMember(groupId, UUID.fromString(userIdStr), targetUserId, roleName);
        return ResponseEntity.ok(ApiResponse.<Void>success("Member added successfully", null));
    }

    @DeleteMapping("/{groupId}/members/{targetUserId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> removeMember(
            @PathVariable Long groupId,
            @PathVariable UUID targetUserId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.removeMember(groupId, UUID.fromString(userIdStr), targetUserId);
        return ResponseEntity.ok(ApiResponse.<Void>success("Member removed successfully", null));
    }

    @PutMapping("/{groupId}/members/{targetUserId}/role")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> updateMemberRole(
            @PathVariable Long groupId,
            @PathVariable UUID targetUserId,
            @AuthenticationPrincipal String userIdStr,
            @RequestParam String newRoleName) {
        groupService.updateMemberRole(groupId, UUID.fromString(userIdStr), targetUserId, newRoleName);
        return ResponseEntity.ok(ApiResponse.<Void>success("Member role updated successfully", null));
    }

    @GetMapping("/{groupId}/members")
    public ResponseEntity<ApiResponse<Page<GroupMemberResponse>>> getGroupMembers(
            @PathVariable Long groupId,
            Authentication authentication,
            Pageable pageable) {
        Page<GroupMemberResponse> response = groupService.getGroupMembers(groupId, SecurityUtils.extractUserId(authentication), pageable);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PutMapping("/{groupId}/transfer-ownership")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> transferOwnership(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr,
            @RequestParam UUID newOwnerId) {
        groupService.transferOwnership(groupId, UUID.fromString(userIdStr), newOwnerId);
        return ResponseEntity.ok(ApiResponse.<Void>success("Ownership transferred successfully", null));
    }

    @DeleteMapping("/{groupId}/leave")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> leaveGroup(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.leaveMember(groupId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.<Void>success("Left group successfully", null));
    }

    // Join Request Management

    @PostMapping("/join-requests")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<JoinRequestResponse>> createJoinRequest(
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody CreateJoinRequestRequest request) {
        JoinRequestResponse response = groupService.createJoinRequest(UUID.fromString(userIdStr), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Join request sent successfully", response));
    }

    @PutMapping("/join-requests/{requestId}/accept")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> acceptJoinRequest(
            @PathVariable Long requestId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.acceptJoinRequest(requestId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.<Void>success("Join request accepted", null));
    }

    @PutMapping("/join-requests/{requestId}/decline")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> declineJoinRequest(
            @PathVariable Long requestId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.declineJoinRequest(requestId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.<Void>success("Join request declined", null));
    }

    @GetMapping("/{groupId}/join-requests")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<JoinRequestResponse>>> getGroupJoinRequests(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr,
            Pageable pageable) {
        Page<JoinRequestResponse> response = groupService.getGroupJoinRequests(groupId, UUID.fromString(userIdStr), pageable);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/join-requests/user/{userId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<JoinRequestResponse>>> getUserJoinRequests(
            @PathVariable UUID userId,
            Pageable pageable) {
        Page<JoinRequestResponse> response = groupService.getUserJoinRequests(userId, pageable);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @DeleteMapping("/join-requests/{requestId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> cancelJoinRequest(
            @PathVariable Long requestId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.cancelJoinRequest(requestId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.<Void>success("Join request cancelled", null));
    }

    // Group Info

    @GetMapping("/{groupId}/info")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupInfoResponse>> getGroupInfo(
            @PathVariable Long groupId) {
        GroupInfoResponse response = groupService.getGroupInfo(groupId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    // Group Settings

    @GetMapping("/{groupId}/settings")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupSettingsResponse>> getGroupSettings(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr) {
        GroupSettingsResponse response = groupService.getGroupSettings(groupId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PutMapping("/{groupId}/settings")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupSettingsResponse>> updateGroupSettings(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody UpdateGroupSettingsRequest request) {
        GroupSettingsResponse response = groupService.updateGroupSettings(groupId, UUID.fromString(userIdStr), request);
        return ResponseEntity.ok(ApiResponse.success("Settings updated successfully", response));
    }

    // Pinned Posts

    @PostMapping("/{groupId}/pins")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<PinnedPostResponse>> pinPost(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody PinPostRequest request) {
        PinnedPostResponse response = groupService.pinPost(groupId, UUID.fromString(userIdStr), request.getPostId());
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Post pinned successfully", response));
    }

    @DeleteMapping("/{groupId}/pins/{postId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> unpinPost(
            @PathVariable Long groupId,
            @PathVariable Long postId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.unpinPost(groupId, UUID.fromString(userIdStr), postId);
        return ResponseEntity.ok(ApiResponse.<Void>success("Post unpinned successfully", null));
    }

    @GetMapping("/{groupId}/pins")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<List<PinnedPostResponse>>> getPinnedPosts(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr) {
        List<PinnedPostResponse> response = groupService.getPinnedPosts(groupId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    // Invitations

    @PostMapping("/{groupId}/invitations")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupInvitationResponse>> createInvitation(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody CreateInvitationRequest request) {
        GroupInvitationResponse response = groupService.createInvitation(groupId, UUID.fromString(userIdStr), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Invitation sent successfully", response));
    }

    @PutMapping("/invitations/{invitationId}/approve")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> approveInvitation(
            @PathVariable Long invitationId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.approveInvitation(invitationId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.<Void>success("Invitation approved", null));
    }

    @PutMapping("/invitations/{invitationId}/decline")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> declineInvitation(
            @PathVariable Long invitationId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.declineInvitation(invitationId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.<Void>success("Invitation declined", null));
    }

    @PutMapping("/invitations/{invitationId}/accept")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> acceptInvitation(
            @PathVariable Long invitationId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.acceptInvitation(invitationId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.<Void>success("Invitation accepted", null));
    }

    @PutMapping("/invitations/{invitationId}/reject")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> rejectInvitation(
            @PathVariable Long invitationId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.rejectInvitation(invitationId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.<Void>success("Invitation rejected", null));
    }

    @GetMapping("/{groupId}/invitations")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<GroupInvitationResponse>>> getGroupInvitations(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr,
            Pageable pageable) {
        Page<GroupInvitationResponse> response = groupService.getGroupInvitations(groupId, UUID.fromString(userIdStr), pageable);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/invitations/user")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<GroupInvitationResponse>>> getUserPendingInvitations(
            @AuthenticationPrincipal String userIdStr,
            Pageable pageable) {
        Page<GroupInvitationResponse> response = groupService.getUserPendingInvitations(UUID.fromString(userIdStr), pageable);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @GetMapping("/{groupId}/invitations/sent")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<GroupInvitationResponse>>> getMemberSentInvitations(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr,
            Pageable pageable) {
        Page<GroupInvitationResponse> response = groupService.getMemberSentInvitations(groupId, UUID.fromString(userIdStr), pageable);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    // Permission Checks

    @GetMapping("/{groupId}/permissions/is-owner")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Boolean>> isGroupOwner(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr) {
        boolean isOwner = groupService.isGroupOwner(groupId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success(isOwner));
    }

    @GetMapping("/{groupId}/permissions/is-admin")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Boolean>> isGroupAdmin(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr) {
        boolean isAdmin = groupService.isGroupAdmin(groupId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success(isAdmin));
    }

    @GetMapping("/{groupId}/permissions/is-member")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Boolean>> isGroupMember(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr) {
        boolean isMember = groupService.isGroupMember(groupId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success(isMember));
    }

    @GetMapping("/{groupId}/permissions/user-role")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<String>> getUserRole(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr) {
        String role = groupService.getUserRoleInGroup(groupId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success(role));
    }
}
