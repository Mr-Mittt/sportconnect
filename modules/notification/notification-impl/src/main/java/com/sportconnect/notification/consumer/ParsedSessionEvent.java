package com.sportconnect.notification.consumer;

import com.sportconnect.session.api.dto.ParticipantStatus;
import java.util.List;
import java.util.UUID;

/**
 * One deserialized `session.*` event, normalized to whichever shape
 * {@link SessionEventProcessor} needs: exactly one of {@code singleRecipient}/
 * {@code fanOutStatuses} is set, never both. Single-recipient events (join-request
 * created/approved/rejected, invitation created) already know their recipient at write time —
 * see {@code SessionOutboxEvent}'s payload DTOs (session-api). Fan-out events (comment created,
 * participant joined) carry the {@link ParticipantStatus} set {@link SessionEventProcessor}
 * resolves against {@code SessionService.getParticipantIdsByStatuses} at consume time.
 */
record ParsedSessionEvent(
        String type,
        Long sessionId,
        UUID actorId,
        UUID singleRecipient,
        List<ParticipantStatus> fanOutStatuses) {

    static ParsedSessionEvent single(String type, Long sessionId, UUID actorId, UUID recipientUserId) {
        return new ParsedSessionEvent(type, sessionId, actorId, recipientUserId, null);
    }

    static ParsedSessionEvent fanOut(String type, Long sessionId, UUID actorId, List<ParticipantStatus> statuses) {
        return new ParsedSessionEvent(type, sessionId, actorId, null, statuses);
    }
}
