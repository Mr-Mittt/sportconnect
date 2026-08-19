package com.sportconnect.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.notification.entity.Notification;
import com.sportconnect.notification.repository.NotificationRepository;
import com.sportconnect.session.api.dto.FeeType;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.SessionType;
import com.sportconnect.session.api.event.SessionCommentCreatedEvent;
import com.sportconnect.session.api.event.SessionJoinRequestCreatedEvent;
import com.sportconnect.session.api.event.SessionParticipantLeftEvent;
import com.sportconnect.session.api.event.SessionStatusStartedEvent;
import com.sportconnect.session.entity.Session;
import com.sportconnect.session.entity.SessionParticipant;
import com.sportconnect.session.repository.SessionParticipantRepository;
import com.sportconnect.session.repository.SessionRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
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
 * <p>
 * SESSION-20 added {@code sessionCommentCreatedEvent_...}, the only end-to-end proof that a comment
 * on a COMPLETED/CANCELLED session still fans out — every Spock spec on that path mocks the exact
 * collaborator that was broken.
 * <p>
 * SESSION-18's {@code sessionStatusStartedEvent_...} test exists for the same reason as the rest
 * of this class, plus one more: it's the only place the null-{@code actorId} path (SESSION-18's
 * crux fix in {@code NotificationServiceImpl.recordEvent}) is verified against a real
 * {@code UuidListConverter}/Hibernate/DB round trip — {@code NotificationServiceImplSpec}'s
 * equivalent case mocks {@code NotificationRepository}, so it never actually exercises the
 * converter that originally NPE'd on a null list entry.
 */
class SessionEventsConsumerIntegrationTest extends RabbitMqTestContainerBase {

    private static final String EXCHANGE = "sportconnect.events";

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Autowired
    private NotificationRepository notificationRepository;

    @Autowired
    private SessionRepository sessionRepository;

    @Autowired
    private SessionParticipantRepository sessionParticipantRepository;

    @Autowired
    private ObjectMapper objectMapper;

    private void publish(String routingKey, String messageId, Object payload) throws Exception {
        String body = objectMapper.writeValueAsString(payload);
        rabbitTemplate.convertAndSend(EXCHANGE, routingKey, body, message -> {
            message.getMessageProperties().setMessageId(messageId);
            return message;
        });
    }

    /**
     * Inserted directly via repositories (no real {@code Post} row for {@code postId} — SESSION-11
     * dropped the DB-level FK, and this class isn't testing the post/comment gate), same technique
     * as {@code SessionPostAccessGateIntegrationTest}.
     */
    private Long createSessionWithJoinedParticipant(UUID creatorId, UUID participantId) {
        return createSessionWithJoinedParticipant(creatorId, participantId, SessionStatus.ONGOING);
    }

