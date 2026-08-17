package com.sportconnect.notification.consumer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.notification.config.SessionEventsRabbitConfig;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.event.SessionCommentCreatedEvent;
import com.sportconnect.session.api.event.SessionInvitationCreatedEvent;
import com.sportconnect.session.api.event.SessionJoinRequestApprovedEvent;
import com.sportconnect.session.api.event.SessionJoinRequestCreatedEvent;
import com.sportconnect.session.api.event.SessionJoinRequestRejectedEvent;
import com.sportconnect.session.api.event.SessionParticipantJoinedEvent;
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
 * {@code modules/notification/docs/NTF-2_RABBITMQ_CONSUMER.md}.
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
    private static final List<ParticipantStatus> PARTICIPANT_JOINED_RECIPIENT_STATUSES =
            List.of(ParticipantStatus.JOINED);

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
                yield ParsedSessionEvent.fanOut(routingKey, e.getSessionId(), e.getActorId(), COMMENT_RECIPIENT_STATUSES);
            }
            case "session.participant.joined" -> {
                SessionParticipantJoinedEvent e = objectMapper.readValue(body, SessionParticipantJoinedEvent.class);
                yield ParsedSessionEvent.fanOut(routingKey, e.getSessionId(), e.getActorId(), PARTICIPANT_JOINED_RECIPIENT_STATUSES);
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
