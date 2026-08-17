package com.sportconnect.session.api.event;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Outbox payload for the {@code session.join_request.approved} routing key (SESSION-15).
 * Single-recipient event — {@code recipientUserId} (the requester whose join request was
 * approved) is already unambiguous at write time.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionJoinRequestApprovedEvent {

    private Long sessionId;
    private UUID actorId;
    private UUID recipientUserId;
}
