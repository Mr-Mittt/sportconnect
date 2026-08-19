package com.sportconnect.notification.consumer

import com.sportconnect.notification.api.dto.NotificationRecordResult
import com.sportconnect.notification.api.service.NotificationService
import com.sportconnect.notification.push.NotificationLiveUpdateEvent
import com.sportconnect.notification.repository.ProcessedMessageRepository
import com.sportconnect.session.api.dto.ParticipantStatus
import com.sportconnect.session.api.dto.SessionStatus
import com.sportconnect.session.api.service.SessionService
import org.springframework.context.ApplicationEventPublisher
import spock.lang.Specification
import spock.lang.Subject

class SessionEventProcessorSpec extends Specification {

    ProcessedMessageRepository processedMessageRepository = Mock()
    NotificationService notificationService = Mock()
    SessionService sessionService = Mock()
    ApplicationEventPublisher eventPublisher = Mock()

    @Subject
    SessionEventProcessor processor = new SessionEventProcessor(
            processedMessageRepository, notificationService, sessionService, eventPublisher)

    def "process() for a single-recipient event inserts the dedup marker, calls recordEvent once, and publishes a live-update event"() {
        given:
        def actorId = UUID.randomUUID()
        def recipientId = UUID.randomUUID()
        def event = ParsedSessionEvent.single("session.join_request.created", 1L, actorId, recipientId)

        when:
        processor.process("mid-1", event)

        then:
        1 * processedMessageRepository.insertIfAbsent("mid-1") >> 1
        1 * notificationService.recordEvent(recipientId, "session.join_request.created", "SESSION", "1", actorId) >>
                new NotificationRecordResult(10L, 2L)
        1 * eventPublisher.publishEvent({ NotificationLiveUpdateEvent e ->
            e.recipientUserId() == recipientId && e.notificationId() == 10L && e.unreadCount() == 2L
        })
    }

    def "process() skips recordEvent and the live-update event for a single-recipient event when the recipient is the actor"() {
        given:
        def selfId = UUID.randomUUID()
        def event = ParsedSessionEvent.single("session.join_request.created", 1L, selfId, selfId)

        when:
        processor.process("mid-1", event)

        then:
        1 * processedMessageRepository.insertIfAbsent("mid-1") >> 1
        0 * notificationService.recordEvent(*_)
        0 * eventPublisher.publishEvent(_)
    }

    def "process() for a fan-out event resolves participants, calls recordEvent once per recipient excluding the actor, and publishes one live-update event per recipient"() {
        given:
        def actorId = UUID.randomUUID()
        def other1 = UUID.randomUUID()
        def other2 = UUID.randomUUID()
        def statuses = [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED]
        def sessionStatuses = SessionStatus.values() as List
        def event = ParsedSessionEvent.fanOut("session.comment.created", 1L, actorId, statuses, sessionStatuses)

        when:
        processor.process("mid-1", event)

        then:
        1 * processedMessageRepository.insertIfAbsent("mid-1") >> 1
        1 * sessionService.getParticipantIdsByStatuses(1L, statuses, sessionStatuses) >> [actorId, other1, other2]
        1 * notificationService.recordEvent(other1, "session.comment.created", "SESSION", "1", actorId) >>
                new NotificationRecordResult(11L, 1L)
        1 * notificationService.recordEvent(other2, "session.comment.created", "SESSION", "1", actorId) >>
                new NotificationRecordResult(12L, 3L)
        0 * notificationService.recordEvent(actorId, _, _, _, _)
        1 * eventPublisher.publishEvent({ NotificationLiveUpdateEvent e ->
            e.recipientUserId() == other1 && e.notificationId() == 11L && e.unreadCount() == 1L
        })
        1 * eventPublisher.publishEvent({ NotificationLiveUpdateEvent e ->
            e.recipientUserId() == other2 && e.notificationId() == 12L && e.unreadCount() == 3L
        })
    }

    def "process() for a fan-out event with a null actorId (SESSION-18) notifies every resolved recipient — none are filtered out"() {
        given:
        def recipient1 = UUID.randomUUID()
        def recipient2 = UUID.randomUUID()
        def statuses = [ParticipantStatus.JOINED]
        def sessionStatuses = [SessionStatus.SCHEDULED, SessionStatus.ONGOING]
        def event = ParsedSessionEvent.fanOut("session.status.started", 1L, null, statuses, sessionStatuses)

        when:
        processor.process("mid-1", event)

        then:
        1 * processedMessageRepository.insertIfAbsent("mid-1") >> 1
        1 * sessionService.getParticipantIdsByStatuses(1L, statuses, sessionStatuses) >> [recipient1, recipient2]
        1 * notificationService.recordEvent(recipient1, "session.status.started", "SESSION", "1", null) >>
                new NotificationRecordResult(21L, 1L)
        1 * notificationService.recordEvent(recipient2, "session.status.started", "SESSION", "1", null) >>
                new NotificationRecordResult(22L, 2L)
    }

    def "process() never touches NotificationService, SessionService, or the event publisher when the message was already processed"() {
        given:
        def event = ParsedSessionEvent.single("session.join_request.created", 1L, UUID.randomUUID(), UUID.randomUUID())

        when:
        processor.process("mid-1", event)

        then:
        1 * processedMessageRepository.insertIfAbsent("mid-1") >> 0
        0 * sessionService._
        0 * notificationService._
        0 * eventPublisher._
    }
}
