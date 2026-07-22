package com.sportconnect.user.service;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.NotFoundException;
import com.sportconnect.user.api.dto.FriendRequestResponse;
import com.sportconnect.user.api.dto.FriendRequestStatus;
import com.sportconnect.user.api.dto.LocationResponse;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.service.UserFriendService;
import com.sportconnect.user.entity.FriendRequest;
import com.sportconnect.user.entity.Friendship;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.FriendRequestRepository;
import com.sportconnect.user.repository.FriendshipRepository;
import com.sportconnect.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class UserFriendServiceImpl implements UserFriendService {

    private final FriendRequestRepository friendRequestRepository;
    private final FriendshipRepository friendshipRepository;
    private final UserRepository userRepository;

    /**
     * Sends a friend request from {@code senderId} to {@code receiverId}, or reactivates one.
     * {@code friend_requests} has a {@code UNIQUE(sender_id, receiver_id)} constraint — one row per
     * directed pair, forever, since accept/decline/cancel only flip {@code status} rather than
     * deleting the row. A prior request from this exact sender to this exact receiver therefore
     * always has a matching row, regardless of its outcome: still {@code PENDING} (rejected below,
     * unchanged behavior), {@code DECLINED}/{@code CANCELLED}, or {@code ACCEPTED} for a friendship
     * that was later removed (removeFriend only deletes the {@code friendships} rows, not this one).
     * The last three cases reactivate that same row back to {@code PENDING} instead of inserting a
     * second row for the pair, which would violate the unique constraint and surface as an
     * unhandled persistence exception rather than a clean 400 — a real bug, not a "re-sending is
     * blocked by design" outcome, whatever an older name-only reading of the schema might suggest.
     * {@code createdAt} is intentionally left as the original request's timestamp ({@code @CreationTimestamp}
     * is not updatable) — {@code updatedAt} reflects the reactivation.
     */
    @Override
    @Transactional
    public void sendFriendRequest(UUID senderId, UUID receiverId) {
        if (senderId.equals(receiverId)) {
            throw new BadRequestException("Cannot send friend request to yourself");
        }

        userRepository.findByIdAndIsActiveTrue(receiverId)
                .orElseThrow(() -> new NotFoundException("User not found"));

        if (friendshipRepository.existsByUserIdAndFriendId(senderId, receiverId)) {
            throw new BadRequestException("You are already friends");
        }

        Optional<FriendRequest> existing = friendRequestRepository.findBySenderIdAndReceiverId(senderId, receiverId);
        if (existing.isPresent()) {
            FriendRequest request = existing.get();
            FriendRequestStatus previousStatus = request.getStatus();
            if (previousStatus == FriendRequestStatus.PENDING) {
                throw new BadRequestException("Friend request already pending");
            }
            request.setStatus(FriendRequestStatus.PENDING);
            friendRequestRepository.save(request);
            log.info("Friend request re-sent from {} to {} (reactivated existing row, was {})",
                    senderId, receiverId, previousStatus);
            return;
        }

        FriendRequest request = FriendRequest.builder()
                .senderId(senderId)
                .receiverId(receiverId)
                .build();
        friendRequestRepository.save(request);
        log.info("Friend request sent from {} to {}", senderId, receiverId);
        // TODO: notify receiver
    }

    @Override
    @Transactional
    public void acceptFriendRequest(UUID requestId, UUID receiverId) {
        FriendRequest request = friendRequestRepository.findByIdAndReceiverId(requestId, receiverId)
                .orElseThrow(() -> new NotFoundException("Friend request not found"));

        if (request.getStatus() != FriendRequestStatus.PENDING) {
            throw new BadRequestException("Friend request is no longer pending");
        }

        request.setStatus(FriendRequestStatus.ACCEPTED);
        friendRequestRepository.save(request);

        friendshipRepository.save(Friendship.builder()
                .userId(request.getSenderId())
                .friendId(request.getReceiverId())
                .build());
        friendshipRepository.save(Friendship.builder()
                .userId(request.getReceiverId())
                .friendId(request.getSenderId())
                .build());

        log.info("Friend request {} accepted", requestId);
    }

    @Override
    @Transactional
    public void declineFriendRequest(UUID requestId, UUID receiverId) {
        FriendRequest request = friendRequestRepository.findByIdAndReceiverId(requestId, receiverId)
                .orElseThrow(() -> new NotFoundException("Friend request not found"));

        if (request.getStatus() != FriendRequestStatus.PENDING) {
            throw new BadRequestException("Friend request is no longer pending");
        }

        request.setStatus(FriendRequestStatus.DECLINED);
        friendRequestRepository.save(request);
        log.info("Friend request {} declined", requestId);
    }

    @Override
    @Transactional
    public void cancelFriendRequest(UUID requestId, UUID senderId) {
        FriendRequest request = friendRequestRepository.findByIdAndSenderId(requestId, senderId)
                .orElseThrow(() -> new NotFoundException("Friend request not found"));

        if (request.getStatus() != FriendRequestStatus.PENDING) {
            throw new BadRequestException("Friend request is no longer pending");
        }

        request.setStatus(FriendRequestStatus.CANCELLED);
        friendRequestRepository.save(request);
        log.info("Friend request {} cancelled", requestId);
    }

    @Override
    @Transactional
    public void removeFriend(UUID userId, UUID friendId) {
        if (!friendshipRepository.existsByUserIdAndFriendId(userId, friendId)) {
            throw new BadRequestException("You are not friends with this user");
        }

        friendshipRepository.deleteBothDirections(userId, friendId);
        log.info("Friendship removed between {} and {}", userId, friendId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<UserResponse> getFriends(UUID userId) {
        List<UUID> friendIds = friendshipRepository.findByUserId(userId)
                .stream()
                .map(Friendship::getFriendId)
                .collect(Collectors.toList());

        return userRepository.findAllById(friendIds)
                .stream()
                .filter(u -> Boolean.TRUE.equals(u.getIsActive()))
                .map(this::toUserResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public List<UUID> getAcceptedFriendIds(UUID userId) {
        return friendshipRepository.findByUserId(userId)
                .stream()
                .map(Friendship::getFriendId)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public boolean areFriends(UUID userId, UUID otherUserId) {
        return friendshipRepository.existsByUserIdAndFriendId(userId, otherUserId);
    }

    @Override
    @Transactional(readOnly = true)
    public List<FriendRequestResponse> getPendingReceivedRequests(UUID userId) {
        return mapFriendRequests(friendRequestRepository.findByReceiverIdAndStatus(userId, FriendRequestStatus.PENDING));
    }

    @Override
    @Transactional(readOnly = true)
    public List<FriendRequestResponse> getPendingSentRequests(UUID userId) {
        return mapFriendRequests(friendRequestRepository.findBySenderIdAndStatus(userId, FriendRequestStatus.PENDING));
    }

    /**
     * Shared by {@code getPendingReceivedRequests} and {@code getPendingSentRequests} to batch the
     * sender/receiver name lookup into one {@code userRepository.findAllById} call for the whole
     * list instead of 2 calls per request (was the N+1 fixed in U8 — see
     * {@code user-impl/docs/BACKLOG_MVP.md}). A missing user id simply falls back to
     * {@code "Unknown"}, matching the old per-request behavior exactly.
     */
    private List<FriendRequestResponse> mapFriendRequests(List<FriendRequest> requests) {
        List<UUID> userIds = new ArrayList<>();
        for (FriendRequest request : requests) {
            userIds.add(request.getSenderId());
            userIds.add(request.getReceiverId());
        }
        List<UUID> distinctUserIds = userIds.stream().distinct().collect(Collectors.toList());
        Map<UUID, String> namesById = distinctUserIds.isEmpty()
                ? Map.of()
                : userRepository.findAllById(distinctUserIds).stream()
                        .collect(Collectors.toMap(User::getId, User::getFullName));

        return requests.stream()
                .map(request -> toFriendRequestResponse(request, namesById))
                .collect(Collectors.toList());
    }

    private FriendRequestResponse toFriendRequestResponse(FriendRequest request, Map<UUID, String> namesById) {
        String senderName = namesById.getOrDefault(request.getSenderId(), "Unknown");
        String receiverName = namesById.getOrDefault(request.getReceiverId(), "Unknown");

        return FriendRequestResponse.builder()
                .requestId(request.getId())
                .senderId(request.getSenderId())
                .senderName(senderName)
                .receiverId(request.getReceiverId())
                .receiverName(receiverName)
                .status(request.getStatus())
                .createdAt(request.getCreatedAt())
                .build();
    }

    private UserResponse toUserResponse(User user) {
        Set<String> roles = user.getRoles().stream()
                .map(r -> r.getName())
                .collect(Collectors.toSet());

        return UserResponse.builder()
                .id(user.getId())
                .email(user.getEmail())
                .firstName(user.getFirstName())
                .lastName(user.getLastName())
                .username(user.getUsername())
                .avatarUrl(user.getAvatarUrl())
                .bio(user.getBio())
                .location(user.getLocation() != null
                        ? LocationResponse.of(user.getLocation().getY(), user.getLocation().getX()) : null)
                .isActive(user.getIsActive())
                .roles(roles)
                .createdAt(user.getCreatedAt())
                .build();
    }
}
