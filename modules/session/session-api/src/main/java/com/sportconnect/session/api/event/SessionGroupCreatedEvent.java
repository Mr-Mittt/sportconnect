package com.sportconnect.session.api.event;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Outbox payload for the {@code session.group.created} routing key (SESSION-GROUP-1): a group session was created for
 * the recipient (all members, or the members the creator chose). Single-recipient event, one per member notified:
 * {@code actorId} is the creator, {@code recipientUserId} the member. No participant row exists for the recipient; the
 * notification opens the session and the member decides whether to join.
 *
 * <p>The routing key has three words on purpose: the notification queue is bound with {@code session.*.*}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionGroupCreatedEvent {

    private Long sessionId;
    private UUID actorId;
    private UUID recipientUserId;
    private Long groupId;
}
