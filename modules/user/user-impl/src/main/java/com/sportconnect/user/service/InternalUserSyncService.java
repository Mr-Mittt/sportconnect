package com.sportconnect.user.service;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.sportconnect.user.entity.Friendship;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.FriendshipRepository;
import com.sportconnect.user.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Backs {@code InternalUserSyncController}'s cold-start bootstrap endpoints for services/chat
 * (see services/chat/docs/SYNC_DESIGN.md). Deliberately not part of the public {@code
 * UserService}/{@code UserFriendService} {@code -api} contracts — this is a sync concern for one
 * specific consumer, not a domain operation any other caller should depend on.
 */
@Service
@RequiredArgsConstructor
public class InternalUserSyncService {

    private static final int MAX_LIMIT = 500;
    private static final UUID MIN_UUID = new UUID(0L, 0L);

    private final FriendshipRepository friendshipRepository;
    private final UserRepository userRepository;

    public record FriendshipRow(
            @JsonProperty("user_id") String userId,
            @JsonProperty("friend_id") String friendId) {
    }

    public record UserRow(
            @JsonProperty("user_id") String userId,
            @JsonProperty("full_name") String fullName,
            @JsonProperty("username") String username,
            @JsonProperty("avatar_url") String avatarUrl) {
    }

    public record FriendshipPage(
            @JsonProperty("items") List<FriendshipRow> items,
            @JsonProperty("next_cursor") String nextCursor) {
    }

    public record UserPage(
            @JsonProperty("items") List<UserRow> items,
            @JsonProperty("next_cursor") String nextCursor) {
    }

    public FriendshipPage listFriendships(String cursor, int limit) {
        UUID afterId = parseCursor(cursor);
        int pageSize = Math.min(limit, MAX_LIMIT);

        List<Friendship> friendships = friendshipRepository
                .findByIdGreaterThanOrderByIdAsc(afterId, PageRequest.of(0, pageSize));

        List<FriendshipRow> items = friendships.stream()
                .map(f -> new FriendshipRow(f.getUserId().toString(), f.getFriendId().toString()))
                .collect(Collectors.toList());

        String nextCursor = friendships.size() < pageSize
                ? null
                : friendships.get(friendships.size() - 1).getId().toString();

        return new FriendshipPage(items, nextCursor);
    }

    public UserPage listUsers(String cursor, int limit) {
        UUID afterId = parseCursor(cursor);
        int pageSize = Math.min(limit, MAX_LIMIT);

        List<User> users = userRepository
                .findByIdGreaterThanAndIsActiveTrueOrderByIdAsc(afterId, PageRequest.of(0, pageSize));

        List<UserRow> items = users.stream()
                .map(u -> new UserRow(u.getId().toString(), u.getFullName(), u.getUsername(), u.getAvatarUrl()))
                .collect(Collectors.toList());

        String nextCursor = users.size() < pageSize
                ? null
                : users.get(users.size() - 1).getId().toString();

        return new UserPage(items, nextCursor);
    }

    // The nil UUID (all-zero bytes) is the global minimum under Postgres's byte-wise UUID
    // comparison, so it doubles as "no cursor yet" without needing a second repository method.
    private UUID parseCursor(String cursor) {
        return (cursor == null || cursor.isBlank()) ? MIN_UUID : UUID.fromString(cursor);
    }
}
