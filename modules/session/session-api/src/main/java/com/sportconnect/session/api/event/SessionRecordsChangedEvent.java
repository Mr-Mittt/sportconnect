package com.sportconnect.session.api.event;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Outbox payload for the {@code session.record.changed} routing key (SESSION-GL-63) — fired once per records change
 * set in which at least one operation was saved (a record added, updated, restored or deleted), never for a change
 * set where everything was rejected or unchanged. Fan-out event, same shape as {@link SessionUpdatedEvent}: no
 * recipient is baked in. The recipient set (every {@code JOINED}, {@code REQUESTED} and {@code INVITED} participant
 * except {@code actorId}) is resolved at consume time by {@code SessionEventsConsumer}, in any session status, because
 * records are logged in {@code ONGOING} and {@code COMPLETED} sessions.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionRecordsChangedEvent {

    private Long sessionId;
    private UUID actorId;
}
