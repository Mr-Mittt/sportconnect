package com.sportconnect.user.api.service;

import com.sportconnect.user.api.dto.FriendRequestResponse;
import com.sportconnect.user.api.dto.UserInfoResponse;

import java.util.List;
import java.util.UUID;

public interface UserFriendService {

    void sendFriendRequest(UUID senderId, UUID receiverId);

    void acceptFriendRequest(UUID requestId, UUID receiverId);

    void declineFriendRequest(UUID requestId, UUID receiverId);

    void cancelFriendRequest(UUID requestId, UUID senderId);

    void removeFriend(UUID userId, UUID friendId);

    /**
     * The caller's accepted friends. PII-free (U17) — the same {@link UserInfoResponse} shape U11 already gives
     * every non-owner lookup; the endpoint previously returned a raw partial {@code UserResponse} that carried
     * {@code email} and precise {@code location} (lat/long), neither of which any client field reads today.
     * {@code activeSportIds} is always empty here (no per-friend cross-domain call — the friend rail doesn't
     * render sport pills; a caller that needs them per friend should call {@code toPublicUserInfo} per user).
     */
    List<UserInfoResponse> getFriends(UUID userId);

    List<UUID> getAcceptedFriendIds(UUID userId);

    boolean areFriends(UUID userId, UUID otherUserId);

    List<FriendRequestResponse> getPendingReceivedRequests(UUID userId);

    List<FriendRequestResponse> getPendingSentRequests(UUID userId);
}
