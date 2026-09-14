package com.sportconnect.session.api.event;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Outbox payload for the {@code session.details.updated} routing key (SESSION-24) — fired on every
 * successful {@code SessionService.updateSession} call, regardless of which field(s) changed.
 * Fan-out event, same shape as {@link SessionParticipantLeftEvent} — no recipient is baked in.
 * The recipient set (all other currently-{@code JOINED} participants, minus {@code actorId}) is
 * resolved at consume time by {@code SessionEventsConsumer}, reusing the same
 * {@code PARTICIPANT_JOINED_RECIPIENT_STATUSES}/{@code ACTIVE_SESSION_STATUSES} gate as
 * {@code session.participant.joined}/{@code left}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionUpdatedEvent {

    private Long sessionId;
    private UUID actorId;
}
