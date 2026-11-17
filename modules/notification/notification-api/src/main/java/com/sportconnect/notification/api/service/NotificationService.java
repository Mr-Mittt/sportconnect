package com.sportconnect.notification.api.service;

import com.sportconnect.notification.api.dto.NotificationRecordResult;
import com.sportconnect.notification.api.dto.NotificationResponse;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/**
 * Per-recipient aggregated notifications — see
 * {@code documentation/md/vision/NOTIFICATION_MODULE_VISION.md} for the full design and
 * {@code modules/notification/docs/MVP/NTF-1_MODULE_SCAFFOLDING.md} for this module's scope. NTF-2's
 * RabbitMQ consumer is {@link #recordEvent}'s caller; NTF-3 uses its return value to trigger a live
 * STOMP push after the write commits.
 */
public interface NotificationService {

    /** Newest-active-first (by last aggregation update, not creation), paginated. */
    Page<NotificationResponse> getNotifications(UUID recipientUserId, Pageable pageable);

    long getUnreadCount(UUID recipientUserId);

    /**
     * Marks one notification read. Throws {@code NotFoundException} ({@code NOTIFICATION_NOT_FOUND})
     * if it doesn't exist, {@code ForbiddenException} ({@code NOTIFICATION_FORBIDDEN}) if it exists
     * but doesn't belong to {@code recipientUserId} (see {@code NotificationGate}). Idempotent — marking an already-read row read again is a no-op.
     */
    void markAsRead(UUID recipientUserId, Long notificationId);

    /**
     * NTF-8: hard-deletes every notification of {@code recipientUserId} that is already read, for good (no soft delete,
     * nothing is kept). Unread notifications and other users' notifications are never touched, so there is no
     * not-found or forbidden case; it does nothing and returns 0 when there is nothing read. The unread count does not
     * change, and a later matching event starts a fresh row, as after any mark-read.
     *
     * @return how many notifications were deleted
     */
    long deleteReadNotifications(UUID recipientUserId);

    /**
     * Records one notification-worthy event, upserting into the open (unread) aggregation group
     * for {@code (recipientUserId, type, entityType, entityId)} if one exists, or starting a new
     * one otherwise. {@code actorId} is deduped and prepended into the bounded 3-entry
     * {@code actorIds} list; {@code actorCount} is bumped unconditionally (it counts total matched
     * events, not distinct actors — see {@code Notification}'s Javadoc). A row already marked read
     * is never matched — it's a closed group, and this always starts a fresh row in that case.
     * {@code actorId} may be null (SESSION-18) for a system-triggered event with no human actor —
     * the actor list is left untouched in that case, but {@code actorCount} still increments.
     *
     * @return the upserted row's id and the recipient's unread count immediately after this write —
     *     used by NTF-3's live-delivery push so it doesn't need a second query for the same data.
     */
    default NotificationRecordResult recordEvent(UUID recipientUserId, String type, String entityType, String entityId, UUID actorId) {
        return recordEvent(recipientUserId, type, entityType, entityId, actorId, null);
    }

    /**
     * Same as the five-argument form, and the group's {@code message} is set to the given text on every write (NTF-8):
     * the latest event wins, so a later event with no message clears an earlier one rather than leaving a stale text
     * next to a newer event. The text is trimmed, a blank one becomes {@code null} and one over 500 characters is cut
     * to 500. Only types that carry a message ever pass one; the aggregation key includes the type, so every other
     * type's rows keep {@code null}.
     */
    NotificationRecordResult recordEvent(UUID recipientUserId, String type, String entityType, String entityId, UUID actorId, String message);
}
