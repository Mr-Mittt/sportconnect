package com.sportconnect.session.api.event;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Outbox payload for the {@code session.share.created} routing key (SESSION-66, CLIENT-SESSION-49): a user shared a
 * standalone session with a friend ({@code POST /api/sessions/{id}/shares}). Single-recipient event, one per friend
 * notified: {@code actorId} is the sharer, {@code recipientUserId} the friend. No participant row exists for the
 * friend; the notification opens the session and the friend decides for themself whether to ask to join.
 *
 * <p>The routing key has three words on purpose: the notification queue is bound with {@code session.*.*}, so a
 * two-word key would never reach the consumer. It is deliberately not {@code session.invitation.created}, which
 * means only an invitation made when a session is created.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionShareCreatedEvent {

    private Long sessionId;
    private UUID actorId;
    private UUID recipientUserId;
}
