package com.sportconnect.user.api.event;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Outbox payload for the {@code user.friend_request.created} routing key (U13) — written whenever a
 * friend request transitions <em>into</em> {@code PENDING}: a genuinely new request, or a re-sent
 * one that reactivates a previously {@code DECLINED}/{@code CANCELLED}/stale-{@code ACCEPTED} row
 * (see {@code UserFriendServiceImpl.sendFriendRequest}). From the receiver's side the two are
 * indistinguishable — a pending request they now need to act on.
 *
 * <p>Single-recipient event — {@code recipientUserId} (the request's receiver) is already
 * unambiguous at write time, so it's baked in directly rather than resolved at consume time,
 * mirroring {@code session-api}'s {@code SessionJoinRequestCreatedEvent}. {@code actorId} is the
 * sender.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class FriendRequestCreatedEvent {

    private UUID requestId;
    private UUID actorId;
    private UUID recipientUserId;
}
