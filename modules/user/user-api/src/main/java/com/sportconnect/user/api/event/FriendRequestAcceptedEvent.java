package com.sportconnect.user.api.event;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Outbox payload for the {@code user.friend_request.accepted} routing key (U13) — written from
 * {@code UserFriendServiceImpl.establishFriendship}, so it covers both an explicit
 * {@code acceptFriendRequest} and the U10 crossed-request path where sending a request auto-accepts
 * the other side's pending one. {@code declineFriendRequest} deliberately publishes nothing.
 *
 * <p>Single-recipient event — {@code recipientUserId} is the <em>original sender</em> of the
 * request (the person waiting to hear back); {@code actorId} is the person who accepted (the
 * request's receiver). Both are known unambiguously at write time.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FriendRequestAcceptedEvent {

    private UUID requestId;
    private UUID actorId;
    private UUID recipientUserId;
}
