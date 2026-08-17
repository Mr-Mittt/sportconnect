package com.sportconnect.notification.push

import spock.lang.Specification
import spock.lang.Subject

class NotificationLiveUpdateListenerSpec extends Specification {

    NotificationPushService notificationPushService = Mock()

    @Subject
    NotificationLiveUpdateListener listener = new NotificationLiveUpdateListener(notificationPushService)

    def "onNotificationRecorded delegates to NotificationPushService with the event's fields"() {
        given:
        def recipientId = UUID.randomUUID()
        def event = new NotificationLiveUpdateEvent(recipientId, 7L, 4L)

        when:
        listener.onNotificationRecorded(event)

        then:
        1 * notificationPushService.pushLiveUpdate(recipientId, 7L, 4L)
    }
}
