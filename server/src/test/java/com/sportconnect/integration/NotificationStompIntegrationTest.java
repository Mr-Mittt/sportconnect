package com.sportconnect.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.auth.api.service.JwtTokenService;
import com.sportconnect.notification.push.NotificationLiveUpdateMessage;
import com.sportconnect.session.api.event.SessionJoinRequestCreatedEvent;
import java.lang.reflect.Type;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.messaging.converter.MappingJackson2MessageConverter;
import org.springframework.messaging.simp.stomp.StompBrokerRelayMessageHandler;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompFrameHandler;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

/**
 * Real end-to-end coverage for NTF-3's live-delivery path: a session event, published onto a real
 * RabbitMQ broker (via {@link RabbitMqStompTestContainerBase}, whose container also has the
 * {@code rabbitmq_stomp} plugin enabled), goes through the real {@code SessionEventsConsumer} →
 * {@code SessionEventProcessor} → {@code NotificationService.recordEvent} →
 * {@code NotificationLiveUpdateListener} (AFTER_COMMIT) → {@code NotificationPushService} chain,
 * and this test asserts a real STOMP frame arrives on a real client connected to
 * {@code /user/queue/notifications} — proving the whole wire, not mocked collaborators (the class
 * of bug {@code StompAuthChannelInterceptorSpec}/{@code NotificationLiveUpdateListenerSpec}
 * (Spock, in {@code notification-impl}) cannot catch on their own).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class NotificationStompIntegrationTest extends RabbitMqStompTestContainerBase {

    private static final String EXCHANGE = "sportconnect.events";

    @LocalServerPort
    private int port;

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JwtTokenService jwtTokenService;

    @Autowired
    private StompBrokerRelayMessageHandler stompBrokerRelayMessageHandler;

    private WebSocketStompClient stompClient;
    private StompSession stompSession;

    @AfterEach
    void disconnect() {
        if (stompSession != null && stompSession.isConnected()) {
            stompSession.disconnect();
        }
    }

    private void publishSessionEvent(String routingKey, String messageId, Object payload) throws Exception {
        String body = objectMapper.writeValueAsString(payload);
        rabbitTemplate.convertAndSend(EXCHANGE, routingKey, body, message -> {
            message.getMessageProperties().setMessageId(messageId);
            return message;
        });
    }

    private String mintAccessToken(UUID userId) {
        Map<String, Object> userData = Map.of(
                "id", userId,
                "email", "it-test-" + userId + "@example.com",
                "username", "it-test-" + userId,
                "roles", List.of("USER"));
        return jwtTokenService.generateAccessToken(userData);
    }

    private CompletableFuture<NotificationLiveUpdateMessage> subscribeAsUser(UUID userId) throws Exception {
        // The relay's own connection to RabbitMQ's STOMP port is established asynchronously
        // (StompBrokerRelayMessageHandler is a SmartLifecycle bean started during context refresh,
        // but its actual TCP/STOMP handshake to the broker completes after that) — a client that
        // connects too early gets a STOMP ERROR frame ("Broker not available.") even though
        // everything is correctly configured. Wait for the relay to report ready first.
        await().atMost(15, TimeUnit.SECONDS).until(stompBrokerRelayMessageHandler::isBrokerAvailable);

        stompClient = new WebSocketStompClient(new StandardWebSocketClient());
        stompClient.setMessageConverter(new MappingJackson2MessageConverter());

        StompHeaders connectHeaders = new StompHeaders();
        connectHeaders.add("Authorization", "Bearer " + mintAccessToken(userId));

        CompletableFuture<NotificationLiveUpdateMessage> received = new CompletableFuture<>();
        CompletableFuture<StompSession> sessionFuture = stompClient.connectAsync(
                "ws://localhost:{port}/ws", new org.springframework.web.socket.WebSocketHttpHeaders(), connectHeaders,
                new StompSessionHandlerAdapter() {
                    @Override
                    public void afterConnected(StompSession session, StompHeaders connectedHeaders) {
                        session.subscribe("/user/queue/notifications", new StompFrameHandler() {
                            @Override
                            public Type getPayloadType(StompHeaders headers) {
                                return NotificationLiveUpdateMessage.class;
                            }

                            @Override
                            public void handleFrame(StompHeaders headers, Object payload) {
                                received.complete((NotificationLiveUpdateMessage) payload);
                            }
                        });
                    }

                    // Both overridden so a CONNECT-time rejection (e.g. "Broker not available.")
                    // or an abrupt socket close fails the test with a clear cause instead of the
                    // `received` future just hanging silently until the test's own timeout.
                    @Override
                    public void handleException(StompSession session, StompCommand command, StompHeaders headers, byte[] payload, Throwable exception) {
                        received.completeExceptionally(exception);
                    }

                    @Override
                    public void handleTransportError(StompSession session, Throwable exception) {
                        received.completeExceptionally(exception);
                    }
                },
                port);
        stompSession = sessionFuture.get(10, TimeUnit.SECONDS);
        return received;
    }

    @Test
    void sessionJoinRequestCreatedEvent_producesALiveStompFrameOnTheRecipientsSubscribedDestination() throws Exception {
        UUID actorId = UUID.randomUUID();
        UUID recipientId = UUID.randomUUID();

        CompletableFuture<NotificationLiveUpdateMessage> received = subscribeAsUser(recipientId);

        SessionJoinRequestCreatedEvent payload = SessionJoinRequestCreatedEvent.builder()
                .sessionId(777L).actorId(actorId).recipientUserId(recipientId).build();
        publishSessionEvent("session.join_request.created", "stomp-it-test:" + UUID.randomUUID(), payload);

        NotificationLiveUpdateMessage message = received.get(15, TimeUnit.SECONDS);

        assertThat(message.notificationId()).isNotNull();
        assertThat(message.unreadCount()).isEqualTo(1L);
    }
}
