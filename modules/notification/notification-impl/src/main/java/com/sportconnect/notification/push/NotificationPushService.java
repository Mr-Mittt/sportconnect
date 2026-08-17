package com.sportconnect.notification.push;

import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Service;

/**
 * Sends the live STOMP ping for a just-recorded notification. Relies on
 * {@code StompAuthChannelInterceptor} having set each session's {@code Principal#getName()} to the
 * recipient's user id string at {@code CONNECT} time — that's what lets
 * {@link SimpMessagingTemplate#convertAndSendToUser} resolve {@code recipientUserId} to the right
 * session(s), fanning out to every tab/device the user currently has connected.
 */
@Service
@RequiredArgsConstructor
public class NotificationPushService {

    private static final String DESTINATION = "/queue/notifications";

    private final SimpMessagingTemplate messagingTemplate;

    public void pushLiveUpdate(UUID recipientUserId, Long notificationId, long unreadCount) {
        messagingTemplate.convertAndSendToUser(
                recipientUserId.toString(),
                DESTINATION,
                new NotificationLiveUpdateMessage(notificationId, unreadCount));
    }
}
