package com.sportconnect.session.service

import com.sportconnect.location.api.dto.LocationResponse
import com.sportconnect.location.api.service.LocationService
import com.sportconnect.session.api.dto.RecurrenceMode
import com.sportconnect.session.api.dto.SessionStatus
import com.sportconnect.session.entity.GroupSessionGenerationItem
import com.sportconnect.session.entity.GroupSessionRecurrence
import com.sportconnect.session.entity.GroupSessionSettings
import com.sportconnect.session.entity.Session
import com.sportconnect.session.repository.GroupSessionGenerationQueueRepository
import com.sportconnect.session.repository.GroupSessionRecurrenceRepository
import com.sportconnect.session.repository.GroupSessionSettingsRepository
import com.sportconnect.session.repository.SessionRepository
import spock.lang.Specification
import spock.lang.Subject

import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneOffset

/**
 * SESSION-GROUP-5: which slots the planner puts on the generation queue. Fixed clock: Wednesday 2026-11-18 10:00 UTC; every
 * location is in UTC.
 */
class GroupSessionGenerationPlannerSpec extends Specification {

    static final Instant NOW = Instant.parse("2026-11-18T10:00:00Z")
    static final LocalDate TODAY = LocalDate.of(2026, 11, 18)   // Wednesday = 3

    GroupSessionSettingsRepository settingsRepository = Mock()
    GroupSessionRecurrenceRepository recurrenceRepository = Mock()
    GroupSessionGenerationQueueRepository queueRepository = Mock()
    SessionRepository sessionRepository = Mock()
    LocationService locationService = Mock()

    @Subject
    GroupSessionGenerationPlanner planner = new GroupSessionGenerationPlanner(
            settingsRepository, recurrenceRepository, queueRepository, sessionRepository, locationService)

    def setup() {
        planner.clock = Clock.fixed(NOW, ZoneOffset.UTC)
        locationService.getLocationsByIds(_) >> [9L: LocationResponse.builder().id(9L).timezone("UTC").build()]
        queueRepository.findByRecurrenceIdIn(_) >> []
        sessionRepository.findByRecurrenceIdInAndOccurrenceDateGreaterThanEqual(_, _) >> []
    }

    private static GroupSessionSettings on(Long groupId, RecurrenceMode mode = RecurrenceMode.WEEKLY) {
        GroupSessionSettings.builder().groupId(groupId).enabled(true).mode(mode).build()
    }

    private static GroupSessionRecurrence rec(Long id, Long groupId, int day, String start = "18:00",
                                              RecurrenceMode mode = RecurrenceMode.WEEKLY) {
        GroupSessionRecurrence.builder().id(id).groupId(groupId).mode(mode).dayKey(day).startTime(LocalTime.parse(start))
                .durationMinutes(90).locationId(9L).draft(false).build()
    }

    private List queued

    private void captureQueue() {
        queueRepository.saveAll(_) >> { List args -> queued = args[0]; args[0] }
    }

    // ---- startup recovery -------------------------------------------------------------------------------------------

    def "startup: every group with generation on gets only its nearest day queued, in one round of batch lookups"() {
        given:
        captureQueue()
        def wedToday = rec(1L, 10L, 3)
        def friLater = rec(2L, 10L, 5)
        def friOnly = rec(3L, 11L, 5, "09:00")

        when:
        def count = planner.enqueueForAllEnabledGroups()

        then:
        1 * settingsRepository.findByEnabledTrue() >> [on(10L), on(11L)]
        1 * settingsRepository.findByGroupIdInAndEnabledTrue({ it as Set == [10L, 11L] as Set }) >> [on(10L), on(11L)]
        1 * recurrenceRepository.findByGroupIdInAndDraftFalse(_) >> [wedToday, friLater, friOnly]
        1 * locationService.getLocationsByIds([9L]) >> [9L: LocationResponse.builder().id(9L).timezone("UTC").build()]
        // Only the nearest day's candidates (recurrences 1 and 3) are looked up against the queue, in one query.
        1 * queueRepository.findByRecurrenceIdIn({ it as Set == [1L, 3L] as Set }) >> []
        count == 2
        queued.size() == 2
        queued.find { it.recurrenceId == 1L }.occurrenceDate == TODAY
        queued.find { it.recurrenceId == 3L }.occurrenceDate == LocalDate.of(2026, 11, 20)
        !queued.any { it.recurrenceId == 2L }
        queued.every { it.status == GroupSessionGenerationItem.Status.PENDING && it.nextAttemptAt == NOW && it.attempts == 0 }
        queued.find { it.recurrenceId == 1L }.targetStart == Instant.parse("2026-11-18T18:00:00Z")
    }

