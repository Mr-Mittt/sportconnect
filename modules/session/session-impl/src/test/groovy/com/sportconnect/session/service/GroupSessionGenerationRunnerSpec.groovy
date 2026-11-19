package com.sportconnect.session.service

import com.sportconnect.session.entity.GroupSessionGenerationItem
import com.sportconnect.session.repository.GroupSessionGenerationQueueRepository
import org.springframework.data.domain.Pageable
import spock.lang.Specification
import spock.lang.Subject

import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

/** SESSION-GROUP-5: draining the generation queue. */
class GroupSessionGenerationRunnerSpec extends Specification {

    static final Instant NOW = Instant.parse("2026-11-18T10:00:00Z")

    GroupSessionGenerationQueueRepository queueRepository = Mock()
    GroupSessionOccurrenceGenerator generator = Mock()

    @Subject
    GroupSessionGenerationRunner runner = new GroupSessionGenerationRunner(queueRepository, generator)

    def setup() {
        runner.clock = Clock.fixed(NOW, ZoneOffset.UTC)
    }

    private static GroupSessionGenerationItem item(Long id) {
        GroupSessionGenerationItem.builder().id(id).recurrenceId(id).targetStart(NOW).nextAttemptAt(NOW).build()
    }

    def "every due slot is generated once, in the order the queue returns them"() {
        when:
        def attempted = runner.processDue()

        then:
        1 * queueRepository.findDue(NOW, { Pageable p -> p.pageSize == 50 }) >> [item(1L), item(2L), item(3L)]
        then:
        1 * generator.generate(1L)
        then:
        1 * generator.generate(2L)
        then:
        1 * generator.generate(3L)
        then:
        1 * queueRepository.findDue(NOW, _) >> []
        attempted == 3
    }

    def "a failing slot is recorded and does not stop the others, and is not tried again in the same run"() {
        when:
        def attempted = runner.processDue()

        then:
        // The repository keeps returning slot 1 (as it would if recording its failure had not moved it): it is attempted once.
        _ * queueRepository.findDue(NOW, _) >>> [[item(1L), item(2L)], [item(1L)], []]
        1 * generator.generate(1L) >> { throw new IllegalStateException("boom") }
        1 * generator.recordFailure(1L, { it.contains("IllegalStateException") && it.contains("boom") })
        1 * generator.generate(2L)
        attempted == 2
    }

    def "a failure that cannot even be recorded does not escape or loop"() {
        when:
        def attempted = runner.processDue()

        then:
        _ * queueRepository.findDue(NOW, _) >>> [[item(1L)], [item(1L)]]
        1 * generator.generate(1L) >> { throw new RuntimeException("boom") }
        1 * generator.recordFailure(1L, _) >> { throw new RuntimeException("db down") }
        noExceptionThrown()
        attempted == 1
    }

    def "nothing due attempts nothing"() {
        when:
        def attempted = runner.processDue()

        then:
        1 * queueRepository.findDue(NOW, _) >> []
        0 * generator._
        attempted == 0
    }
}
