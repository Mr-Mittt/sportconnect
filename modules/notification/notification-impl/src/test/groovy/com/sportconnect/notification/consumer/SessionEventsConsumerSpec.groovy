package com.sportconnect.notification.consumer

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.session.api.dto.ParticipantStatus
import com.sportconnect.session.api.event.SessionCommentCreatedEvent
import com.sportconnect.session.api.event.SessionInvitationCreatedEvent
import com.sportconnect.session.api.event.SessionJoinRequestApprovedEvent
import com.sportconnect.session.api.event.SessionJoinRequestCreatedEvent
import com.sportconnect.session.api.event.SessionJoinRequestRejectedEvent
import com.sportconnect.session.api.event.SessionParticipantJoinedEvent
import org.springframework.amqp.core.Message
import org.springframework.amqp.core.MessageProperties
import spock.lang.Specification
import spock.lang.Subject

class SessionEventsConsumerSpec extends Specification {

    ObjectMapper objectMapper = new ObjectMapper()
    SessionEventProcessor sessionEventProcessor = Mock()

    @Subject
    SessionEventsConsumer consumer = new SessionEventsConsumer(objectMapper, sessionEventProcessor)

    private static Message messageWith(String routingKey, String body, String messageId = "mid-1") {
        def props = new MessageProperties()
        props.receivedRoutingKey = routingKey
        props.messageId = messageId
        return new Message(body.bytes, props)
    }

    def "dispatches session.comment.created as a fan-out event with the comment-recipient statuses"() {
        given:
        def actorId = UUID.randomUUID()
        def body = objectMapper.writeValueAsString(
                SessionCommentCreatedEvent.builder().sessionId(1L).actorId(actorId).commentId(5L).build())

        when:
        consumer.onSessionEvent(messageWith("session.comment.created", body))

        then:
        1 * sessionEventProcessor.process("mid-1", { ParsedSessionEvent e ->
            e.type() == "session.comment.created" && e.sessionId() == 1L && e.actorId() == actorId &&
                    e.singleRecipient() == null &&
                    e.fanOutStatuses() == [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED]
        })
    }

    def "dispatches session.participant.joined as a fan-out event scoped to JOINED only"() {
        given:
        def actorId = UUID.randomUUID()
        def body = objectMapper.writeValueAsString(
                SessionParticipantJoinedEvent.builder().sessionId(1L).actorId(actorId).build())

        when:
        consumer.onSessionEvent(messageWith("session.participant.joined", body))

        then:
        1 * sessionEventProcessor.process("mid-1", { ParsedSessionEvent e ->
            e.type() == "session.participant.joined" && e.fanOutStatuses() == [ParticipantStatus.JOINED]
        })
    }

    def "dispatches session.join_request.created as a single-recipient event"() {
        given:
        def actorId = UUID.randomUUID()
        def recipientId = UUID.randomUUID()
        def body = objectMapper.writeValueAsString(SessionJoinRequestCreatedEvent.builder()
                .sessionId(1L).actorId(actorId).recipientUserId(recipientId).build())

        when:
        consumer.onSessionEvent(messageWith("session.join_request.created", body))

        then:
        1 * sessionEventProcessor.process("mid-1", { ParsedSessionEvent e ->
            e.type() == "session.join_request.created" && e.singleRecipient() == recipientId && e.fanOutStatuses() == null
        })
    }

    def "dispatches session.join_request.approved as a single-recipient event"() {
        given:
        def actorId = UUID.randomUUID()
        def recipientId = UUID.randomUUID()
        def body = objectMapper.writeValueAsString(SessionJoinRequestApprovedEvent.builder()
                .sessionId(1L).actorId(actorId).recipientUserId(recipientId).build())

        when:
        consumer.onSessionEvent(messageWith("session.join_request.approved", body))

        then:
        1 * sessionEventProcessor.process("mid-1", { ParsedSessionEvent e ->
            e.type() == "session.join_request.approved" && e.singleRecipient() == recipientId
        })
    }

    def "dispatches session.join_request.rejected as a single-recipient event"() {
        given:
        def actorId = UUID.randomUUID()
        def recipientId = UUID.randomUUID()
        def body = objectMapper.writeValueAsString(SessionJoinRequestRejectedEvent.builder()
                .sessionId(1L).actorId(actorId).recipientUserId(recipientId).reason("full").build())

        when:
        consumer.onSessionEvent(messageWith("session.join_request.rejected", body))

        then:
        1 * sessionEventProcessor.process("mid-1", { ParsedSessionEvent e ->
            e.type() == "session.join_request.rejected" && e.singleRecipient() == recipientId
        })
    }

    def "dispatches session.invitation.created as a single-recipient event"() {
        given:
        def actorId = UUID.randomUUID()
        def recipientId = UUID.randomUUID()
        def body = objectMapper.writeValueAsString(SessionInvitationCreatedEvent.builder()
                .sessionId(1L).actorId(actorId).recipientUserId(recipientId).build())

        when:
        consumer.onSessionEvent(messageWith("session.invitation.created", body))

        then:
        1 * sessionEventProcessor.process("mid-1", { ParsedSessionEvent e ->
            e.type() == "session.invitation.created" && e.singleRecipient() == recipientId
        })
    }

    def "drops a malformed (unparseable) message body without throwing or calling the processor"() {
        when:
        consumer.onSessionEvent(messageWith("session.comment.created", "{not valid json"))

        then:
        noExceptionThrown()
        0 * sessionEventProcessor._
    }

    def "drops a message with an unrecognized routing key without throwing or calling the processor"() {
        given:
        def body = objectMapper.writeValueAsString(
                SessionCommentCreatedEvent.builder().sessionId(1L).actorId(UUID.randomUUID()).commentId(5L).build())

        when:
        consumer.onSessionEvent(messageWith("session.unknown.event", body))

        then:
        noExceptionThrown()
        0 * sessionEventProcessor._
    }
}
