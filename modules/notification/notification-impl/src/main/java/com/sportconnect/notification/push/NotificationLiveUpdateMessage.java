package com.sportconnect.notification.push;

/**
 * The STOMP wire payload pushed to {@code /user/queue/notifications} — deliberately a lightweight
 * "something changed" ping, not the full {@code NotificationResponse}. The client re-fetches full
 * content via the existing REST endpoints when it actually needs to render something; this only
 * needs to carry enough to update a badge and know which row just changed.
 */
public record NotificationLiveUpdateMessage(Long notificationId, long unreadCount) {
}
