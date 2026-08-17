package com.sportconnect.notification.push;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionPhase;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Bridges {@link NotificationLiveUpdateEvent} to the actual STOMP push, deferred until the
 * recording transaction commits. {@code SessionEventProcessor.process()} wraps the dedup-marker
 * insert and every {@code recordEvent} call for a fan-out event in one {@code @Transactional}
 * method — pushing before that commits could race a client's REST re-fetch against not-yet-visible
 * data, or fire for a recipient whose row later rolls back if a later recipient in the same
 * fan-out loop throws. {@code AFTER_COMMIT} is not a durability mechanism here (contrast with the
 * outbox pattern used for the RabbitMQ publish side) — a missed ping isn't data loss, since NTF-1's
 * REST endpoints stay the source of truth and the client polls as a fallback. It's just an
 * ordering guard: never push before the write it describes is actually visible.
 */
@Component
@RequiredArgsConstructor
public class NotificationLiveUpdateListener {

    private final NotificationPushService notificationPushService;

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMMIT)
    public void onNotificationRecorded(NotificationLiveUpdateEvent event) {
        notificationPushService.pushLiveUpdate(event.recipientUserId(), event.notificationId(), event.unreadCount());
    }
}
