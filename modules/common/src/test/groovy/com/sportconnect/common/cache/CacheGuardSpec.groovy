package com.sportconnect.common.cache

import ch.qos.logback.classic.Level
import ch.qos.logback.classic.Logger
import ch.qos.logback.classic.spi.ILoggingEvent
import ch.qos.logback.core.read.ListAppender
import org.slf4j.LoggerFactory
import org.springframework.dao.DataAccessResourceFailureException
import spock.lang.Specification

import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

/** A11: a cache outage degrades the call instead of failing it, and logs sparingly. */
class CacheGuardSpec extends Specification {

    MutableClock clock = new MutableClock()
    CacheGuard guard = new CacheGuard(clock)
    ListAppender<ILoggingEvent> logs = new ListAppender<>()
    Logger logger = (Logger) LoggerFactory.getLogger(CacheGuard)

    def setup() {
        logs.start()
        logger.addAppender(logs)
    }

    def cleanup() {
        logger.detachAppender(logs)
    }

    private static DataAccessResourceFailureException down() {
        new DataAccessResourceFailureException("Unable to connect to Redis")
    }

    private List<ILoggingEvent> at(Level level) {
        logs.list.findAll { it.level == level }
    }

    def "read returns the operation's result when the cache is up"() {
        expect:
        guard.read("x", { "cached" }, "fallback") == "cached"
        at(Level.WARN).isEmpty()
    }

    def "read returns the fallback instead of throwing when the cache is unavailable"() {
        expect:
        guard.read("x", { throw down() }, "fallback") == "fallback"
    }

    def "run skips a failing write without throwing"() {
        when:
        guard.run("x", { throw down() })

        then:
        noExceptionThrown()
    }

    def "an exception that is not a cache outage still propagates"() {
        when:
        guard.read("x", { throw new IllegalStateException("bug") }, "fallback")

        then:
        thrown(IllegalStateException)
    }

    def "repeated failures log one WARN per minute per label, with no stack trace"() {
        when: "ten failures in the same minute"
        10.times { guard.read("x", { throw down() }, null) }

        then:
        at(Level.WARN).size() == 1
        at(Level.WARN)[0].throwableProxy == null

        when: "a minute later it warns again"
        clock.advance(61_000)
        guard.read("x", { throw down() }, null)

        then:
        at(Level.WARN).size() == 2
    }

    def "each label is rate-limited separately"() {
        when:
        guard.read("a", { throw down() }, null)
        guard.run("b", { throw down() })

        then:
        at(Level.WARN).size() == 2
    }

    def "the first success after an outage logs one INFO, later successes none"() {
        given:
        guard.read("x", { throw down() }, null)

        when:
        guard.read("x", { "ok" }, null)
        guard.read("x", { "ok" }, null)

        then:
        at(Level.INFO).size() == 1
        at(Level.INFO)[0].formattedMessage.contains("available again")
    }

    static class MutableClock extends Clock {
        long now = 1_000_000L

        void advance(long millis) { now += millis }

        @Override ZoneOffset getZone() { ZoneOffset.UTC }
        @Override Clock withZone(java.time.ZoneId zone) { this }
        @Override Instant instant() { Instant.ofEpochMilli(now) }
        @Override long millis() { now }
    }
}
