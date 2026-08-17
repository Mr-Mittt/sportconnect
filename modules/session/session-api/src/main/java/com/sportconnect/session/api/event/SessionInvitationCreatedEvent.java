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
