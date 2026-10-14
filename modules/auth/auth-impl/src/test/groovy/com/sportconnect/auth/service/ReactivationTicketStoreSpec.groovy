package com.sportconnect.auth.service

import com.sportconnect.common.exception.ServiceUnavailableException
import org.springframework.dao.QueryTimeoutException
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.ValueOperations
import spock.lang.Specification
import spock.lang.Subject

import java.time.Duration

/** A26: the parked-session ticket. State, not a cache: a Redis outage is a 503, never a fallback. */
class ReactivationTicketStoreSpec extends Specification {

    StringRedisTemplate redis = Mock()
    ValueOperations<String, String> ops = Mock()

    @Subject
    ReactivationTicketStore store = new ReactivationTicketStore(redis, Duration.ofMinutes(5))

    def setup() {
        redis.opsForValue() >> ops
    }

    def "issue stores the user and refresh token for the TTL under a hash of the ticket, never the ticket itself"() {
        given:
        def userId = UUID.randomUUID()
        String storedKey
        String storedValue

        when:
        def ticket = store.issue(userId, "parked-refresh")

        then:
        1 * ops.set(_, _, Duration.ofMinutes(5)) >> { String k, String v, Duration d -> storedKey = k; storedValue = v }
        storedValue == userId.toString() + "|parked-refresh"
        storedKey.startsWith("auth:reactivation-ticket:")
        !storedKey.contains(ticket)
        ticket.length() >= 43 // 256 bits, base64url
    }

    def "two tickets are never equal"() {
        given:
        ops.set(_, _, _) >> null

        expect:
        store.issue(UUID.randomUUID(), "r") != store.issue(UUID.randomUUID(), "r")
    }

    def "consume returns the parked content and removes it in one atomic step"() {
        given:
        def userId = UUID.randomUUID()

        when:
        def result = store.consume("t")

        then:
        1 * ops.getAndDelete(_) >> (userId.toString() + "|parked-refresh")
        result.get() == new ReactivationTicketStore.Ticket(userId, "parked-refresh")
    }

    def "consume of an unknown, blank or malformed ticket is empty"() {
        given:
        ops.getAndDelete(_) >> stored

        expect:
        store.consume(ticket).isEmpty()

        where:
        ticket | stored
        "t"    | null
        null   | null
        "  "   | null
        "t"    | "no-separator"
        "t"    | "not-a-uuid|refresh"
    }

    def "issue answers ServiceUnavailable when Redis is down"() {
        given:
        ops.set(_, _, _) >> { throw new QueryTimeoutException("redis down") }

        when:
        store.issue(UUID.randomUUID(), "r")

        then:
        thrown(ServiceUnavailableException)
    }

    def "consume answers ServiceUnavailable when Redis is down"() {
        given:
        ops.getAndDelete(_) >> { throw new QueryTimeoutException("redis down") }

        when:
        store.consume("t")

        then:
        thrown(ServiceUnavailableException)
    }
}
