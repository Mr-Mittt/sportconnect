package com.sportconnect.user.api.service;

import com.sportconnect.user.api.dto.FriendRequestResponse;
import com.sportconnect.user.api.dto.UserResponse;

import java.util.List;
import java.util.UUID;

public interface UserFriendService {

    void sendFriendRequest(UUID senderId, UUID receiverId);

    void acceptFriendRequest(UUID requestId, UUID receiverId);

    void declineFriendRequest(UUID requestId, UUID receiverId);

    void cancelFriendRequest(UUID requestId, UUID senderId);

    void removeFriend(UUID userId, UUID friendId);

    List<UserResponse> getFriends(UUID userId);

    List<UUID> getAcceptedFriendIds(UUID userId);

    boolean areFriends(UUID userId, UUID otherUserId);

    List<FriendRequestResponse> getPendingReceivedRequests(UUID userId);

    List<FriendRequestResponse> getPendingSentRequests(UUID userId);
}
