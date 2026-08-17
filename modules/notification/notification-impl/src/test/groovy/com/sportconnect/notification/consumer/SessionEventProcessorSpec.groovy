package com.sportconnect.notification.consumer

import com.sportconnect.notification.api.service.NotificationService
import com.sportconnect.notification.repository.ProcessedMessageRepository
import com.sportconnect.session.api.dto.ParticipantStatus
import com.sportconnect.session.api.service.SessionService
import spock.lang.Specification
import spock.lang.Subject

class SessionEventProcessorSpec extends Specification {

    ProcessedMessageRepository processedMessageRepository = Mock()
    NotificationService notificationService = Mock()
    SessionService sessionService = Mock()

    @Subject
    SessionEventProcessor processor = new SessionEventProcessor(processedMessageRepository, notificationService, sessionService)

    def "process() for a single-recipient event inserts the dedup marker then calls recordEvent once"() {
        given:
        def actorId = UUID.randomUUID()
        def recipientId = UUID.randomUUID()
        def event = ParsedSessionEvent.single("session.join_request.created", 1L, actorId, recipientId)

        when:
        processor.process("mid-1", event)

        then:
        1 * processedMessageRepository.insertIfAbsent("mid-1") >> 1
        1 * notificationService.recordEvent(recipientId, "session.join_request.created", "SESSION", "1", actorId)
    }

    def "process() skips recordEvent for a single-recipient event when the recipient is the actor"() {
        given:
        def selfId = UUID.randomUUID()
        def event = ParsedSessionEvent.single("session.join_request.created", 1L, selfId, selfId)

        when:
        processor.process("mid-1", event)

        then:
        1 * processedMessageRepository.insertIfAbsent("mid-1") >> 1
        0 * notificationService.recordEvent(*_)
    }

    def "process() for a fan-out event resolves participants and calls recordEvent once per recipient, excluding the actor"() {
        given:
        def actorId = UUID.randomUUID()
        def other1 = UUID.randomUUID()
        def other2 = UUID.randomUUID()
        def statuses = [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED]
        def event = ParsedSessionEvent.fanOut("session.comment.created", 1L, actorId, statuses)

        when:
        processor.process("mid-1", event)

        then:
        1 * processedMessageRepository.insertIfAbsent("mid-1") >> 1
        1 * sessionService.getParticipantIdsByStatuses(1L, statuses) >> [actorId, other1, other2]
        1 * notificationService.recordEvent(other1, "session.comment.created", "SESSION", "1", actorId)
        1 * notificationService.recordEvent(other2, "session.comment.created", "SESSION", "1", actorId)
        0 * notificationService.recordEvent(actorId, _, _, _, _)
    }

    def "process() never touches NotificationService or SessionService when the message was already processed"() {
        given:
        def event = ParsedSessionEvent.single("session.join_request.created", 1L, UUID.randomUUID(), UUID.randomUUID())

        when:
        processor.process("mid-1", event)

        then:
        1 * processedMessageRepository.insertIfAbsent("mid-1") >> 0
        0 * sessionService._
        0 * notificationService._
    }
}
