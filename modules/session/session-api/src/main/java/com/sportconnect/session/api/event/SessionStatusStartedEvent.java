package com.sportconnect.session.api.event;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Outbox payload for the {@code session.status.started} routing key (SESSION-18) — fired when
 * {@code SessionGenerationService.startOngoingSessions} flips a session {@code SCHEDULED} →
 * {@code ONGOING}. Unlike every other session event, this one has no real actor — a scheduled job
 * made the transition, not a user — so, deliberately, there is no {@code actorId} field here.
 * Fan-out event, same shape as {@link SessionParticipantJoinedEvent}: the recipient set (every
 * currently-{@code JOINED} participant) is resolved at consume time by NTF-2.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionStatusStartedEvent {

    private Long sessionId;
}