    def "startup with no group that has generation on does nothing and looks nothing else up"() {
        when:
        def count = planner.enqueueForAllEnabledGroups()

        then:
        1 * settingsRepository.findByEnabledTrue() >> []
        0 * recurrenceRepository._
        0 * queueRepository._
        count == 0
    }

    def "all the configurations of the nearest day are queued, not only one"() {
        given:
        captureQueue()

        when:
        def count = planner.enqueueForAllEnabledGroups()

        then:
        1 * settingsRepository.findByEnabledTrue() >> [on(10L)]
        1 * settingsRepository.findByGroupIdInAndEnabledTrue(_) >> [on(10L)]
        1 * recurrenceRepository.findByGroupIdInAndDraftFalse(_) >> [rec(1L, 10L, 5, "08:00"), rec(2L, 10L, 5, "19:00"), rec(3L, 10L, 6)]
        count == 2
        (queued*.recurrenceId as Set) == [1L, 2L] as Set
    }

    def "only the group's active mode counts, and only a complete configuration with a location and a duration"() {
        given:
        captureQueue()
        // The 18th is today: were this inactive-mode configuration counted, it would be the nearest day and win over `good`.
        def otherMode = rec(1L, 10L, 18, "18:00", RecurrenceMode.MONTHLY)
        def noLocation = rec(2L, 10L, 3); noLocation.locationId = null
        def noDuration = rec(3L, 10L, 3); noDuration.durationMinutes = null
        def good = rec(4L, 10L, 4)

        when:
        def count = planner.enqueueForAllEnabledGroups()

        then:
        1 * settingsRepository.findByEnabledTrue() >> [on(10L)]
        1 * settingsRepository.findByGroupIdInAndEnabledTrue(_) >> [on(10L)]
        1 * recurrenceRepository.findByGroupIdInAndDraftFalse(_) >> [otherMode, noLocation, noDuration, good]
        count == 1
        queued*.recurrenceId == [4L]
    }

    // ---- idempotence -------------------------------------------------------------------------------------------------

    def "a slot already queued (PENDING or DONE) or already generated is left alone; a FAILED or IGNORED one is revived"() {
        given:
        def pending = GroupSessionGenerationItem.builder().id(1L).recurrenceId(1L).occurrenceDate(TODAY)
                .status(GroupSessionGenerationItem.Status.PENDING).nextAttemptAt(NOW).targetStart(NOW).build()
        def done = GroupSessionGenerationItem.builder().id(2L).recurrenceId(2L).occurrenceDate(TODAY)
                .status(GroupSessionGenerationItem.Status.DONE).nextAttemptAt(NOW).targetStart(NOW).build()
        def failed = GroupSessionGenerationItem.builder().id(3L).recurrenceId(3L).occurrenceDate(TODAY)
                .status(GroupSessionGenerationItem.Status.FAILED).attempts(5).lastError("boom").nextAttemptAt(NOW.minusSeconds(999)).targetStart(NOW).build()
        def ignored = GroupSessionGenerationItem.builder().id(5L).recurrenceId(5L).occurrenceDate(TODAY)
                .status(GroupSessionGenerationItem.Status.IGNORED).ignoredReason(GroupSessionGenerationItem.IgnoredReason.GENERATION_OFF)
                .nextAttemptAt(NOW.minusSeconds(999)).targetStart(NOW).build()
        def session = Session.builder().id(7L).recurrenceId(4L).occurrenceDate(TODAY).build()

        when:
        def count = planner.enqueueForAllEnabledGroups()

        then:
        1 * settingsRepository.findByEnabledTrue() >> [on(10L)]
        1 * settingsRepository.findByGroupIdInAndEnabledTrue(_) >> [on(10L)]
        1 * recurrenceRepository.findByGroupIdInAndDraftFalse(_) >> [rec(1L, 10L, 3), rec(2L, 10L, 3), rec(3L, 10L, 3), rec(4L, 10L, 3), rec(5L, 10L, 3)]
        1 * queueRepository.findByRecurrenceIdIn(_) >> [pending, done, failed, ignored]
        1 * sessionRepository.findByRecurrenceIdInAndOccurrenceDateGreaterThanEqual(_, TODAY) >> [session]
        1 * queueRepository.saveAll({ List l ->
            l.size() == 2 && l.any { it.is(failed) } && l.any { it.is(ignored) } &&
                    failed.status == GroupSessionGenerationItem.Status.PENDING &&
                    failed.attempts == 0 && failed.lastError == null && failed.nextAttemptAt == NOW &&
                    ignored.status == GroupSessionGenerationItem.Status.PENDING && ignored.ignoredReason == null &&
                    ignored.nextAttemptAt == NOW })
        count == 2
    }

