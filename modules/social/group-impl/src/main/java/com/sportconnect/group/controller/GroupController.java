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
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
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

/**
 * All 36 endpoints require authentication ({@code /api/groups/**} is not in {@code SecurityConfig}'s
 * permitAll list, despite a couple of methods here defensively handling a null caller id) — {@code 401}
 * applies uniformly and isn't repeated in every method's Javadoc. Permission/ownership failures across
 * this whole controller are {@code BadRequestException} (400) in the service layer, not {@code
 * ForbiddenException} (403) — verified directly against {@code GroupServiceImpl}, not assumed; documented
 * per-method below to match the actual code.
 */
@RestController
@RequestMapping("/api/groups")
@RequiredArgsConstructor
@Tag(name = "Groups", description = "Group CRUD, membership, join requests, settings, pinned posts, invitations, and permission checks.")
public class GroupController {

    private final GroupService groupService;

    // Group CRUD Operations

    @Operation(summary = "Create a group", description = "The caller must have a sport profile for the group's sport.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Group created"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, name already exists, or no sport profile for this sport"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @PostMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupResponse>> createGroup(
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody CreateGroupRequest request) {
        GroupResponse response = groupService.createGroup(UUID.fromString(userIdStr), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Group created successfully", response));
    }

    @Operation(summary = "Get a group by id", description = "No private-group/membership enforcement yet (tracked as A9) — any authenticated caller can view any active group's full details.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Group found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found")
    })
    @GetMapping("/{groupId}")
    public ResponseEntity<ApiResponse<GroupResponse>> getGroup(
            @PathVariable Long groupId,
            Authentication authentication) {
        GroupResponse response = groupService.getGroup(groupId, SecurityUtils.extractUserId(authentication));
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Operation(summary = "List a user's groups (paginated)")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Groups (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/user/{userId}")
    public ResponseEntity<ApiResponse<Page<GroupResponse>>> getUserGroups(
            @PathVariable UUID userId,
            Pageable pageable) {
        Page<GroupResponse> response = groupService.getUserGroups(userId, pageable);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Operation(summary = "Search public groups", description = "Optional sportId/keyword filters. Member groups sort first when authenticated.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Matching groups (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
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

    @Operation(summary = "Update a group", description = "Owner or admin only. Partial update — only non-null fields are applied.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Group updated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, not owner/admin, or name already exists"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found")
    })
    @PutMapping("/{groupId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupResponse>> updateGroup(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody UpdateGroupRequest request) {
        GroupResponse response = groupService.updateGroup(groupId, UUID.fromString(userIdStr), request);
        return ResponseEntity.ok(ApiResponse.success("Group updated successfully", response));
    }

    @Operation(summary = "Delete a group", description = "Owner only. Soft delete (isActive=false).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Group deleted"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not the group owner"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found")
    })
    @DeleteMapping("/{groupId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> deleteGroup(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.deleteGroup(groupId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.<Void>success("Group deleted successfully", null));
    }

    // Member Management

    @Operation(summary = "Add a member directly", description = "Owner or admin only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Member added"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not owner/admin, or already a member"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found, or roleName doesn't exist")
    })
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

    @Operation(summary = "Remove a member", description = "Owner or admin only. The owner cannot be removed this way.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Member removed"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not owner/admin, or target is the group owner"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found")
    })
    @DeleteMapping("/{groupId}/members/{targetUserId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> removeMember(
            @PathVariable Long groupId,
            @PathVariable UUID targetUserId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.removeMember(groupId, UUID.fromString(userIdStr), targetUserId);
        return ResponseEntity.ok(ApiResponse.<Void>success("Member removed successfully", null));
    }

    @Operation(summary = "Change a member's role", description = "Owner only. The owner's own role can't be changed this way (use transfer-ownership), and the owner role can't be assigned this way either.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Role updated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not the owner, target is the owner, or newRoleName is group_owner"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found, target isn't a member, or newRoleName doesn't exist")
    })
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

    @Operation(summary = "List a group's members (paginated)")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Members"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found")
    })
    @GetMapping("/{groupId}/members")
    public ResponseEntity<ApiResponse<Page<GroupMemberResponse>>> getGroupMembers(
            @PathVariable Long groupId,
            Authentication authentication,
            Pageable pageable) {
        Page<GroupMemberResponse> response = groupService.getGroupMembers(groupId, SecurityUtils.extractUserId(authentication), pageable);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Operation(summary = "Transfer group ownership", description = "Current owner only. The new owner must already be a member; the previous owner becomes an admin.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Ownership transferred"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not the current owner"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found, or newOwnerId isn't a member")
    })
    @PutMapping("/{groupId}/transfer-ownership")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> transferOwnership(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr,
            @RequestParam UUID newOwnerId) {
        groupService.transferOwnership(groupId, UUID.fromString(userIdStr), newOwnerId);
        return ResponseEntity.ok(ApiResponse.<Void>success("Ownership transferred successfully", null));
    }

    @Operation(summary = "Leave a group", description = "The owner must transfer ownership first.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Left the group"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Caller is the owner and hasn't transferred ownership"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found")
    })
    @DeleteMapping("/{groupId}/leave")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> leaveGroup(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.leaveMember(groupId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.<Void>success("Left group successfully", null));
    }

    // Join Request Management

    @Operation(summary = "Request to join a group", description = "Looked up by group name (in the request body), not id.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Request sent"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, already a member, or already has a pending request"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "No group with this name")
    })
    @PostMapping("/join-requests")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<JoinRequestResponse>> createJoinRequest(
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody CreateJoinRequestRequest request) {
        JoinRequestResponse response = groupService.createJoinRequest(UUID.fromString(userIdStr), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Join request sent successfully", response));
    }

    @Operation(summary = "Accept a join request", description = "Owner or admin only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Request accepted"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not owner/admin, or request is no longer pending"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Request not found")
    })
    @PutMapping("/join-requests/{requestId}/accept")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> acceptJoinRequest(
            @PathVariable Long requestId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.acceptJoinRequest(requestId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.<Void>success("Join request accepted", null));
    }

    @Operation(summary = "Decline a join request", description = "Owner or admin only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Request declined"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not owner/admin, or request is no longer pending"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Request not found")
    })
    @PutMapping("/join-requests/{requestId}/decline")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> declineJoinRequest(
            @PathVariable Long requestId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.declineJoinRequest(requestId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.<Void>success("Join request declined", null));
    }

    @Operation(summary = "List a group's pending join requests (paginated)", description = "Owner or admin only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Pending requests"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not owner/admin"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found")
    })
    @GetMapping("/{groupId}/join-requests")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<JoinRequestResponse>>> getGroupJoinRequests(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr,
            Pageable pageable) {
        Page<JoinRequestResponse> response = groupService.getGroupJoinRequests(groupId, UUID.fromString(userIdStr), pageable);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Operation(summary = "List a user's pending join requests (paginated)")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Pending requests (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/join-requests/user/{userId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<JoinRequestResponse>>> getUserJoinRequests(
            @PathVariable UUID userId,
            Pageable pageable) {
        Page<JoinRequestResponse> response = groupService.getUserJoinRequests(userId, pageable);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Operation(summary = "Cancel the caller's own join request")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Request cancelled"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not the requester, group no longer active, or request no longer pending"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Request or group not found")
    })
    @DeleteMapping("/join-requests/{requestId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> cancelJoinRequest(
            @PathVariable Long requestId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.cancelJoinRequest(requestId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.<Void>success("Join request cancelled", null));
    }

    // Group Info

    @Operation(summary = "Get a group's rules and schedule text")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Info found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found")
    })
    @GetMapping("/{groupId}/info")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupInfoResponse>> getGroupInfo(
            @PathVariable Long groupId) {
        GroupInfoResponse response = groupService.getGroupInfo(groupId);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    // Group Settings

    @Operation(summary = "Get a group's settings", description = "Members only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Settings found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not a group member"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found")
    })
    @GetMapping("/{groupId}/settings")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupSettingsResponse>> getGroupSettings(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr) {
        GroupSettingsResponse response = groupService.getGroupSettings(groupId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Operation(summary = "Update a group's settings", description = "Owner only. Partial update — only non-null fields are applied.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Settings updated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, or not the owner"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found")
    })
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

    @Operation(summary = "Pin a post", description = "Owner or admin only. Max 10 pins per group; only GROUP_POST posts belonging to this group can be pinned.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Post pinned"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not owner/admin, pin limit reached, already pinned, post belongs to a different group, or not a GROUP_POST"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group or post not found")
    })
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

    @Operation(summary = "Unpin a post", description = "Owner or admin only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Post unpinned"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not owner/admin"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found")
    })
    @DeleteMapping("/{groupId}/pins/{postId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> unpinPost(
            @PathVariable Long groupId,
            @PathVariable Long postId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.unpinPost(groupId, UUID.fromString(userIdStr), postId);
        return ResponseEntity.ok(ApiResponse.<Void>success("Post unpinned successfully", null));
    }

    @Operation(summary = "List a group's pinned posts", description = "Members only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Pinned posts (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not a group member"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found")
    })
    @GetMapping("/{groupId}/pins")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<List<PinnedPostResponse>>> getPinnedPosts(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr) {
        List<PinnedPostResponse> response = groupService.getPinnedPosts(groupId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    // Invitations

    @Operation(summary = "Invite a friend to the group", description = "Sender must be a group member, must be friends with the invitee, and the group's allowMemberInvites setting must be on. 3-step flow: member invites -> owner approves -> invitee accepts.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Invitation created (or the existing pending one returned, if already invited)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, not a member, invites disabled for this group, invitee already a member, or not friends with the invitee"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found")
    })
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

    @Operation(summary = "Approve a member-sent invitation", description = "Owner or admin only. Moves the invitation to pending_user for the invitee to respond.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Invitation approved"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not owner/admin, or not pending owner approval"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Invitation not found")
    })
    @PutMapping("/invitations/{invitationId}/approve")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> approveInvitation(
            @PathVariable Long invitationId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.approveInvitation(invitationId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.<Void>success("Invitation approved", null));
    }

    @Operation(summary = "Decline a member-sent invitation", description = "Owner or admin only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Invitation declined"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not owner/admin, or not pending owner approval"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Invitation not found")
    })
    @PutMapping("/invitations/{invitationId}/decline")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> declineInvitation(
            @PathVariable Long invitationId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.declineInvitation(invitationId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.<Void>success("Invitation declined", null));
    }

    @Operation(summary = "Accept an owner-approved invitation", description = "Invitee only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Invitation accepted, caller is now a member"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not the invitee, or not pending the invitee's response"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Invitation not found")
    })
    @PutMapping("/invitations/{invitationId}/accept")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> acceptInvitation(
            @PathVariable Long invitationId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.acceptInvitation(invitationId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.<Void>success("Invitation accepted", null));
    }

    @Operation(summary = "Reject an owner-approved invitation", description = "Invitee only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Invitation rejected"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not the invitee, or not pending the invitee's response"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Invitation not found")
    })
    @PutMapping("/invitations/{invitationId}/reject")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> rejectInvitation(
            @PathVariable Long invitationId,
            @AuthenticationPrincipal String userIdStr) {
        groupService.rejectInvitation(invitationId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.<Void>success("Invitation rejected", null));
    }

    @Operation(summary = "List a group's pending invitations awaiting owner approval (paginated)", description = "Owner or admin only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Pending invitations"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not owner/admin"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found")
    })
    @GetMapping("/{groupId}/invitations")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<GroupInvitationResponse>>> getGroupInvitations(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr,
            Pageable pageable) {
        Page<GroupInvitationResponse> response = groupService.getGroupInvitations(groupId, UUID.fromString(userIdStr), pageable);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Operation(summary = "List the caller's pending invitations awaiting their response (paginated)")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Pending invitations (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/invitations/user")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<GroupInvitationResponse>>> getUserPendingInvitations(
            @AuthenticationPrincipal String userIdStr,
            Pageable pageable) {
        Page<GroupInvitationResponse> response = groupService.getUserPendingInvitations(UUID.fromString(userIdStr), pageable);
        return ResponseEntity.ok(ApiResponse.success(response));
    }

    @Operation(summary = "List invitations the caller sent for this group (paginated)", description = "Group members only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Sent invitations (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not a group member"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found")
    })
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

    @Operation(summary = "Check whether the caller owns the group", description = "Never 404s — a nonexistent group or non-membership both just resolve to false.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "true/false"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/{groupId}/permissions/is-owner")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Boolean>> isGroupOwner(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr) {
        boolean isOwner = groupService.isGroupOwner(groupId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success(isOwner));
    }

    @Operation(summary = "Check whether the caller admins the group", description = "Never 404s, same as is-owner.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "true/false"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/{groupId}/permissions/is-admin")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Boolean>> isGroupAdmin(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr) {
        boolean isAdmin = groupService.isGroupAdmin(groupId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success(isAdmin));
    }

    @Operation(summary = "Check whether the caller belongs to the group", description = "Never 404s, same as is-owner.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "true/false"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/{groupId}/permissions/is-member")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Boolean>> isGroupMember(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr) {
        boolean isMember = groupService.isGroupMember(groupId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success(isMember));
    }

    @Operation(summary = "Get the caller's role name in the group", description = "Returns null (never 404s) if the caller isn't a member or the group doesn't exist.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Role name, or null if not a member"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/{groupId}/permissions/user-role")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<String>> getUserRole(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr) {
        String role = groupService.getUserRoleInGroup(groupId, UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success(role));
    }
}
