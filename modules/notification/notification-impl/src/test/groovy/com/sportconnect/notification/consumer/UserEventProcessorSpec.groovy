package com.sportconnect.notification.consumer

import com.sportconnect.notification.api.dto.NotificationRecordResult
import com.sportconnect.notification.api.service.NotificationService
import com.sportconnect.notification.push.NotificationLiveUpdateEvent
import com.sportconnect.notification.repository.ProcessedMessageRepository
import org.springframework.context.ApplicationEventPublisher
import spock.lang.Specification
import spock.lang.Subject

class UserEventProcessorSpec extends Specification {

    ProcessedMessageRepository processedMessageRepository = Mock()
    NotificationService notificationService = Mock()
    ApplicationEventPublisher eventPublisher = Mock()

    @Subject
    UserEventProcessor processor = new UserEventProcessor(
            processedMessageRepository, notificationService, eventPublisher)

    def "process() inserts the dedup marker, records a USER-entity notification, and publishes a live-update event"() {
        given:
        def actorId = UUID.randomUUID()
        def recipientId = UUID.randomUUID()
        def event = new ParsedUserEvent("user.friend_request.created", actorId, recipientId)

        when:
        processor.process("mid-1", event)

        then:
        1 * processedMessageRepository.insertIfAbsent("mid-1") >> 1
        1 * notificationService.recordEvent(recipientId, "user.friend_request.created", "USER", actorId.toString(), actorId) >>
                new NotificationRecordResult(7L, 3L)
        1 * eventPublisher.publishEvent({ NotificationLiveUpdateEvent e ->
            e.recipientUserId() == recipientId && e.notificationId() == 7L && e.unreadCount() == 3L
        })
    }

    def "process() skips everything when the message was already processed"() {
        given:
        def event = new ParsedUserEvent("user.friend_request.accepted", UUID.randomUUID(), UUID.randomUUID())

        when:
        processor.process("mid-1", event)

        then:
        1 * processedMessageRepository.insertIfAbsent("mid-1") >> 0
        0 * notificationService._
        0 * eventPublisher._
    }

    def "process() skips recordEvent and the live-update event when the recipient is the actor"() {
        given:
        def selfId = UUID.randomUUID()
        def event = new ParsedUserEvent("user.friend_request.created", selfId, selfId)

        when:
        processor.process("mid-1", event)

        then:
        1 * processedMessageRepository.insertIfAbsent("mid-1") >> 1
        0 * notificationService.recordEvent(*_)
        0 * eventPublisher.publishEvent(_)
    }
}