    // ---- a regular session ended -------------------------------------------------------------------------------------

    def "a day that still holds an open regular session is not over: nothing is queued"() {
        when:
        def count = planner.enqueueAfterDaysEnded([new GroupSessionGenerationEvents.GroupDay(10L, TODAY)])

        then:
        1 * sessionRepository.findOpenRegularDays([10L], [SessionStatus.PREPARING, SessionStatus.SCHEDULED, SessionStatus.ONGOING]) >>
                [[10L, TODAY] as Object[]]
        0 * settingsRepository._
        count == 0
    }

    def "the last regular session of a day ending queues the group's next nearest day, once per group"() {
        given:
        captureQueue()

        when:
        def count = planner.enqueueAfterDaysEnded([
                new GroupSessionGenerationEvents.GroupDay(10L, TODAY),
                new GroupSessionGenerationEvents.GroupDay(10L, TODAY.minusDays(1)),
                new GroupSessionGenerationEvents.GroupDay(11L, TODAY)])

        then:
        1 * sessionRepository.findOpenRegularDays({ it as Set == [10L, 11L] as Set }, _) >> [[11L, TODAY] as Object[]]
        1 * settingsRepository.findByGroupIdInAndEnabledTrue([10L]) >> [on(10L)]
        1 * recurrenceRepository.findByGroupIdInAndDraftFalse(_) >> [rec(1L, 10L, 5)]
        count == 1
        queued.size() == 1
        queued[0].occurrenceDate == LocalDate.of(2026, 11, 20)
    }

    def "a group with generation off queues nothing when its last regular session ends"() {
        when:
        def count = planner.enqueueAfterDaysEnded([new GroupSessionGenerationEvents.GroupDay(10L, TODAY)])

        then:
        1 * sessionRepository.findOpenRegularDays(_, _) >> []
        1 * settingsRepository.findByGroupIdInAndEnabledTrue([10L]) >> []
        0 * recurrenceRepository._
        0 * queueRepository.saveAll(_)
        count == 0
    }

    // ---- a configuration changed -------------------------------------------------------------------------------------

    def "a change queues today's slots that have not ended yet, and not the later day"() {
        given:
        captureQueue()

        when:
        def count = planner.enqueueAfterConfigurationChange(10L)

        then:
        1 * settingsRepository.findByGroupIdInAndEnabledTrue([10L]) >> [on(10L)]
        1 * recurrenceRepository.findByGroupIdInAndDraftFalse(_) >> [rec(1L, 10L, 3, "08:00" /* ended 09:30 */), rec(2L, 10L, 3, "18:00"), rec(3L, 10L, 5)]
        0 * sessionRepository.existsByGroupIdAndRecurrenceIdIsNotNullAndStatusInAndScheduledStartLessThan(*_)
        count == 1
        queued.size() == 1
        queued[0].recurrenceId == 2L
        queued[0].occurrenceDate == TODAY
    }

    def "with nothing left today the nearest later day is queued unless a regular session is already open before it"() {
        given:
        captureQueue()

        when:
        def count = planner.enqueueAfterConfigurationChange(10L)

        then:
        1 * settingsRepository.findByGroupIdInAndEnabledTrue([10L]) >> [on(10L)]
        1 * recurrenceRepository.findByGroupIdInAndDraftFalse(_) >> [rec(1L, 10L, 5, "09:00"), rec(2L, 10L, 5, "18:00"), rec(3L, 10L, 6)]
        1 * sessionRepository.existsByGroupIdAndRecurrenceIdIsNotNullAndStatusInAndScheduledStartLessThan(
                10L, [SessionStatus.SCHEDULED, SessionStatus.ONGOING], Instant.parse("2026-11-20T09:00:00Z")) >> open
        count == expected
        (queued ?: []).size() == expected

        where:
        open  | expected
        false | 2
        true  | 0
    }

    def "a change on a group with no complete configuration queues nothing"() {
        when:
        def count = planner.enqueueAfterConfigurationChange(10L)

        then:
        1 * settingsRepository.findByGroupIdInAndEnabledTrue([10L]) >> [on(10L)]
        1 * recurrenceRepository.findByGroupIdInAndDraftFalse(_) >> []
        0 * queueRepository.saveAll(_)
        count == 0
    }
}
