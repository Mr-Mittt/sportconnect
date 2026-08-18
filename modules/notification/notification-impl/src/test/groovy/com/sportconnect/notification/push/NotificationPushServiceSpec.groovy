package com.sportconnect.notification.push

import org.springframework.messaging.simp.SimpMessagingTemplate
import spock.lang.Specification
import spock.lang.Subject

class NotificationPushServiceSpec extends Specification {

    SimpMessagingTemplate messagingTemplate = Mock()

    @Subject
    NotificationPushService pushService = new NotificationPushService(messagingTemplate)

    def "pushLiveUpdate sends to the recipient's user-destination queue with the notification id and unread count"() {
        given:
        def recipientId = UUID.randomUUID()

        when:
        pushService.pushLiveUpdate(recipientId, 42L, 3L)

        then:
        1 * messagingTemplate.convertAndSendToUser(recipientId.toString(), "/queue/notifications",
                { NotificationLiveUpdateMessage m -> m.notificationId() == 42L && m.unreadCount() == 3L })
    }
}
