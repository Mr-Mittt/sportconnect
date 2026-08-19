package com.sportconnect.notification.consumer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.notification.config.SessionEventsRabbitConfig;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.event.SessionCommentCreatedEvent;
import com.sportconnect.session.api.event.SessionInvitationCreatedEvent;
import com.sportconnect.session.api.event.SessionJoinRequestApprovedEvent;
import com.sportconnect.session.api.event.SessionJoinRequestCreatedEvent;
import com.sportconnect.session.api.event.SessionJoinRequestRejectedEvent;
import com.sportconnect.session.api.event.SessionParticipantJoinedEvent;
import com.sportconnect.session.api.event.SessionParticipantLeftEvent;
import com.sportconnect.session.api.event.SessionStatusStartedEvent;
import java.nio.charset.StandardCharsets;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

/**
 * NTF-2's {@code sportconnect.events} consumer — session-only scope for now (post/group/friend
 * event consumption are follow-on tickets, once {@code post-impl}/{@code group-impl}/
 * {@code user-impl} ship real producers via their own outbox-wiring tickets). See
 * {@code modules/notification/docs/MVP/NTF-2_RABBITMQ_CONSUMER.md}.
 *
 * <p>Deserialization/unrecognized-routing-key failures are caught narrowly right here — a
 * permanently malformed message will never succeed no matter how many times it's redelivered, so
 * it's logged and dropped (this method returning normally acks it, the default
 * {@code @RabbitListener} behavior). Any other exception (a real failure inside
 * {@link SessionEventProcessor#process}) is deliberately left to propagate — RabbitMQ's default
 * behavior requeues for retry, which is correct for a transient failure and is not swallowed here.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class SessionEventsConsumer {

    private static final List<ParticipantStatus> COMMENT_RECIPIENT_STATUSES =
            List.of(ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED);
    // The "currently-JOINED participants" recipient set — named for the participant status it
    // selects, not for any one event. Shared by session.participant.joined (SESSION-15),
    // session.status.started (SESSION-18) and session.participant.left (SESSION-19).
    private static final List<ParticipantStatus> PARTICIPANT_JOINED_RECIPIENT_STATUSES =
            List.of(ParticipantStatus.JOINED);

    // SESSION-20 — which session lifecycle states fan out, now declared per event here rather
    // than hardcoded inside SessionService.getParticipantIdsByStatuses.
    //
    // A comment fans out in every state, because SessionGate lets participants comment in every
    // state: a post-game recap on a COMPLETED session and "why was this cancelled?" on a
    // CANCELLED one are both real, and both silently notified nobody before this ticket. Built
    // from values() rather than a hand-listed set so a future SessionStatus is included by
    // default — silently excluding a new state is exactly the bug shape SESSION-20 fixed.
    private static final List<SessionStatus> ANY_SESSION_STATUS = List.of(SessionStatus.values());
    // Everything else stays scoped to a live session: "someone joined/left" and "it's starting
    // now" are only meaningful while the session is still ahead of or underway for its
    // participants. Unchanged behavior for these three events.
    private static final List<SessionStatus> ACTIVE_SESSION_STATUSES =
            List.of(SessionStatus.SCHEDULED, SessionStatus.ONGOING);

    private final ObjectMapper objectMapper;
    private final SessionEventProcessor sessionEventProcessor;

    @RabbitListener(queues = SessionEventsRabbitConfig.SESSION_EVENTS_QUEUE)
    public void onSessionEvent(Message message) {
        String routingKey = message.getMessageProperties().getReceivedRoutingKey();
        String messageId = message.getMessageProperties().getMessageId();
        String body = new String(message.getBody(), StandardCharsets.UTF_8);

        ParsedSessionEvent parsed;
        try {
            parsed = parse(routingKey, body);
        } catch (Exception e) {
            log.warn("Dropping unparseable/unrecognized session event: routingKey={} messageId={}",
                    routingKey, messageId, e);
            return;
        }

        sessionEventProcessor.process(messageId, parsed);
    }

    private ParsedSessionEvent parse(String routingKey, String body) throws Exception {
        return switch (routingKey) {
            case "session.comment.created" -> {
                SessionCommentCreatedEvent e = objectMapper.readValue(body, SessionCommentCreatedEvent.class);
                yield ParsedSessionEvent.fanOut(routingKey, e.getSessionId(), e.getActorId(),
                        COMMENT_RECIPIENT_STATUSES, ANY_SESSION_STATUS);
            }
            case "session.participant.joined" -> {
                SessionParticipantJoinedEvent e = objectMapper.readValue(body, SessionParticipantJoinedEvent.class);
                yield ParsedSessionEvent.fanOut(routingKey, e.getSessionId(), e.getActorId(),
                        PARTICIPANT_JOINED_RECIPIENT_STATUSES, ACTIVE_SESSION_STATUSES);
            }
            case "session.participant.left" -> {
                SessionParticipantLeftEvent e = objectMapper.readValue(body, SessionParticipantLeftEvent.class);
                yield ParsedSessionEvent.fanOut(routingKey, e.getSessionId(), e.getActorId(),
                        PARTICIPANT_JOINED_RECIPIENT_STATUSES, ACTIVE_SESSION_STATUSES);
            }
            case "session.status.started" -> {
                SessionStatusStartedEvent e = objectMapper.readValue(body, SessionStatusStartedEvent.class);
                // SESSION-18: no real actor — a scheduled job made this transition, not a user.
                yield ParsedSessionEvent.fanOut(routingKey, e.getSessionId(), null,
                        PARTICIPANT_JOINED_RECIPIENT_STATUSES, ACTIVE_SESSION_STATUSES);
            }
            case "session.join_request.created" -> {
                SessionJoinRequestCreatedEvent e = objectMapper.readValue(body, SessionJoinRequestCreatedEvent.class);
                yield ParsedSessionEvent.single(routingKey, e.getSessionId(), e.getActorId(), e.getRecipientUserId());
            }
            case "session.join_request.approved" -> {
                SessionJoinRequestApprovedEvent e = objectMapper.readValue(body, SessionJoinRequestApprovedEvent.class);
                yield ParsedSessionEvent.single(routingKey, e.getSessionId(), e.getActorId(), e.getRecipientUserId());
            }
            case "session.join_request.rejected" -> {
                SessionJoinRequestRejectedEvent e = objectMapper.readValue(body, SessionJoinRequestRejectedEvent.class);
                yield ParsedSessionEvent.single(routingKey, e.getSessionId(), e.getActorId(), e.getRecipientUserId());
            }
            case "session.invitation.created" -> {
                SessionInvitationCreatedEvent e = objectMapper.readValue(body, SessionInvitationCreatedEvent.class);
                yield ParsedSessionEvent.single(routingKey, e.getSessionId(), e.getActorId(), e.getRecipientUserId());
            }
            default -> throw new IllegalArgumentException("Unrecognized routing key: " + routingKey);
        };
    }
}
