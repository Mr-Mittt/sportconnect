package com.sportconnect.session.api.event;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Outbox payload for the {@code session.participant.left} routing key (SESSION-19) — fired only
 * when a participant row transitions {@code JOINED} -> {@code LEFT}, never for the
 * {@code INVITED}/{@code REQUESTED} -> {@code LEFT} transitions {@code leaveSession} also serves
 * (declining an invite, cancelling a join request): nobody was ever counting on a person who had
 * not actually joined. Fan-out event, same shape as {@link SessionParticipantJoinedEvent} — no
 * recipient is baked in. The recipient set (all other currently-{@code JOINED} participants, minus
 * {@code actorId}) is resolved at consume time by NTF-2.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionParticipantLeftEvent {

    private Long sessionId;
    private UUID actorId;
}
