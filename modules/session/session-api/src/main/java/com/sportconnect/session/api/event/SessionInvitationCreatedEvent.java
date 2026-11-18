package com.sportconnect.session.api.event;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Outbox payload for the {@code session.invitation.created} routing key (SESSION-15).
 * Single-recipient event — {@code recipientUserId} (the invitee) is already unambiguous at write
 * time, since invitees are supplied directly on {@code CreateSessionRequest.inviteeIds}.
 *
 * <p>SESSION-66: also the payload of a <em>share</em> ({@code POST /api/sessions/{id}/shares}), where the recipient
 * is a friend of the actor and <strong>no {@code INVITED} participant row exists</strong>; the notification reads
 * the same ("invited you to join") and opens the session, from which the friend decides to ask to join.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionInvitationCreatedEvent {

    private Long sessionId;
    private UUID actorId;
    private UUID recipientUserId;
}
