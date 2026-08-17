package com.sportconnect.notification.access

import com.sportconnect.notification.entity.Notification
import spock.lang.Specification
import spock.lang.Subject

class NotificationGateSpec extends Specification {

    @Subject
    NotificationGate notificationGate = new NotificationGate()

    UUID recipientId = UUID.randomUUID()

    private Notification notification() {
        Notification.builder()
                .id(1L)
                .recipientUserId(recipientId)
                .type("post.comment.created")
                .entityType("POST")
                .entityId("42")
                .build()
    }

    def "isAvailable is always true"() {
        expect:
        notificationGate.isAvailable(notification())
    }

    def "isVisibleTo is true for the recipient"() {
        expect:
        notificationGate.isVisibleTo(notification(), recipientId)
    }

    def "isVisibleTo is false for anyone else"() {
        expect:
        !notificationGate.isVisibleTo(notification(), UUID.randomUUID())
    }
}
