package com.sportconnect.notification.consumer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.notification.config.UserEventsRabbitConfig;
import com.sportconnect.user.api.event.FriendRequestAcceptedEvent;
import com.sportconnect.user.api.event.FriendRequestCreatedEvent;
import java.nio.charset.StandardCharsets;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

/**
 * U13's {@code user.*} consumer on {@code sportconnect.events} — the friend-request half of the
 * notification module's event intake, alongside {@link SessionEventsConsumer}. Both friend-request
 * events are single-recipient (the producer knows the recipient at write time), so this is a
 * straight deserialize-and-hand-off with no fan-out resolution.
 *
 * <p>Deserialization / unrecognized-routing-key failures are caught narrowly here and the message
 * is logged and dropped (returning normally acks it) — a permanently malformed message never
 * succeeds on redelivery. Any other exception from {@link UserEventProcessor#process} is left to
 * propagate so RabbitMQ requeues it, which is correct for a transient failure.
 */
@Component
@Slf4j
@RequiredArgsConstructor
public class UserEventsConsumer {

    private final ObjectMapper objectMapper;
    private final UserEventProcessor userEventProcessor;

    @RabbitListener(queues = UserEventsRabbitConfig.USER_EVENTS_QUEUE)
    public void onUserEvent(Message message) {
        String routingKey = message.getMessageProperties().getReceivedRoutingKey();
        String messageId = message.getMessageProperties().getMessageId();
        String body = new String(message.getBody(), StandardCharsets.UTF_8);

        ParsedUserEvent parsed;
        try {
            parsed = parse(routingKey, body);
        } catch (Exception e) {
            log.warn("Dropping unparseable/unrecognized user event: routingKey={} messageId={}",
                    routingKey, messageId, e);
            return;
        }

        userEventProcessor.process(messageId, parsed);
    }

    private ParsedUserEvent parse(String routingKey, String body) throws Exception {
        return switch (routingKey) {
            case "user.friend_request.created" -> {
                FriendRequestCreatedEvent e = objectMapper.readValue(body, FriendRequestCreatedEvent.class);
                yield new ParsedUserEvent(routingKey, e.getActorId(), e.getRecipientUserId());
            }
            case "user.friend_request.accepted" -> {
                FriendRequestAcceptedEvent e = objectMapper.readValue(body, FriendRequestAcceptedEvent.class);
                yield new ParsedUserEvent(routingKey, e.getActorId(), e.getRecipientUserId());
            }
            default -> throw new IllegalArgumentException("Unrecognized routing key: " + routingKey);
        };
    }
}
