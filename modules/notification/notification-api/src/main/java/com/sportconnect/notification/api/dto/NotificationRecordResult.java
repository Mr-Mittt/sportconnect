package com.sportconnect.notification.api.dto;

/**
 * What {@code NotificationService#recordEvent} produces after an aggregation upsert: the id of the
 * (possibly just-created) row, and the recipient's unread count immediately after the write. Exists
 * so a caller that needs to trigger a live-delivery push (e.g. NTF-3's STOMP relay) has what it
 * needs without an extra query — {@code recordEvent} already knows both values at the point it
 * saves.
 */
public record NotificationRecordResult(Long notificationId, long unreadCount) {
}
