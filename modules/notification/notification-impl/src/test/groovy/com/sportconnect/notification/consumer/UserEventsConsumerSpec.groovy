package com.sportconnect.notification.consumer

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.user.api.event.FriendRequestAcceptedEvent
import com.sportconnect.user.api.event.FriendRequestCreatedEvent
import org.springframework.amqp.core.Message
import org.springframework.amqp.core.MessageProperties
import spock.lang.Specification
import spock.lang.Subject

class UserEventsConsumerSpec extends Specification {

    ObjectMapper objectMapper = new ObjectMapper()
    UserEventProcessor userEventProcessor = Mock()

    @Subject
    UserEventsConsumer consumer = new UserEventsConsumer(objectMapper, userEventProcessor)

    private static Message messageWith(String routingKey, String body, String messageId = "mid-1") {
        def props = new MessageProperties()
        props.receivedRoutingKey = routingKey
        props.messageId = messageId
        return new Message(body.bytes, props)
    }

    def "dispatches user.friend_request.created as a single-recipient event"() {
        given:
        def actorId = UUID.randomUUID()
        def recipientId = UUID.randomUUID()
        def body = objectMapper.writeValueAsString(FriendRequestCreatedEvent.builder()
                .requestId(UUID.randomUUID()).actorId(actorId).recipientUserId(recipientId).build())

        when:
        consumer.onUserEvent(messageWith("user.friend_request.created", body))

        then:
        1 * userEventProcessor.process("mid-1", { ParsedUserEvent e ->
            e.type() == "user.friend_request.created" && e.actorId() == actorId && e.recipientUserId() == recipientId
        })
    }

    def "dispatches user.friend_request.accepted as a single-recipient event"() {
        given:
        def actorId = UUID.randomUUID()
        def recipientId = UUID.randomUUID()
        def body = objectMapper.writeValueAsString(FriendRequestAcceptedEvent.builder()
                .requestId(UUID.randomUUID()).actorId(actorId).recipientUserId(recipientId).build())

        when:
        consumer.onUserEvent(messageWith("user.friend_request.accepted", body))

        then:
        1 * userEventProcessor.process("mid-1", { ParsedUserEvent e ->
            e.type() == "user.friend_request.accepted" && e.actorId() == actorId && e.recipientUserId() == recipientId
        })
    }

    def "drops a malformed (unparseable) message body without throwing or calling the processor"() {
        when:
        consumer.onUserEvent(messageWith("user.friend_request.created", "{not valid json"))

        then:
        noExceptionThrown()
        0 * userEventProcessor._
    }

    def "drops a message with an unrecognized routing key without throwing or calling the processor"() {
        given:
        def body = objectMapper.writeValueAsString(FriendRequestCreatedEvent.builder()
                .requestId(UUID.randomUUID()).actorId(UUID.randomUUID()).recipientUserId(UUID.randomUUID()).build())

        when:
        consumer.onUserEvent(messageWith("user.friend_request.unknown", body))

        then:
        noExceptionThrown()
        0 * userEventProcessor._
    }
}
