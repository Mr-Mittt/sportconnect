package com.sportconnect.session.api.event;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Outbox payload for the {@code session.join_request.created} routing key (SESSION-15).
 * Single-recipient event — {@code recipientUserId} (the organizer, {@code Session.createdBy}) is
 * already unambiguous at write time, so it's baked in directly rather than deferred to consume
 * time.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionJoinRequestCreatedEvent {

    private Long sessionId;
    private UUID actorId;
    private UUID recipientUserId;
}
