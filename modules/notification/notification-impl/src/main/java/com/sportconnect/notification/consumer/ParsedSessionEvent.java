package com.sportconnect.notification.consumer;

import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.SessionStatus;
import java.util.List;
import java.util.UUID;

/**
 * One deserialized `session.*` event, normalized to whichever shape
 * {@link SessionEventProcessor} needs: exactly one of {@code singleRecipient}/
 * {@code fanOutStatuses} is set, never both. Single-recipient events (join-request
 * created/approved/rejected, invitation created) already know their recipient at write time —
 * see {@code SessionOutboxEvent}'s payload DTOs (session-api). Fan-out events (comment created,
 * participant joined/left, status started) carry the two filters
 * {@link SessionEventProcessor} resolves against
 * {@code SessionService.getParticipantIdsByStatuses} at consume time: the {@link ParticipantStatus}
 * set selecting recipients, and the {@link SessionStatus} set deciding whether this session
 * lifecycle state fans out at all.
 *
 * <p>{@code fanOutSessionStatuses} is set exactly when {@code fanOutStatuses} is (SESSION-20) —
 * it's meaningless for a single-recipient event, whose recipient is already known and is not
 * conditioned on session status.
 *
 * <p>{@code message} (NTF-8) is the short text the notification carries, {@code null} for every event
 * but a join-request rejection (the host's reason); {@link SessionEventProcessor} hands it to
 * {@code NotificationService.recordEvent} as it is.
 */
record ParsedSessionEvent(
        String type,
        Long sessionId,
        UUID actorId,
        UUID singleRecipient,
        List<ParticipantStatus> fanOutStatuses,
        List<SessionStatus> fanOutSessionStatuses,
        String message) {

    static ParsedSessionEvent single(String type, Long sessionId, UUID actorId, UUID recipientUserId) {
        return single(type, sessionId, actorId, recipientUserId, null);
    }

    static ParsedSessionEvent single(String type, Long sessionId, UUID actorId, UUID recipientUserId, String message) {
        return new ParsedSessionEvent(type, sessionId, actorId, recipientUserId, null, null, message);
    }

    static ParsedSessionEvent fanOut(String type, Long sessionId, UUID actorId,
                                     List<ParticipantStatus> participantStatuses,
                                     List<SessionStatus> sessionStatuses) {
        return new ParsedSessionEvent(type, sessionId, actorId, null, participantStatuses, sessionStatuses, null);
    }
}
