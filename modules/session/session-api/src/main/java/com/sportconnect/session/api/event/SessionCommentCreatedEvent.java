package com.sportconnect.session.api.event;

import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Outbox payload for the {@code session.comment.created} routing key (SESSION-15). Fan-out event
 * — no recipient is baked in here. The recipient set (other {@code JOINED}/{@code REQUESTED}/
 * {@code INVITED} participants, minus {@code actorId}) is resolved at consume time by
 * {@code modules/notification}'s NTF-2, the same shape as {@code post-api}'s thread-participant
 * resolution for post comments.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionCommentCreatedEvent {

    private Long sessionId;
    private UUID actorId;
    private Long commentId;
}
