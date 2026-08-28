package com.sportconnect.notification.consumer;

import java.util.UUID;

/**
 * One deserialized {@code user.*} event (U13), normalized to what {@link UserEventProcessor} needs.
 * Both friend-request events are single-recipient — {@code user-impl} bakes {@code recipientUserId}
 * into the payload at write time (see {@code user-api}'s {@code FriendRequestCreatedEvent} /
 * {@code FriendRequestAcceptedEvent}) — so there is no fan-out variant here, unlike
 * {@link ParsedSessionEvent}.
 *
 * @param type      the routing key, stored verbatim as {@code Notification.type}
 * @param actorId   the person who acted (the sender for {@code created}, the accepter for
 *                  {@code accepted}) — never null for a friend-request event
 * @param recipientUserId who to notify
 */
record ParsedUserEvent(String type, UUID actorId, UUID recipientUserId) {
}
