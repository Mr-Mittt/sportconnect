package com.sportconnect.notification.push;

import java.util.UUID;

/**
 * Published once per resolved recipient after {@code NotificationService.recordEvent} returns —
 * consumed by {@link NotificationLiveUpdateListener} after the enclosing transaction commits. See
 * that listener's Javadoc for why this can't just be a direct call from inside {@code recordEvent}
 * or its caller.
 */
public record NotificationLiveUpdateEvent(UUID recipientUserId, Long notificationId, long unreadCount) {
}
