package com.sportconnect.group.controller;

import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.group.api.dto.*;
import com.sportconnect.group.api.service.GroupService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

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
            @RequestParam UUID userId,
            @Valid @RequestBody CreateGroupRequest request) {
        GroupResponse response = groupService.createGroup(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Group created successfully", response));
    }

    @GetMapping("/{groupId}")
    public ResponseEntity<ApiResponse<GroupResponse>> getGroup(
            @PathVariable Long groupId,
            @RequestParam(required = false) UUID currentUserId) {
        GroupResponse response = groupService.getGroup(groupId, currentUserId);
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
    public ResponseEntity<ApiResponse<Page<GroupResponse>>> getPublicGroups(Pageable pageable) {
        Page<GroupResponse> response = groupService.getPublicGroups(pageable);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PutMapping("/{groupId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupResponse>> updateGroup(
            @PathVariable Long groupId,
            @RequestParam UUID userId,
            @Valid @RequestBody UpdateGroupRequest request) {
        GroupResponse response = groupService.updateGroup(groupId, userId, request);
        return ResponseEntity.ok(ApiResponse.success("Group updated successfully", response));
    }

    @DeleteMapping("/{groupId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> deleteGroup(
            @PathVariable Long groupId,
            @RequestParam UUID userId) {
        groupService.deleteGroup(groupId, userId);
        return ResponseEntity.ok(ApiResponse.<Void>success("Group deleted successfully", null));
    }

    // Member Management

    @PostMapping("/{groupId}/members")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> addMember(
            @PathVariable Long groupId,
            @RequestParam UUID adminUserId,
            @RequestParam UUID targetUserId,
            @RequestParam String roleName) {
        groupService.addMember(groupId, adminUserId, targetUserId, roleName);
        return ResponseEntity.ok(ApiResponse.<Void>success("Member added successfully", null));
    }

    @DeleteMapping("/{groupId}/members/{targetUserId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> removeMember(
            @PathVariable Long groupId,
            @PathVariable UUID targetUserId,
            @RequestParam UUID adminUserId) {
        groupService.removeMember(groupId, adminUserId, targetUserId);
        return ResponseEntity.ok(ApiResponse.<Void>success("Member removed successfully", null));
    }

    @PutMapping("/{groupId}/members/{targetUserId}/role")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> updateMemberRole(
            @PathVariable Long groupId,
            @PathVariable UUID targetUserId,
            @RequestParam UUID adminUserId,
            @RequestParam String newRoleName) {
        groupService.updateMemberRole(groupId, adminUserId, targetUserId, newRoleName);
        return ResponseEntity.ok(ApiResponse.<Void>success("Member role updated successfully", null));
    }

    @GetMapping("/{groupId}/members")
    public ResponseEntity<ApiResponse<Page<GroupMemberResponse>>> getGroupMembers(
            @PathVariable Long groupId,
            @RequestParam UUID currentUserId,
            Pageable pageable) {
        Page<GroupMemberResponse> response = groupService.getGroupMembers(groupId, currentUserId, pageable);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PutMapping("/{groupId}/transfer-ownership")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> transferOwnership(
            @PathVariable Long groupId,
            @RequestParam UUID currentOwnerId,
            @RequestParam UUID newOwnerId) {
        groupService.transferOwnership(groupId, currentOwnerId, newOwnerId);
        return ResponseEntity.ok(ApiResponse.<Void>success("Ownership transferred successfully", null));
    }

    @DeleteMapping("/{groupId}/leave")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> leaveGroup(
            @PathVariable Long groupId,
            @RequestParam UUID userId) {
        groupService.leaveMember(groupId, userId);
        return ResponseEntity.ok(ApiResponse.<Void>success("Left group successfully", null));
    }

    // Join Request Management

    @PostMapping("/join-requests")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<JoinRequestResponse>> createJoinRequest(
            @RequestParam UUID userId,
            @Valid @RequestBody CreateJoinRequestRequest request) {
        JoinRequestResponse response = groupService.createJoinRequest(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Join request sent successfully", response));
    }

    @PutMapping("/join-requests/{requestId}/accept")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> acceptJoinRequest(
            @PathVariable Long requestId,
            @RequestParam UUID adminUserId) {
        groupService.acceptJoinRequest(requestId, adminUserId);
        return ResponseEntity.ok(ApiResponse.<Void>success("Join request accepted", null));
    }

    @PutMapping("/join-requests/{requestId}/decline")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> declineJoinRequest(
            @PathVariable Long requestId,
            @RequestParam UUID adminUserId) {
        groupService.declineJoinRequest(requestId, adminUserId);
        return ResponseEntity.ok(ApiResponse.<Void>success("Join request declined", null));
    }

    @GetMapping("/{groupId}/join-requests")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<JoinRequestResponse>>> getGroupJoinRequests(
            @PathVariable Long groupId,
            @RequestParam UUID adminUserId,
            Pageable pageable) {
        Page<JoinRequestResponse> response = groupService.getGroupJoinRequests(groupId, adminUserId, pageable);
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

    // Group Settings

    @GetMapping("/{groupId}/settings")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupSettingsResponse>> getGroupSettings(
            @PathVariable Long groupId,
            @RequestParam UUID userId) {
        GroupSettingsResponse response = groupService.getGroupSettings(groupId, userId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @PutMapping("/{groupId}/settings")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupSettingsResponse>> updateGroupSettings(
            @PathVariable Long groupId,
            @RequestParam UUID userId,
            @Valid @RequestBody UpdateGroupSettingsRequest request) {
        GroupSettingsResponse response = groupService.updateGroupSettings(groupId, userId, request);
        return ResponseEntity.ok(ApiResponse.success("Settings updated successfully", response));
    }

    // Permission Checks

    @GetMapping("/{groupId}/permissions/is-owner")
    public ResponseEntity<ApiResponse<Boolean>> isGroupOwner(
            @PathVariable Long groupId,
            @RequestParam UUID userId) {
        boolean isOwner = groupService.isGroupOwner(groupId, userId);
        return ResponseEntity.ok(ApiResponse.success(isOwner));
    }

    @GetMapping("/{groupId}/permissions/is-admin")
    public ResponseEntity<ApiResponse<Boolean>> isGroupAdmin(
            @PathVariable Long groupId,
            @RequestParam UUID userId) {
        boolean isAdmin = groupService.isGroupAdmin(groupId, userId);
        return ResponseEntity.ok(ApiResponse.success(isAdmin));
    }

    @GetMapping("/{groupId}/permissions/is-member")
    public ResponseEntity<ApiResponse<Boolean>> isGroupMember(
            @PathVariable Long groupId,
            @RequestParam UUID userId) {
        boolean isMember = groupService.isGroupMember(groupId, userId);
        return ResponseEntity.ok(ApiResponse.success(isMember));
    }

    @GetMapping("/{groupId}/permissions/user-role")
    public ResponseEntity<ApiResponse<String>> getUserRole(
            @PathVariable Long groupId,
            @RequestParam UUID userId) {
        String role = groupService.getUserRoleInGroup(groupId, userId);
        return ResponseEntity.ok(ApiResponse.success(role));
    }
}
