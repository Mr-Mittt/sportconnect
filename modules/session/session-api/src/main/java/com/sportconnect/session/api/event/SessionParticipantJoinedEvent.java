package com.sportconnect.session.api.event;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Outbox payload for the {@code session.participant.joined} routing key (SESSION-15) — a gap
 * found during scoping, not previously logged in {@code NOTIFICATION_USE_CASES.md}. Fan-out event,
 * same shape as {@link SessionCommentCreatedEvent} — no recipient is baked in. The recipient set
 * (all other currently-{@code JOINED} participants, minus {@code actorId}) is resolved at consume
 * time by NTF-2.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionParticipantJoinedEvent {

    private Long sessionId;
    private UUID actorId;
}
