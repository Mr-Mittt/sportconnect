package com.sportconnect.session.stats

import spock.lang.Specification
import spock.lang.Subject

import java.time.Duration
import java.time.Instant

/** SESSION-53: what a failed attempt turns into: a retry 15 minutes ahead, or FAILED once the attempts are used up. */
class SessionStatsWriterSpec extends Specification {

    SessionStatsJobRepository jobRepository = Mock()
    UserSportStatsRepository userStatsRepository = Mock()
    GroupMemberStatsRepository groupStatsRepository = Mock()
    StatBoardRunRepository boardRunRepository = Mock()
    Instant now = Instant.parse('2026-11-23T10:00:00Z')
    Instant claimed = now.minusSeconds(30)

    @Subject
    SessionStatsWriter writer = new SessionStatsWriter(jobRepository, userStatsRepository, groupStatsRepository, boardRunRepository)

    SessionStatsJob job(int attempts) {
        SessionStatsJob.builder().sessionId(7L).status(SessionStatsJob.Status.RUNNING).attempts(attempts).claimedAt(claimed).build()
    }

    def "attempt #attempts of four is retried #minutes minutes later"() {
        when:
        writer.recordFailure(7L, claimed, 'boom', now)

        then:
        1 * jobRepository.findById(7L) >> Optional.of(job(attempts))
        1 * jobRepository.recordFailure(7L, claimed, SessionStatsJob.Status.RETRY, now.plus(Duration.ofMinutes(minutes)), 'boom', now) >> 1

        where:
        attempts | minutes
        1        | 15
        2        | 15
        3        | 15
    }

    def "the fourth attempt is the last: the row is FAILED and due again only after the long wait"() {
        when:
        writer.recordFailure(7L, claimed, 'boom', now)

        then:
        1 * jobRepository.findById(7L) >> Optional.of(job(4))
        1 * jobRepository.recordFailure(7L, claimed, SessionStatsJob.Status.FAILED, now.plus(Duration.ofHours(6)), 'boom', now) >> 1
    }

    def "a FAILED row revived after the wait is tried once more, and fails straight back to FAILED"() {
        when:
        writer.recordFailure(7L, claimed, 'boom', now)

        then:
        1 * jobRepository.findById(7L) >> Optional.of(job(5))
        1 * jobRepository.recordFailure(7L, claimed, SessionStatsJob.Status.FAILED, now.plus(Duration.ofHours(6)), 'boom', now) >> 1
    }

    def "a long error message is cut to what the column holds"() {
        when:
        writer.recordFailure(7L, claimed, 'x' * 800, now)

        then:
        1 * jobRepository.findById(7L) >> Optional.of(job(1))
        1 * jobRepository.recordFailure(7L, claimed, _, _, { it.length() == 500 }, now) >> 1
    }

    def "a job row that is gone changes nothing"() {
        when:
        writer.recordFailure(7L, claimed, 'boom', now)

        then:
        1 * jobRepository.findById(7L) >> Optional.empty()
        0 * jobRepository.recordFailure(*_)
    }

    def "the claim of a session with no row is a plain insert, so a second claimant fails on the key"() {
        when:
        writer.insertClaim(7L, now)

        then:
        1 * jobRepository.insertClaim(7L, now) >> 1
        0 * jobRepository.save(*_)
        0 * jobRepository.saveAndFlush(*_)
    }

    def "a due row is claimed through the compare-and-set update"() {
        when:
        def claimed = writer.claimDue(7L, now, now.minusSeconds(600))

        then:
        1 * jobRepository.claimDue(7L, now, now.minusSeconds(600)) >> 1
        claimed
    }
}
