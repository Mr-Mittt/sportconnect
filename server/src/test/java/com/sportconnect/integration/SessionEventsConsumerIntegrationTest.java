package com.sportconnect.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.notification.entity.Notification;
import com.sportconnect.notification.repository.NotificationRepository;
import com.sportconnect.session.api.event.SessionJoinRequestCreatedEvent;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/**
 * Real end-to-end coverage for NTF-2's {@code SessionEventsConsumer} wiring (see
 * {@code modules/notification/docs/MVP/NTF-2_RABBITMQ_CONSUMER.md}) — publishes directly onto a real
 * RabbitMQ broker (extends {@link RabbitMqTestContainerBase}, not {@code BaseIT} directly — only
 * tests that actually need Rabbit should force that container to start) and asserts a real
 * {@code Notification} row appears, going through the actual exchange/queue/binding/
 * {@code @RabbitListener} wiring rather than mocked collaborators. This is exactly the class of
 * bug {@code SessionEventProcessorSpec}/{@code SessionEventsConsumerSpec} (Spock, mocked
 * collaborators, in {@code notification-impl}) cannot catch — a real wiring mistake between
 * {@code session-impl}'s {@code SessionOutboxRabbitConfig} (declares the exchange) and
 * {@code notification-impl}'s {@code SessionEventsRabbitConfig} (declares the queue/binding) was
 * only caught by a full {@code @SpringBootTest} context, not by either module's own tests — see
 * the bean-name collision noted in the ticket doc.
 * <p>
 * Publishes directly to the exchange (bypassing {@code SessionOutboxRelayJob}'s outbox-table/
 * {@code @Scheduled} drain) — this class is testing the consumer side of the wire, not the
 * producer side, which SESSION-15's own tests already cover.
 */
class SessionEventsConsumerIntegrationTest extends RabbitMqTestContainerBase {

    private static final String EXCHANGE = "sportconnect.events";

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private ObjectMapper objectMapper;

    private void publish(String routingKey, String messageId, Object payload) throws Exception {
        String body = objectMapper.writeValueAsString(payload);
        rabbitTemplate.convertAndSend(EXCHANGE, routingKey, body, message -> {
            message.getMessageProperties().setMessageId(messageId);
            return message;
        });
    }

    @Test
    void sessionJoinRequestCreatedEvent_consumedOverRealRabbitMq_producesANotification() throws Exception {
        UUID actorId = UUID.randomUUID();
        UUID recipientId = UUID.randomUUID();
        SessionJoinRequestCreatedEvent payload = SessionJoinRequestCreatedEvent.builder()
                .sessionId(999L).actorId(actorId).recipientUserId(recipientId).build();

        publish("session.join_request.created", "it-test:" + UUID.randomUUID(), payload);

        await().atMost(10, TimeUnit.SECONDS).untilAsserted(() -> {
            List<Notification> notifications = notificationRepository
                    .findByRecipientUserIdOrderByUpdatedAtDesc(recipientId, PageRequest.of(0, 10))
                    .getContent();
            assertThat(notifications).hasSize(1);
            Notification notification = notifications.get(0);
            assertThat(notification.getType()).isEqualTo("session.join_request.created");
            assertThat(notification.getEntityType()).isEqualTo("SESSION");
            assertThat(notification.getEntityId()).isEqualTo("999");
            assertThat(notification.getActorIds()).containsExactly(actorId);
        });
    }

    @Test
    void redeliveredMessage_isDedupedAndDoesNotDoubleCountTheAggregation() throws Exception {
        UUID actorId = UUID.randomUUID();
        UUID recipientId = UUID.randomUUID();
        String messageId = "it-test-dedup:" + UUID.randomUUID();
        SessionJoinRequestCreatedEvent payload = SessionJoinRequestCreatedEvent.builder()
                .sessionId(998L).actorId(actorId).recipientUserId(recipientId).build();

        // Same messageId published twice, simulating a RabbitMQ redelivery.
        publish("session.join_request.created", messageId, payload);
        publish("session.join_request.created", messageId, payload);

        await().atMost(10, TimeUnit.SECONDS).untilAsserted(() -> {
            List<Notification> notifications = notificationRepository
                    .findByRecipientUserIdOrderByUpdatedAtDesc(recipientId, PageRequest.of(0, 10))
                    .getContent();
            assertThat(notifications).hasSize(1);
            assertThat(notifications.get(0).getActorCount()).isEqualTo(1);
        });
    }
}
