package com.sportconnect.notification.consumer;

import com.sportconnect.notification.api.dto.NotificationRecordResult;
import com.sportconnect.notification.api.service.NotificationService;
import com.sportconnect.notification.push.NotificationLiveUpdateEvent;
import com.sportconnect.notification.repository.ProcessedMessageRepository;
import com.sportconnect.session.api.service.SessionService;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The transactional half of {@link SessionEventsConsumer} — split into its own bean because
 * {@code @Transactional} on a method called via self-invocation (i.e. from within
 * {@code SessionEventsConsumer} itself) would silently never go through the Spring proxy and
 * never actually start a transaction. {@link #process} is the only place the dedup marker insert
 * and the resulting {@code NotificationService.recordEvent} call(s) share one transaction — the
 * whole point of the dedup marker (a message redelivered after this method half-completes must
 * roll back both together, not commit one without the other).
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class SessionEventProcessor {

    private static final String ENTITY_TYPE_SESSION = "SESSION";

    private final ProcessedMessageRepository processedMessageRepository;
    private final NotificationService notificationService;
    private final SessionService sessionService;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * Inserts the dedup marker first (atomically — see {@code ProcessedMessageRepository
     * .insertIfAbsent}'s Javadoc for why this can't be a plain {@code save()}) — a redelivered
     * {@code messageId} inserts 0 rows, logged and skipped without touching
     * {@code NotificationService} again. Otherwise resolves recipient(s) and calls
     * {@code recordEvent}, skipping any recipient that equals {@code actorId} (never notify
     * someone about their own action — reachable e.g. for a group-linked session's non-auto-
     * joined creator requesting to join their own session). Each successful {@code recordEvent}
     * publishes a {@code NotificationLiveUpdateEvent} — {@code NotificationLiveUpdateListener}
     * only acts on it after this whole method's transaction commits (see that listener's Javadoc).
     */
    @Transactional
    public void process(String messageId, ParsedSessionEvent event) {
        if (processedMessageRepository.insertIfAbsent(messageId) == 0) {
            log.debug("Skipping already-processed session event: messageId={}", messageId);
            return;
        }

        String entityId = event.sessionId().toString();
        if (event.fanOutStatuses() != null) {
            sessionService.getParticipantIdsByStatuses(event.sessionId(), event.fanOutStatuses()).stream()
                    .filter(recipientId -> !recipientId.equals(event.actorId()))
                    .forEach(recipientId -> recordAndPublish(recipientId, event, entityId));
        } else {
            UUID recipient = event.singleRecipient();
            if (!recipient.equals(event.actorId())) {
                recordAndPublish(recipient, event, entityId);
            }
        }
    }

    private void recordAndPublish(UUID recipientId, ParsedSessionEvent event, String entityId) {
        NotificationRecordResult result = notificationService.recordEvent(
                recipientId, event.type(), ENTITY_TYPE_SESSION, entityId, event.actorId());
        eventPublisher.publishEvent(
                new NotificationLiveUpdateEvent(recipientId, result.notificationId(), result.unreadCount()));
    }
}
