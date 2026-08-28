package com.sportconnect.notification.consumer;

import com.sportconnect.notification.api.dto.NotificationRecordResult;
import com.sportconnect.notification.api.service.NotificationService;
import com.sportconnect.notification.push.NotificationLiveUpdateEvent;
import com.sportconnect.notification.repository.ProcessedMessageRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The transactional half of {@link UserEventsConsumer} (U13) — its own bean for the same reason as
 * {@link SessionEventProcessor}: {@code @Transactional} on a self-invoked method never goes through
 * the Spring proxy. {@link #process} is where the dedup-marker insert and the resulting
 * {@code recordEvent} call share one transaction.
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class UserEventProcessor {

    /**
     * The friend-request events point at a person, not a session/post/group — {@code entityId} is
     * the counterparty's user id (which equals {@code actorId} for both event types: the sender of
     * a {@code created}, the accepter of an {@code accepted}). Kept as the untyped
     * {@code entityType}/{@code entityId} string pair {@code Notification} already uses across
     * domains; {@code NotificationServiceImpl.getNotifications} only does title enrichment for
     * {@code SESSION}, so {@code USER} rows simply carry no {@code entityTitle} and the actor name
     * from {@code actorIds} is all the client needs.
     */
    private static final String ENTITY_TYPE_USER = "USER";

    private final ProcessedMessageRepository processedMessageRepository;
    private final NotificationService notificationService;
    private final ApplicationEventPublisher eventPublisher;

    /**
     * Inserts the dedup marker first (atomic — see {@code ProcessedMessageRepository.insertIfAbsent}):
     * a redelivered {@code messageId} inserts 0 rows and is skipped. Otherwise records one
     * notification for {@code recipientUserId} and publishes a {@code NotificationLiveUpdateEvent}
     * (delivered by {@code NotificationLiveUpdateListener} only after this transaction commits).
     * The {@code recipient == actor} guard is defensive — a friend-request event should never have
     * them equal (self-requests are rejected upstream) — and mirrors {@link SessionEventProcessor}.
     */
    @Transactional
    public void process(String messageId, ParsedUserEvent event) {
        if (processedMessageRepository.insertIfAbsent(messageId) == 0) {
            log.debug("Skipping already-processed user event: messageId={}", messageId);
            return;
        }

        if (event.recipientUserId().equals(event.actorId())) {
            log.warn("Skipping user event whose recipient is the actor: type={} messageId={}",
                    event.type(), messageId);
            return;
        }

        NotificationRecordResult result = notificationService.recordEvent(
                event.recipientUserId(), event.type(), ENTITY_TYPE_USER,
                event.actorId().toString(), event.actorId());
        eventPublisher.publishEvent(new NotificationLiveUpdateEvent(
                event.recipientUserId(), result.notificationId(), result.unreadCount()));
    }
}
