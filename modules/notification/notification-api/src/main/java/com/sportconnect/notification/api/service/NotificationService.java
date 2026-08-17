package com.sportconnect.notification.api.service;

import com.sportconnect.notification.api.dto.NotificationResponse;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/**
 * Per-recipient aggregated notifications — see
 * {@code documentation/md/vision/NOTIFICATION_MODULE_VISION.md} for the full design and
 * {@code modules/notification/docs/NTF-1_MODULE_SCAFFOLDING.md} for this module's scope. This
 * ticket (NTF-1) is scaffolding only — nothing in this codebase calls {@link #recordEvent} yet;
 * NTF-2's RabbitMQ consumer is the first real caller once it exists.
 */
public interface NotificationService {

    /** Newest-active-first (by last aggregation update, not creation), paginated. */
    Page<NotificationResponse> getNotifications(UUID recipientUserId, Pageable pageable);

    long getUnreadCount(UUID recipientUserId);

    /**
     * Marks one notification read. Throws {@code NotFoundException} if it doesn't exist,
     * {@code ForbiddenException} if it exists but doesn't belong to {@code recipientUserId} (see
     * {@code NotificationGate}). Idempotent — marking an already-read row read again is a no-op.
     */
    void markAsRead(UUID recipientUserId, Long notificationId);

    /**
     * Records one notification-worthy event, upserting into the open (unread) aggregation group
     * for {@code (recipientUserId, type, entityType, entityId)} if one exists, or starting a new
     * one otherwise. {@code actorId} is deduped and prepended into the bounded 3-entry
     * {@code actorIds} list; {@code actorCount} is bumped unconditionally (it counts total matched
     * events, not distinct actors — see {@code Notification}'s Javadoc). A row already marked read
     * is never matched — it's a closed group, and this always starts a fresh row in that case.
     */
    void recordEvent(UUID recipientUserId, String type, String entityType, String entityId, UUID actorId);
}
