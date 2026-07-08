package com.sportconnect.user.controller;

import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.common.auth.SecurityUtils;
import com.sportconnect.user.api.dto.FriendRequestResponse;
import com.sportconnect.user.api.dto.SendFriendRequestRequest;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.service.UserFriendService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/users/friends")
@RequiredArgsConstructor
@Tag(name = "Friends", description = "Friend requests and the caller's friend list.")
public class UserFriendController {

    private final UserFriendService userFriendService;

    @Operation(summary = "Send a friend request")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Request sent"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Sent to self, already friends, or a request is already pending"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Receiver not found")
    })
    @PostMapping("/requests")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> sendFriendRequest(
            @Valid @RequestBody SendFriendRequestRequest request,
            Authentication authentication) {
        UUID senderId = SecurityUtils.extractUserId(authentication);
        userFriendService.sendFriendRequest(senderId, request.getReceiverId());
        return ResponseEntity.ok(ApiResponse.success("Friend request sent", null));
    }

    @Operation(summary = "Accept a friend request", description = "The request must have been sent to the caller — a request id that exists but wasn't addressed to the caller 404s (not 403), since the lookup is scoped by receiver id.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Request accepted"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Request is no longer pending"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Request not found (or not addressed to the caller)")
    })
    @PutMapping("/requests/{requestId}/accept")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> acceptFriendRequest(
            @PathVariable UUID requestId,
            Authentication authentication) {
        UUID receiverId = SecurityUtils.extractUserId(authentication);
        userFriendService.acceptFriendRequest(requestId, receiverId);
        return ResponseEntity.ok(ApiResponse.success("Friend request accepted", null));
    }

    @Operation(summary = "Decline a friend request", description = "Same ownership-by-lookup semantics as accept.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Request declined"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Request is no longer pending"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Request not found (or not addressed to the caller)")
    })
    @PutMapping("/requests/{requestId}/decline")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> declineFriendRequest(
            @PathVariable UUID requestId,
            Authentication authentication) {
        UUID receiverId = SecurityUtils.extractUserId(authentication);
        userFriendService.declineFriendRequest(requestId, receiverId);
        return ResponseEntity.ok(ApiResponse.success("Friend request declined", null));
    }

    @Operation(summary = "Cancel a friend request the caller sent", description = "Ownership scoped by sender id, same 404-not-403 semantics as accept/decline.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Request cancelled"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Request is no longer pending"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Request not found (or not sent by the caller)")
    })
    @DeleteMapping("/requests/{requestId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> cancelFriendRequest(
            @PathVariable UUID requestId,
            Authentication authentication) {
        UUID senderId = SecurityUtils.extractUserId(authentication);
        userFriendService.cancelFriendRequest(requestId, senderId);
        return ResponseEntity.ok(ApiResponse.success("Friend request cancelled", null));
    }

    @Operation(summary = "Remove a friend")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Friend removed"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not currently friends with this user"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @DeleteMapping("/{friendId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> removeFriend(
            @PathVariable UUID friendId,
            Authentication authentication) {
        UUID userId = SecurityUtils.extractUserId(authentication);
        userFriendService.removeFriend(userId, friendId);
        return ResponseEntity.ok(ApiResponse.success("Friend removed", null));
    }

    @Operation(summary = "List the caller's friends")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Friends (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<List<UserResponse>>> getFriends(Authentication authentication) {
        UUID userId = SecurityUtils.extractUserId(authentication);
        List<UserResponse> friends = userFriendService.getFriends(userId);
        return ResponseEntity.ok(ApiResponse.success("Friends retrieved", friends));
    }

    @Operation(summary = "List pending friend requests the caller received")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Pending received requests (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/requests/received")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<List<FriendRequestResponse>>> getPendingReceivedRequests(
            Authentication authentication) {
        UUID userId = SecurityUtils.extractUserId(authentication);
        List<FriendRequestResponse> requests = userFriendService.getPendingReceivedRequests(userId);
        return ResponseEntity.ok(ApiResponse.success("Pending received requests retrieved", requests));
    }

    @Operation(summary = "List pending friend requests the caller sent")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Pending sent requests (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/requests/sent")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<List<FriendRequestResponse>>> getPendingSentRequests(
            Authentication authentication) {
        UUID userId = SecurityUtils.extractUserId(authentication);
        List<FriendRequestResponse> requests = userFriendService.getPendingSentRequests(userId);
        return ResponseEntity.ok(ApiResponse.success("Pending sent requests retrieved", requests));
    }
}
