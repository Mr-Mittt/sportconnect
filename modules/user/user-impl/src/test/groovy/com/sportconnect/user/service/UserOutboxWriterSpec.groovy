package com.sportconnect.user.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.user.api.event.FriendRequestCreatedEvent
import com.sportconnect.user.entity.UserOutboxEvent
import com.sportconnect.user.repository.UserOutboxEventRepository
import spock.lang.Specification
import spock.lang.Subject

class UserOutboxWriterSpec extends Specification {

    UserOutboxEventRepository userOutboxEventRepository = Mock()
    // Real instance — a pure value-converter; lets the test assert on the actual serialized payload.
    ObjectMapper objectMapper = new ObjectMapper()

    @Subject
    UserOutboxWriter writer = new UserOutboxWriter(userOutboxEventRepository, objectMapper)

    def "record() saves one row with the eventType and the JSON-serialized payload"() {
        given:
        def actorId = UUID.randomUUID()
        def recipientId = UUID.randomUUID()
        def requestId = UUID.randomUUID()
        def payload = FriendRequestCreatedEvent.builder()
                .requestId(requestId).actorId(actorId).recipientUserId(recipientId).build()

        when:
        writer.record("user.friend_request.created", payload)

        then:
        1 * userOutboxEventRepository.save({ UserOutboxEvent e ->
            e.eventType == "user.friend_request.created" &&
                    objectMapper.readValue(e.payload, Map).with { m ->
                        m.requestId == requestId.toString() &&
                                m.actorId == actorId.toString() &&
                                m.recipientUserId == recipientId.toString()
                    }
        })
    }

    def "record() rethrows a serialization failure as an unchecked exception and saves nothing"() {
        when:
        // A bare Object has no properties — Jackson throws with FAIL_ON_EMPTY_BEANS (default on).
        writer.record("user.friend_request.created", new Object())

        then:
        thrown(IllegalStateException)
        0 * userOutboxEventRepository.save(_)
    }
}
