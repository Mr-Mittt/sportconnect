package com.sportconnect.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.notification.entity.Notification;
import com.sportconnect.notification.repository.NotificationRepository;
import com.sportconnect.user.api.event.FriendRequestAcceptedEvent;
import com.sportconnect.user.api.event.FriendRequestCreatedEvent;
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
 * Real end-to-end coverage for U13's {@code UserEventsConsumer} wiring — publishes {@code user.*}
 * friend-request events directly onto a real RabbitMQ broker and asserts a real {@code Notification}
 * row appears, going through the actual exchange / {@code notification.events.user} queue /
 * {@code user.*.*} binding / {@code @RabbitListener} / {@code UserEventProcessor} path. This is the
 * class of wiring bug {@code UserEventsConsumerSpec}/{@code UserEventProcessorSpec} (mocked
 * collaborators, in {@code notification-impl}) cannot catch — exactly like
 * {@link SessionEventsConsumerIntegrationTest} does for the session side.
 * <p>
 * Publishes straight to the exchange, bypassing {@code UserOutboxRelayJob}'s outbox-table drain —
 * the producer side is covered by {@code user-impl}'s own specs; this tests the consumer side of
 * the wire.
 */
class UserFriendEventsConsumerIntegrationTest extends RabbitMqTestContainerBase {

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
    void friendRequestCreatedEvent_consumedOverRealRabbitMq_notifiesTheReceiver() throws Exception {
        UUID senderId = UUID.randomUUID();
        UUID receiverId = UUID.randomUUID();
        FriendRequestCreatedEvent payload = FriendRequestCreatedEvent.builder()
                .requestId(UUID.randomUUID()).actorId(senderId).recipientUserId(receiverId).build();

        publish("user.friend_request.created", "it-test:" + UUID.randomUUID(), payload);

        await().atMost(10, TimeUnit.SECONDS).untilAsserted(() -> {
            List<Notification> notifications = notificationRepository
                    .findByRecipientUserIdOrderByUpdatedAtDesc(receiverId, PageRequest.of(0, 10))
                    .getContent();
            assertThat(notifications).hasSize(1);
            Notification notification = notifications.get(0);
            assertThat(notification.getType()).isEqualTo("user.friend_request.created");
            assertThat(notification.getEntityType()).isEqualTo("USER");
            assertThat(notification.getEntityId()).isEqualTo(senderId.toString());
            assertThat(notification.getActorIds()).containsExactly(senderId);
        });
    }

    @Test
    void friendRequestAcceptedEvent_consumedOverRealRabbitMq_notifiesTheOriginalSender() throws Exception {
        UUID originalSenderId = UUID.randomUUID();
        UUID accepterId = UUID.randomUUID();
        FriendRequestAcceptedEvent payload = FriendRequestAcceptedEvent.builder()
                .requestId(UUID.randomUUID()).actorId(accepterId).recipientUserId(originalSenderId).build();

        publish("user.friend_request.accepted", "it-test:" + UUID.randomUUID(), payload);

        await().atMost(10, TimeUnit.SECONDS).untilAsserted(() -> {
            List<Notification> notifications = notificationRepository
                    .findByRecipientUserIdOrderByUpdatedAtDesc(originalSenderId, PageRequest.of(0, 10))
                    .getContent();
            assertThat(notifications).hasSize(1);
            Notification notification = notifications.get(0);
            assertThat(notification.getType()).isEqualTo("user.friend_request.accepted");
            assertThat(notification.getEntityType()).isEqualTo("USER");
            assertThat(notification.getEntityId()).isEqualTo(accepterId.toString());
            assertThat(notification.getActorIds()).containsExactly(accepterId);
        });
    }

    @Test
    void redeliveredMessage_isDedupedAndDoesNotDoubleCountTheAggregation() throws Exception {
        UUID senderId = UUID.randomUUID();
        UUID receiverId = UUID.randomUUID();
        String messageId = "it-test-dedup:" + UUID.randomUUID();
        FriendRequestCreatedEvent payload = FriendRequestCreatedEvent.builder()
                .requestId(UUID.randomUUID()).actorId(senderId).recipientUserId(receiverId).build();

        publish("user.friend_request.created", messageId, payload);
        publish("user.friend_request.created", messageId, payload);

        await().atMost(10, TimeUnit.SECONDS).untilAsserted(() -> {
            List<Notification> notifications = notificationRepository
                    .findByRecipientUserIdOrderByUpdatedAtDesc(receiverId, PageRequest.of(0, 10))
                    .getContent();
            assertThat(notifications).hasSize(1);
            assertThat(notifications.get(0).getActorCount()).isEqualTo(1);
        });
    }
}
