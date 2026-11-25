package com.sportconnect.session.stats

import com.sportconnect.sport.api.service.SportService
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.data.domain.Pageable
import spock.lang.Specification
import spock.lang.Subject

import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.time.ZoneOffset

/** SESSION-53: how the runner picks, claims, runs and fails sessions (every collaborator mocked; the IT runs the real thing). */
class SessionStatsRunnerSpec extends Specification {

    SessionStatsJobRepository jobRepository = Mock()
    SessionStatsWriter writer = Mock()
    SessionStatsProcessor processor = Mock()
    SportService sportService = Mock()
    Instant now = Instant.parse('2026-11-23T10:00:00Z')

    @Subject
    SessionStatsRunner runner = new SessionStatsRunner(jobRepository, writer, processor, sportService)

    def setup() {
        runner.setClock(Clock.fixed(now, ZoneOffset.UTC))
        sportService.getStatisticsEnabledSportIds() >> ([1L, 2L] as Set)
    }

    def "a due job row is claimed by compare-and-set and counted with the claim time it took"() {
        when:
        def attempted = runner.pass(10)

        then:
        1 * jobRepository.findDueSessionIds(now, now.minus(Duration.ofMinutes(10)), { Pageable p -> p.pageSize == 10 }) >> [7L]
        1 * writer.claimDue(7L, now, now.minus(Duration.ofMinutes(10))) >> true
        1 * processor.process(7L, now)
        1 * jobRepository.findNewSessionIds(_, _, _) >> []
        attempted == 1
    }

    def "a row another worker took first is not run and not counted"() {
        when:
        def attempted = runner.pass(10)

        then:
        1 * jobRepository.findDueSessionIds(*_) >> [7L]
        1 * writer.claimDue(7L, _, _) >> false
        0 * processor.process(*_)
        1 * jobRepository.findNewSessionIds(*_) >> []
        attempted == 0
    }

    def "new sessions get the room the due rows left, with the guard cutoff 24 hours back"() {
        when:
        def attempted = runner.pass(3)

        then:
        1 * jobRepository.findDueSessionIds(*_) >> [1L, 2L]
        2 * writer.claimDue(*_) >> true
        2 * processor.process(*_)
        1 * jobRepository.findNewSessionIds(now.minus(Duration.ofHours(24)), { it == ([1L, 2L] as Set) },
                { Pageable p -> p.pageSize == 1 }) >> [9L]
        1 * writer.insertClaim(9L, now)
        1 * processor.process(9L, now)
        attempted == 3
    }

    def "no room left means the new sessions are not even looked up"() {
        when:
        runner.pass(2)

        then:
        1 * jobRepository.findDueSessionIds(*_) >> [1L, 2L]
        2 * writer.claimDue(*_) >> true
        2 * processor.process(*_)
        0 * jobRepository.findNewSessionIds(*_)
        0 * sportService.getStatisticsEnabledSportIds()
    }

    def "only the sessions of sports that have statistics switched on are looked up"() {
        when:
        runner.pass(10)

        then:
        1 * jobRepository.findDueSessionIds(*_) >> []
        1 * sportService.getStatisticsEnabledSportIds() >> ([5L, 8L] as Set)
        1 * jobRepository.findNewSessionIds(_, { it == ([5L, 8L] as Set) }, _) >> []
    }

    def "with no sport switched on no new session is looked up, but a due job row still runs"() {
        when:
        def attempted = runner.pass(10)

        then:
        1 * jobRepository.findDueSessionIds(*_) >> [7L]
        1 * writer.claimDue(7L, _, _) >> true
        1 * processor.process(7L, now)
        1 * sportService.getStatisticsEnabledSportIds() >> ([] as Set)
        0 * jobRepository.findNewSessionIds(*_)
        attempted == 1
    }

    def "a session another worker inserted first is skipped and the others go on"() {
        when:
        def attempted = runner.pass(10)

        then:
        1 * jobRepository.findDueSessionIds(*_) >> []
        1 * jobRepository.findNewSessionIds(*_) >> [4L, 5L]
        1 * writer.insertClaim(4L, now) >> { throw new DataIntegrityViolationException('duplicate key') }
        1 * writer.insertClaim(5L, now)
        0 * processor.process(4L, _)
        1 * processor.process(5L, now)
        attempted == 1
    }

    def "a session that fails is recorded as a failed attempt and does not stop the next one"() {
        when:
        def attempted = runner.pass(10)

        then:
        1 * jobRepository.findDueSessionIds(*_) >> []
        1 * jobRepository.findNewSessionIds(*_) >> [4L, 5L]
        2 * writer.insertClaim(*_)
        1 * processor.process(4L, now) >> { throw new IllegalStateException('boom') }
        1 * writer.recordFailure(4L, now, { it.contains('IllegalStateException') && it.contains('boom') }, now)
        1 * processor.process(5L, now)
        attempted == 2
    }

    def "an attempt whose claim was taken over records nothing"() {
        when:
        runner.pass(10)

        then:
        1 * jobRepository.findDueSessionIds(*_) >> []
        1 * jobRepository.findNewSessionIds(*_) >> [4L]
        1 * writer.insertClaim(*_)
        1 * processor.process(4L, now) >> { throw new SessionStatsProcessor.ClaimLostException(4L) }
        0 * writer.recordFailure(*_)
    }

    def "a failure that cannot even be recorded is logged and the batch goes on (the stale claim is the safety net)"() {
        when:
        def attempted = runner.pass(10)

        then:
        1 * jobRepository.findDueSessionIds(*_) >> []
        1 * jobRepository.findNewSessionIds(*_) >> [4L, 5L]
        2 * writer.insertClaim(*_)
        1 * processor.process(4L, _) >> { throw new IllegalStateException('boom') }
        1 * writer.recordFailure(4L, *_) >> { throw new IllegalStateException('database down') }
        1 * processor.process(5L, _)
        attempted == 2
        noExceptionThrown()
    }

    def "processDue repeats passes until one finds nothing"() {
        when:
        def total = runner.processDue()

        then: "two busy passes, then an empty one"
        3 * jobRepository.findDueSessionIds(*_) >>> [[1L], [2L], []]
        3 * jobRepository.findNewSessionIds(*_) >> []
        2 * writer.claimDue(*_) >> true
        2 * processor.process(*_)
        total == 2
    }

    def "processDue stops when its time budget is spent even if work remains"() {
        given: "a clock that jumps ten minutes after the first pass"
        def times = [now, now, now, now.plus(Duration.ofMinutes(11))] + [now.plus(Duration.ofMinutes(11))] * 20
        def clock = Stub(Clock) {
            instant() >>> times
            getZone() >> ZoneOffset.UTC
        }
        runner.setClock(clock)

        when:
        def total = runner.processDue()

        then: "exactly one pass ran"
        1 * jobRepository.findDueSessionIds(*_) >> [1L]
        1 * jobRepository.findNewSessionIds(*_) >> []
        1 * writer.claimDue(*_) >> true
        1 * processor.process(*_)
        total == 1
    }
}
