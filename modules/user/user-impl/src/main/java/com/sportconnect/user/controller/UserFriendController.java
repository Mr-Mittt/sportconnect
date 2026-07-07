package com.sportconnect.user.controller;

import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.common.auth.SecurityUtils;
import com.sportconnect.user.api.dto.FriendRequestResponse;
import com.sportconnect.user.api.dto.SendFriendRequestRequest;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.service.UserFriendService;
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
public class UserFriendController {

    private final UserFriendService userFriendService;

    @PostMapping("/requests")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> sendFriendRequest(
            @Valid @RequestBody SendFriendRequestRequest request,
            Authentication authentication) {
        UUID senderId = SecurityUtils.extractUserId(authentication);
        userFriendService.sendFriendRequest(senderId, request.getReceiverId());
        return ResponseEntity.ok(ApiResponse.success("Friend request sent", null));
    }

    @PutMapping("/requests/{requestId}/accept")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> acceptFriendRequest(
            @PathVariable UUID requestId,
            Authentication authentication) {
        UUID receiverId = SecurityUtils.extractUserId(authentication);
        userFriendService.acceptFriendRequest(requestId, receiverId);
        return ResponseEntity.ok(ApiResponse.success("Friend request accepted", null));
    }

    @PutMapping("/requests/{requestId}/decline")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> declineFriendRequest(
            @PathVariable UUID requestId,
            Authentication authentication) {
        UUID receiverId = SecurityUtils.extractUserId(authentication);
        userFriendService.declineFriendRequest(requestId, receiverId);
        return ResponseEntity.ok(ApiResponse.success("Friend request declined", null));
    }

    @DeleteMapping("/requests/{requestId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> cancelFriendRequest(
            @PathVariable UUID requestId,
            Authentication authentication) {
        UUID senderId = SecurityUtils.extractUserId(authentication);
        userFriendService.cancelFriendRequest(requestId, senderId);
        return ResponseEntity.ok(ApiResponse.success("Friend request cancelled", null));
    }

    @DeleteMapping("/{friendId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> removeFriend(
            @PathVariable UUID friendId,
            Authentication authentication) {
        UUID userId = SecurityUtils.extractUserId(authentication);
        userFriendService.removeFriend(userId, friendId);
        return ResponseEntity.ok(ApiResponse.success("Friend removed", null));
    }

    @GetMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<List<UserResponse>>> getFriends(Authentication authentication) {
        UUID userId = SecurityUtils.extractUserId(authentication);
        List<UserResponse> friends = userFriendService.getFriends(userId);
        return ResponseEntity.ok(ApiResponse.success("Friends retrieved", friends));
    }

    @GetMapping("/requests/received")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<List<FriendRequestResponse>>> getPendingReceivedRequests(
            Authentication authentication) {
        UUID userId = SecurityUtils.extractUserId(authentication);
        List<FriendRequestResponse> requests = userFriendService.getPendingReceivedRequests(userId);
        return ResponseEntity.ok(ApiResponse.success("Pending received requests retrieved", requests));
    }

    @GetMapping("/requests/sent")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<List<FriendRequestResponse>>> getPendingSentRequests(
            Authentication authentication) {
        UUID userId = SecurityUtils.extractUserId(authentication);
        List<FriendRequestResponse> requests = userFriendService.getPendingSentRequests(userId);
        return ResponseEntity.ok(ApiResponse.success("Pending sent requests retrieved", requests));
    }
}
