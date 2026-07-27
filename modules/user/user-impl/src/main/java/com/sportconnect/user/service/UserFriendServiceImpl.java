package com.sportconnect.user.service;

import com.fasterxml.jackson.databind.ObjectMapper;
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
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.StreamRecords;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
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
    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;

    // services/chat (the first non-Java service in this repo) consumes this stream to keep its
    // own local authorization cache in sync — see services/chat/docs/SYNC_DESIGN.md.
    private static final String DOMAIN_EVENTS_STREAM = "sportconnect:domain-events";
    private static final int DOMAIN_EVENT_SCHEMA_VERSION = 1;

    /**
     * Sends a friend request from {@code senderId} to {@code receiverId}, or resolves one
     * immediately without waiting for an explicit accept.
     * <p>
     * Three outcomes, checked in order:
     * <ol>
     *   <li><b>Crossed requests (U10):</b> the receiver already sent the caller a {@code PENDING}
     *       request in the other direction — mutual interest is already established, so this
     *       accepts that reverse request on the spot (via {@link #establishFriendship}) instead of
     *       creating a second, redundant pending row that would leave both people waiting on each
     *       other.</li>
     *   <li><b>Reactivation (U9):</b> {@code friend_requests} has a
     *       {@code UNIQUE(sender_id, receiver_id)} constraint — one row per directed pair, forever,
     *       since accept/decline/cancel only flip {@code status} rather than deleting the row. A
     *       prior request from this exact sender to this exact receiver therefore always has a
     *       matching row, regardless of its outcome: {@code DECLINED}/{@code CANCELLED}, or
     *       {@code ACCEPTED} for a friendship later removed (removeFriend only deletes the
     *       {@code friendships} rows, not this one). Reactivates that same row back to
     *       {@code PENDING} instead of inserting a second row for the pair, which would violate the
     *       unique constraint and surface as an unhandled persistence exception rather than a clean
     *       400. {@code createdAt} is intentionally left as the original request's timestamp
     *       ({@code @CreationTimestamp} is not updatable) — {@code updatedAt} reflects the
     *       reactivation. A still-{@code PENDING} existing row is rejected instead (unchanged from
     *       before U9).</li>
     *   <li><b>Fresh request:</b> no row exists for the pair at all — inserts a new one.</li>
     * </ol>
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

        Optional<FriendRequest> reverseRequest = friendRequestRepository
                .findBySenderIdAndReceiverIdAndStatus(receiverId, senderId, FriendRequestStatus.PENDING);
        if (reverseRequest.isPresent()) {
            establishFriendship(reverseRequest.get());
            log.info("Crossed friend requests between {} and {} — friendship established immediately",
                    senderId, receiverId);
            return;
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

    /**
     * Marks {@code request} {@code ACCEPTED} and writes both direction rows to {@code friendships}.
     * Shared by {@link #acceptFriendRequest} (explicit accept) and {@link #sendFriendRequest}'s
     * crossed-request case (implicit accept of the other side's pending request) so there is one
     * place that defines "how a request becomes a friendship."
     */
    private void establishFriendship(FriendRequest request) {
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

        publishDomainEvent("friendship.accepted", Map.of(
                "user_id", request.getSenderId().toString(),
                "friend_id", request.getReceiverId().toString()));
    }

    /**
     * Publishes one domain-change event to {@link #DOMAIN_EVENTS_STREAM} for services/chat to
     * consume (see services/chat/docs/SYNC_DESIGN.md's event catalogue for the exact payload
     * shape expected per eventType). Never lets a publish failure break the domain operation it's
     * attached to — chat's cold-start bootstrap exists precisely to recover from a gap like a
     * transient Redis outage, so this only logs and moves on rather than rolling back or
     * rethrowing.
     */
    private void publishDomainEvent(String eventType, Object payload) {
        try {
            Map<String, String> fields = new LinkedHashMap<>();
            fields.put("event_id", UUID.randomUUID().toString());
            fields.put("event_type", eventType);
            fields.put("schema_version", String.valueOf(DOMAIN_EVENT_SCHEMA_VERSION));
            fields.put("occurred_at", Instant.now().toString());
            fields.put("payload", objectMapper.writeValueAsString(payload));

            MapRecord<String, String, String> record = StreamRecords.newRecord()
                    .ofMap(fields)
                    .withStreamKey(DOMAIN_EVENTS_STREAM);
            stringRedisTemplate.opsForStream().add(record);
        } catch (Exception e) {
            log.warn("Failed to publish domain event {} for chat sync: {}", eventType, e.getMessage());
        }
    }

    @Override
    @Transactional
    public void acceptFriendRequest(UUID requestId, UUID receiverId) {
        FriendRequest request = friendRequestRepository.findByIdAndReceiverId(requestId, receiverId)
                .orElseThrow(() -> new NotFoundException("Friend request not found"));

        if (request.getStatus() != FriendRequestStatus.PENDING) {
            throw new BadRequestException("Friend request is no longer pending");
        }

        establishFriendship(request);

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
        publishDomainEvent("friendship.removed", Map.of(
                "user_id", userId.toString(),
                "friend_id", friendId.toString()));
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
