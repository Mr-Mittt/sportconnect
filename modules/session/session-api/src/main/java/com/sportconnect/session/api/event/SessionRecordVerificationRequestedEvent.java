package com.sportconnect.session.api.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * Outbox payload for the {@code session.record.verification_requested} routing key (SESSION-72, NOTIF-16): a player
 * proposed a game as a ranking game, or changed a proposed game, and the recipient is a player named in it who has to
 * confirm it. Single-recipient event, one per player: {@code actorId} is the proposer (or the editor), {@code
 * recipientUserId} the player to notify; the entity of the notification is the session.
 *
 * <p>The routing key has three words on purpose: the notification queue is bound with {@code session.*.*}, so
 * {@code session.record.verification.requested} (four words) would never reach the consumer.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionRecordVerificationRequestedEvent {

    private Long sessionId;
    private Long recordId;
    private UUID actorId;
    private UUID recipientUserId;
}