    private Long createSessionWithJoinedParticipant(UUID creatorId, UUID participantId, SessionStatus status) {
        Session session = Session.builder()
                .postId(System.nanoTime())
                .sessionType(SessionType.STANDALONE)
                .createdBy(creatorId)
                .sportId(1L)
                .locationId(1L)
                .scheduledStart(LocalDateTime.now().plusDays(1))
                .status(status)
                .capacity(9999)
                .feeType(FeeType.FREE)
                .initialSlot(0)
                .autoApprove(false)
                .build();
        Long sessionId = sessionRepository.save(session).getId();
        sessionParticipantRepository.save(SessionParticipant.builder()
                .sessionId(sessionId)
                .userId(participantId)
                .status(ParticipantStatus.JOINED)
                .build());
        return sessionId;
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

    @Test
    void sessionStatusStartedEvent_consumedOverRealRabbitMq_notifiesJoinedParticipantWithNoActor() throws Exception {
        UUID creatorId = UUID.randomUUID();
        UUID participantId = UUID.randomUUID();
        Long sessionId = createSessionWithJoinedParticipant(creatorId, participantId);
        SessionStatusStartedEvent payload = SessionStatusStartedEvent.builder().sessionId(sessionId).build();

        publish("session.status.started", "it-test:" + UUID.randomUUID(), payload);

        await().atMost(10, TimeUnit.SECONDS).untilAsserted(() -> {
            List<Notification> notifications = notificationRepository
                    .findByRecipientUserIdOrderByUpdatedAtDesc(participantId, PageRequest.of(0, 10))
                    .getContent();
            assertThat(notifications).hasSize(1);
            Notification notification = notifications.get(0);
            assertThat(notification.getType()).isEqualTo("session.status.started");
            assertThat(notification.getEntityType()).isEqualTo("SESSION");
            assertThat(notification.getEntityId()).isEqualTo(String.valueOf(sessionId));
            // SESSION-18: no real actor — proves the null-actorId path survives a real
            // UuidListConverter/Hibernate persist round-trip, not just a mocked repository.
            assertThat(notification.getActorIds()).isEmpty();
            assertThat(notification.getActorCount()).isEqualTo(1);
        });
    }

    /**
     * SESSION-19 — the only place {@code session.participant.left}'s full path is exercised for
     * real: the new exchange/queue binding for this routing key, recipient resolution through the
     * real {@code getParticipantIdsByStatuses} (including its {@code SCHEDULED}/{@code ONGOING}
     * session-status gate) against a real DB, and a real {@code Notification} row. Both Spock specs
     * for this event mock their collaborators — the producer spec mocks {@code SessionOutboxWriter},
     * the consumer spec mocks {@code SessionEventProcessor} — so neither proves any of that.
     * <p>
     * The leaver is seeded as a {@code LEFT} row, which is the real post-{@code leaveSession} state:
     * they are excluded from the recipient set by their participant status, before
     * {@code SessionEventProcessor}'s actor filter is ever reached. Asserting they receive nothing
     * pins that down either way.
     */
    @Test
    void sessionParticipantLeftEvent_consumedOverRealRabbitMq_notifiesRemainingJoinedParticipantsButNotTheLeaver()
            throws Exception {
        UUID creatorId = UUID.randomUUID();
        UUID remainingParticipantId = UUID.randomUUID();
        UUID leaverId = UUID.randomUUID();
        Long sessionId = createSessionWithJoinedParticipant(creatorId, remainingParticipantId);
        sessionParticipantRepository.save(SessionParticipant.builder()
                .sessionId(sessionId)
                .userId(leaverId)
                .status(ParticipantStatus.LEFT)
                .build());
        SessionParticipantLeftEvent payload = SessionParticipantLeftEvent.builder()
                .sessionId(sessionId)
                .actorId(leaverId)
                .build();

        publish("session.participant.left", "it-test:" + UUID.randomUUID(), payload);

        await().atMost(10, TimeUnit.SECONDS).untilAsserted(() -> {
            List<Notification> notifications = notificationRepository
                    .findByRecipientUserIdOrderByUpdatedAtDesc(remainingParticipantId, PageRequest.of(0, 10))
                    .getContent();
            assertThat(notifications).hasSize(1);
            Notification notification = notifications.get(0);
            assertThat(notification.getType()).isEqualTo("session.participant.left");
            assertThat(notification.getEntityType()).isEqualTo("SESSION");
            assertThat(notification.getEntityId()).isEqualTo(String.valueOf(sessionId));
            assertThat(notification.getActorIds()).containsExactly(leaverId);
        });

        assertThat(notificationRepository
                .findByRecipientUserIdOrderByUpdatedAtDesc(leaverId, PageRequest.of(0, 10))
                .getContent()).isEmpty();
    }

    /**
     * SESSION-20's regression test — the only place the fix is proven end to end. Every Spock spec
     * involved mocks the thing that was broken: {@code SessionEventProcessorSpec} mocks
     * {@code SessionService}, and {@code SessionEventsConsumerSpec} mocks the processor, so neither
     * ever runs the real recipient resolution against a real session row. Before the fix, the
     * hardcoded {@code (SCHEDULED, ONGOING)} gate inside {@code getParticipantIdsByStatuses} made
     * this exact scenario — a comment on a session that already finished, which {@code SessionGate}
     * explicitly permits (post-game recap) — resolve zero recipients and notify nobody, while the
     * outbox row itself was written perfectly correctly.
     * <p>
     * Parameterized over both statuses the old gate excluded: {@code CANCELLED} was confirmed at
     * pickup to notify as well, on the same reasoning ("why was this cancelled?" is exactly when a
     * participant wants to hear about it) — commenting is permitted there too.
     */
    @ParameterizedTest
    @EnumSource(value = SessionStatus.class, names = {"COMPLETED", "CANCELLED"})
    void sessionCommentCreatedEvent_onASessionTheOldStatusGateExcluded_stillNotifiesParticipants(
            SessionStatus sessionStatus) throws Exception {
        UUID commenterId = UUID.randomUUID();
        UUID participantId = UUID.randomUUID();
        Long sessionId = createSessionWithJoinedParticipant(commenterId, participantId, sessionStatus);
        SessionCommentCreatedEvent payload = SessionCommentCreatedEvent.builder()
                .sessionId(sessionId)
                .actorId(commenterId)
                .commentId(42L)
                .build();

        publish("session.comment.created", "it-test:" + UUID.randomUUID(), payload);

        await().atMost(10, TimeUnit.SECONDS).untilAsserted(() -> {
            List<Notification> notifications = notificationRepository
                    .findByRecipientUserIdOrderByUpdatedAtDesc(participantId, PageRequest.of(0, 10))
                    .getContent();
            assertThat(notifications).hasSize(1);
            Notification notification = notifications.get(0);
            assertThat(notification.getType()).isEqualTo("session.comment.created");
            assertThat(notification.getEntityType()).isEqualTo("SESSION");
            assertThat(notification.getEntityId()).isEqualTo(String.valueOf(sessionId));
            assertThat(notification.getActorIds()).containsExactly(commenterId);
        });

        // The commenter is still filtered out by SessionEventProcessor's actor check — loosening
        // the session-status gate must not have loosened that too.
        assertThat(notificationRepository
                .findByRecipientUserIdOrderByUpdatedAtDesc(commenterId, PageRequest.of(0, 10))
                .getContent()).isEmpty();
    }
}
