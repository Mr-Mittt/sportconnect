package com.sportconnect.common.outbox

import org.springframework.amqp.AmqpException
import org.springframework.amqp.rabbit.core.RabbitOperations
import org.springframework.amqp.rabbit.core.RabbitTemplate
import spock.lang.Specification

class OutboxRelaySpec extends Specification {

    static class TestOutboxEvent extends OutboxEvent {
    }

    RabbitTemplate rabbitTemplate = Mock(RabbitTemplate)

    private static TestOutboxEvent pendingEvent(String type = "post.comment.created", String payload = '{"foo":"bar"}') {
        def event = new TestOutboxEvent()
        event.eventType = type
        event.payload = payload
        event.status = OutboxEventStatus.PENDING
        return event
    }

    def "drain() publishes a PENDING row and marks it SENT on confirm"() {
        given:
        def event = pendingEvent()
        def saved = []
        def relay = new OutboxRelay<TestOutboxEvent>(rabbitTemplate, "sportconnect.events",
                { -> [event] }, { e -> e.eventType }, { e -> saved << e })

        when:
        relay.drain()

        then:
        1 * rabbitTemplate.invoke(_ as RabbitOperations.OperationsCallback) >> { args ->
            (args[0] as RabbitOperations.OperationsCallback).doInRabbit(rabbitTemplate)
        }
        1 * rabbitTemplate.convertAndSend("sportconnect.events", "post.comment.created", '{"foo":"bar"}')
        1 * rabbitTemplate.waitForConfirmsOrDie(5000L)

        and:
        event.status == OutboxEventStatus.SENT
        event.sentAt != null
        event.attemptCount == 1
        saved == [event]
    }

    def "drain() leaves a PENDING row PENDING and bumps attemptCount when publish fails"() {
        given:
        def event = pendingEvent()
        def saved = []
        def relay = new OutboxRelay<TestOutboxEvent>(rabbitTemplate, "sportconnect.events",
                { -> [event] }, { e -> e.eventType }, { e -> saved << e })

        when:
        relay.drain()

        then:
        1 * rabbitTemplate.invoke(_ as RabbitOperations.OperationsCallback) >> { throw new AmqpException("nack") }

        and:
        event.status == OutboxEventStatus.PENDING
        event.sentAt == null
        event.attemptCount == 1
        event.lastAttemptAt != null
        saved == [event]
    }

    def "drain() never re-publishes a row that is already SENT"() {
        given:
        def sentEvent = pendingEvent()
        sentEvent.status = OutboxEventStatus.SENT
        def relay = new OutboxRelay<TestOutboxEvent>(rabbitTemplate, "sportconnect.events",
                { -> [sentEvent] }, { e -> e.eventType }, { e -> })

        when:
        relay.drain()

        then:
        0 * rabbitTemplate.invoke(_)
    }
}
