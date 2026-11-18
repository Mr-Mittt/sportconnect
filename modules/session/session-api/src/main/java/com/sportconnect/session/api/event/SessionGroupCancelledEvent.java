package com.sportconnect.session.api.event;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Outbox payload for the {@code session.group.cancelled} routing key (SESSION-GROUP-1): a group session was cancelled
 * by its creator or by a group owner or admin. Single-recipient event, one per person told: the session's audience (all
 * members, or the chosen ones) plus everyone still {@code JOINED}, minus the actor. {@code actorId} is who cancelled.
 *
 * <p>Three-word routing key, for the {@code session.*.*} queue binding.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionGroupCancelledEvent {

    private Long sessionId;
    private UUID actorId;
    private UUID recipientUserId;
    private Long groupId;
}
