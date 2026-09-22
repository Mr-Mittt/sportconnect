package com.sportconnect.session.service

import com.sportconnect.group.api.dto.GroupRecurrenceConfigResponse
import com.sportconnect.group.api.service.GroupService
import com.sportconnect.location.api.service.LocationService
import com.sportconnect.session.api.dto.SessionStatus
import com.sportconnect.session.api.dto.SessionType
import com.sportconnect.session.api.event.SessionStatusStartedEvent
import com.sportconnect.session.entity.Session
import com.sportconnect.session.entity.SessionOutboxEvent
import com.sportconnect.session.repository.SessionOutboxEventRepository
import com.sportconnect.session.repository.SessionRepository
import com.sportconnect.social.post.api.dto.SystemSessionCommentRequest
import com.sportconnect.social.post.api.service.CommentService
import com.sportconnect.social.post.api.service.PostService
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import spock.lang.Specification
import spock.lang.Subject

import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

class SessionGenerationServiceSpec extends Specification {

    SessionRepository sessionRepository = Mock()
    GroupService groupService = Mock()
    LocationService locationService = Mock()
    SessionOutboxEventRepository sessionOutboxEventRepository = Mock()
    SessionOutboxWriter sessionOutboxWriter = Mock()
    CommentService commentService = Mock()
    PostService postService = Mock()

    @Subject
    SessionGenerationService service = new SessionGenerationService(
            sessionRepository, groupService, locationService, sessionOutboxEventRepository, sessionOutboxWriter,
            commentService, postService)

    def setup() {
        // SESSION-38: every successful generateForConfigs session creation now creates a companion
        // SESSION_POST first — lenient default so tests that aren't specifically about this don't
        // each need to stub it themselves, same convention as SessionServiceImplSpec's setup().
        postService.createSessionPost(_, _) >> 999L
    }

    def "generateForConfigs skips a group with an incomplete recurrence rule"() {
        given:
        def config = GroupRecurrenceConfigResponse.builder()
                .groupId(1L).sportId(1L).ownerId(UUID.randomUUID())
                .recurrenceDayOfWeek(DayOfWeek.TUESDAY)
                .recurrenceLocationId(null) // incomplete — no location
                .build()

        when:
        service.generateForConfigs([config])

        then:
        1 * locationService.getLocationsByIds([]) >> [:]
        0 * sessionRepository._
    }

    def "generateForConfigs skips a group whose next occurrence already exists"() {
        given:
        def config = GroupRecurrenceConfigResponse.builder()
                .groupId(1L).sportId(1L).ownerId(UUID.randomUUID())
                .recurrenceDayOfWeek(DayOfWeek.TUESDAY).recurrenceTime(LocalTime.of(19, 0))
                .recurrenceLocationId(5L)
                .build()

        when:
        service.generateForConfigs([config])

        then:
        1 * locationService.getLocationsByIds([5L]) >> [:]
        1 * sessionRepository.existsByGroupIdAndScheduledStart(1L, _ as Instant) >> true
        0 * sessionRepository.save(_)
    }

    def "generateForConfigs creates a session copying the recurrence config"() {
        given:
        def ownerId = UUID.randomUUID()
        def config = GroupRecurrenceConfigResponse.builder()
                .groupId(1L).sportId(1L).ownerId(ownerId)
                .recurrenceDayOfWeek(DayOfWeek.TUESDAY).recurrenceTime(LocalTime.of(19, 0))
                .recurrenceDurationMinutes(90).recurrenceLocationId(5L)
                .recurrenceLocationNote("Court 3")
                .build()

        when:
        service.generateForConfigs([config])

        then:
        1 * locationService.getLocationsByIds([5L]) >> [:]
        1 * sessionRepository.existsByGroupIdAndScheduledStart(1L, _ as Instant) >> false
        1 * sessionRepository.save({ Session s ->
            s.groupId == 1L &&
            s.sessionType == SessionType.GROUP_RECURRING &&
            s.createdBy == ownerId &&
            s.sportId == 1L &&
            s.locationId == 5L &&
            s.locationNote == "Court 3" &&
            s.status == SessionStatus.SCHEDULED &&
            s.scheduledEndAt == s.scheduledStart.plusSeconds(90 * 60)
        }) >> { Session s -> s }
    }

    def "generateForConfigs swallows a unique-constraint race instead of failing the batch"() {
        given:
        def config = GroupRecurrenceConfigResponse.builder()
                .groupId(1L).sportId(1L).ownerId(UUID.randomUUID())
                .recurrenceDayOfWeek(DayOfWeek.TUESDAY).recurrenceTime(LocalTime.of(19, 0))
                .recurrenceLocationId(5L)
                .build()

        when:
        service.generateForConfigs([config])

        then:
        1 * locationService.getLocationsByIds([5L]) >> [:]
        1 * sessionRepository.existsByGroupIdAndScheduledStart(1L, _ as Instant) >> false
        1 * sessionRepository.save(_) >> { throw new DataIntegrityViolationException("dup") }
        noExceptionThrown()
    }

    def "generateForConfigs batch-resolves locations once across multiple configs, never per config"() {
        given:
        def configA = GroupRecurrenceConfigResponse.builder()
                .groupId(1L).sportId(1L).ownerId(UUID.randomUUID())
                .recurrenceDayOfWeek(DayOfWeek.TUESDAY).recurrenceTime(LocalTime.of(19, 0))
                .recurrenceLocationId(5L)
                .build()
        def configB = GroupRecurrenceConfigResponse.builder()
                .groupId(2L).sportId(1L).ownerId(UUID.randomUUID())
                .recurrenceDayOfWeek(DayOfWeek.WEDNESDAY).recurrenceTime(LocalTime.of(20, 0))
                .recurrenceLocationId(6L)
                .build()

        when:
        service.generateForConfigs([configA, configB])

        then:
        1 * locationService.getLocationsByIds({ it as Set == [5L, 6L] as Set }) >> [:]
        1 * sessionRepository.existsByGroupIdAndScheduledStart(1L, _ as Instant) >> true
        1 * sessionRepository.existsByGroupIdAndScheduledStart(2L, _ as Instant) >> true
        0 * sessionRepository.save(_)
    }

    /** SESSION-36: uses LocalTime.MIDNIGHT instead of {@code LocalTime.now().minusHours(1)} — the
     * previous version wrapped to the *previous* day's clock face whenever run within an hour
     * after midnight (e.g. 00:30 - 1h = 23:30), which reads as *later* than "now" on the same
     * calendar day, silently inverting the assertion. Midnight is always <= any real "now" for
     * the entire day (equal only at the exact first nanosecond), so this is deterministic
     * regardless of when the suite runs — no production change needed for this. */
    def "computeNextOccurrence rolls forward a week when today is the target weekday but the time already passed"() {
        when:
        def result = service.computeNextOccurrence(LocalDate.now().dayOfWeek, LocalTime.MIDNIGHT)

        then:
        result.toLocalDate() == LocalDate.now().plusWeeks(1)
        result.toLocalTime() == LocalTime.MIDNIGHT
    }

    /** SESSION-36: uses LocalTime.MAX instead of {@code LocalTime.now().plusHours(2)} — the
     * previous version wrapped to an *earlier*-looking clock face whenever run within 2 hours of
     * midnight (e.g. 23:15 + 2h = 01:15), silently inverting the assertion the same way the test
     * above did. LocalTime.MAX (23:59:59.999999999) is always >= any real "now" for the entire
     * day, so this is deterministic regardless of when the suite runs. */
    def "computeNextOccurrence uses today when today is the target weekday and the time hasn't passed"() {
        when:
        def result = service.computeNextOccurrence(LocalDate.now().dayOfWeek, LocalTime.MAX)

        then:
        result.toLocalDate() == LocalDate.now()
    }

    def "computeNextOccurrence finds the next matching weekday when today is a different day"() {
        given:
        def otherDay = DayOfWeek.values().find { it != LocalDate.now().dayOfWeek }

        when:
        def result = service.computeNextOccurrence(otherDay, LocalTime.NOON)

        then:
        result.dayOfWeek == otherDay
        !result.toLocalDate().isBefore(LocalDate.now())
    }

    def "closePastSessions flips SCHEDULED/ONGOING sessions past their end time to COMPLETED, looping until empty"() {
        given:
        def pageable = PageRequest.of(0, 200)
        // Standalone (no groupId/GROUP_RECURRING) — never triggers the SESSION-38 generation call.
        def session1 = Session.builder().id(1L).status(SessionStatus.ONGOING).build()
        // total=201 with page size 200 forces hasNext()==true, so the loop re-queries once more
        def firstBatch = new PageImpl([session1], pageable, 201)
        def secondBatch = new PageImpl([], pageable, 0)

        when:
        service.closePastSessions()

        then:
        2 * sessionRepository.findSessionsToComplete(
                [SessionStatus.SCHEDULED, SessionStatus.ONGOING], _ as Instant, pageable) >>>
                [firstBatch, secondBatch]
        1 * sessionRepository.saveAll({ List sessions -> sessions[0].status == SessionStatus.COMPLETED })
        0 * groupService._
    }

    def "closePastSessions does nothing when there are no past-due sessions"() {
        given:
        def pageable = PageRequest.of(0, 200)

        when:
        service.closePastSessions()

        then:
        1 * sessionRepository.findSessionsToComplete(
                [SessionStatus.SCHEDULED, SessionStatus.ONGOING], _ as Instant, pageable) >> new PageImpl([])
        0 * sessionRepository.saveAll(_)
        0 * groupService._
    }

    // ── SESSION-38: on-completion event-driven generation trigger ───────────

    def "closePastSessions triggers generation for a completed GROUP_RECURRING session's group"() {
        given:
        def pageable = PageRequest.of(0, 200)
        def groupSession = Session.builder().id(1L).groupId(10L)
                .sessionType(SessionType.GROUP_RECURRING).status(SessionStatus.ONGOING).build()
        def batch = new PageImpl([groupSession], pageable, 1)
        def config = GroupRecurrenceConfigResponse.builder()
                .groupId(10L).sportId(1L).ownerId(UUID.randomUUID())
                .recurrenceDayOfWeek(DayOfWeek.TUESDAY).recurrenceTime(LocalTime.of(19, 0))
                .recurrenceLocationId(5L)
                .build()

        when:
        service.closePastSessions()

        then:
        1 * sessionRepository.findSessionsToComplete(
                [SessionStatus.SCHEDULED, SessionStatus.ONGOING], _ as Instant, pageable) >> batch
        1 * sessionRepository.saveAll(_)
        1 * groupService.getGroupRecurrenceConfigsByGroupIds([10L]) >> [config]
        1 * locationService.getLocationsByIds([5L]) >> [:]
        1 * sessionRepository.existsByGroupIdAndScheduledStart(10L, _ as Instant) >> true
    }

    /** No-N+1: two completed GROUP_RECURRING sessions for two different groups in the same batch
     * resolve their groups' configs in a single call, not one per session. */
    def "closePastSessions resolves multiple completed groups' configs in one batched call"() {
        given:
        def pageable = PageRequest.of(0, 200)
        def sessionGroupA = Session.builder().id(1L).groupId(10L)
                .sessionType(SessionType.GROUP_RECURRING).status(SessionStatus.ONGOING).build()
        def sessionGroupB = Session.builder().id(2L).groupId(20L)
                .sessionType(SessionType.GROUP_RECURRING).status(SessionStatus.ONGOING).build()
        def batch = new PageImpl([sessionGroupA, sessionGroupB], pageable, 2)

        when:
        service.closePastSessions()

        then:
        1 * sessionRepository.findSessionsToComplete(
                [SessionStatus.SCHEDULED, SessionStatus.ONGOING], _ as Instant, pageable) >> batch
        1 * sessionRepository.saveAll(_)
        1 * groupService.getGroupRecurrenceConfigsByGroupIds({ it as Set == [10L, 20L] as Set }) >> []
    }

    def "closePastSessions never calls group-api when the completed batch has no GROUP_RECURRING sessions"() {
        given:
        def pageable = PageRequest.of(0, 200)
        def standalone = Session.builder().id(1L).sessionType(SessionType.STANDALONE).status(SessionStatus.ONGOING).build()
        def batch = new PageImpl([standalone], pageable, 1)

        when:
        service.closePastSessions()

        then:
        1 * sessionRepository.findSessionsToComplete(
                [SessionStatus.SCHEDULED, SessionStatus.ONGOING], _ as Instant, pageable) >> batch
        1 * sessionRepository.saveAll(_)
        0 * groupService._
    }

    /** A generation failure must not fail closePastSessions — the batch's COMPLETED transitions
     * already succeeded and must not be treated as failed just because generation had a problem. */
    def "closePastSessions swallows a generation failure without failing the batch"() {
        given:
        def pageable = PageRequest.of(0, 200)
        def groupSession = Session.builder().id(1L).groupId(10L)
                .sessionType(SessionType.GROUP_RECURRING).status(SessionStatus.ONGOING).build()
        def batch = new PageImpl([groupSession], pageable, 1)

        when:
        service.closePastSessions()

        then:
        1 * sessionRepository.findSessionsToComplete(
                [SessionStatus.SCHEDULED, SessionStatus.ONGOING], _ as Instant, pageable) >> batch
        1 * sessionRepository.saveAll(_)
        1 * groupService.getGroupRecurrenceConfigsByGroupIds([10L]) >> { throw new RuntimeException("boom") }
        noExceptionThrown()
    }

    def "startOngoingSessions flips SCHEDULED sessions whose start has arrived to ONGOING, looping until empty"() {
        given:
        def pageable = PageRequest.of(0, 200)
        def session1 = Session.builder().id(1L).status(SessionStatus.SCHEDULED).build()
        def firstBatch = new PageImpl([session1], pageable, 201)
        def secondBatch = new PageImpl([], pageable, 0)

        when:
        service.startOngoingSessions()

        then:
        2 * sessionRepository.findSessionsToStart(SessionStatus.SCHEDULED, _ as Instant, pageable) >>>
                [firstBatch, secondBatch]
        1 * sessionRepository.saveAll({ List sessions -> sessions[0].status == SessionStatus.ONGOING })
        1 * sessionOutboxWriter.build("session.status.started", { SessionStatusStartedEvent e -> e.sessionId == 1L }) >>
                new SessionOutboxEvent()
        1 * sessionOutboxEventRepository.saveAll({ List<SessionOutboxEvent> events -> events.size() == 1 })
    }

    def "startOngoingSessions does nothing when nothing is ready to start"() {
        given:
        def pageable = PageRequest.of(0, 200)

        when:
        service.startOngoingSessions()

        then:
        1 * sessionRepository.findSessionsToStart(SessionStatus.SCHEDULED, _ as Instant, pageable) >> new PageImpl([])
        0 * sessionRepository.saveAll(_)
        0 * sessionOutboxWriter.build(_, _)
        0 * sessionOutboxEventRepository.saveAll(_)
    }

    // ── SESSION-21 ────────────────────────────────────────────────────────────

    def "startOngoingSessions writes one system comment per started session, in a single batched call"() {
        given: "three sessions starting in the same pass, each with its own anchor post and creator"
        def pageable = PageRequest.of(0, 200)
        def creators = [UUID.randomUUID(), UUID.randomUUID(), UUID.randomUUID()]
        def sessions = [0, 1, 2].collect {
            Session.builder().id(it + 1L).postId(100L + it).createdBy(creators[it])
                    .status(SessionStatus.SCHEDULED).build()
        }
        List<SystemSessionCommentRequest> written = null

        when:
        service.startOngoingSessions()

        then:
        2 * sessionRepository.findSessionsToStart(SessionStatus.SCHEDULED, _ as Instant, pageable) >>>
                [new PageImpl(sessions, pageable, 201), new PageImpl([], pageable, 0)]
        1 * sessionRepository.saveAll(_)
        3 * sessionOutboxWriter.build("session.status.started", _) >> new SessionOutboxEvent()
        1 * sessionOutboxEventRepository.saveAll(_)

        and: "exactly one call for the whole batch — not one per session"
        1 * commentService.createSystemSessionComments(_ as List) >> { List args -> written = args[0] }
        written.size() == 3
        written*.postId == [100L, 101L, 102L]
        written*.authorUserId == creators
        written.every { it.content == "The session has started" }

        and: "the started notification stays the outbox event's job"
        0 * commentService.createSystemSessionComment(_, _, _)
    }

    def "startOngoingSessions writes no system comments when nothing is ready to start"() {
        given:
        def pageable = PageRequest.of(0, 200)

        when:
        service.startOngoingSessions()

        then:
        1 * sessionRepository.findSessionsToStart(SessionStatus.SCHEDULED, _ as Instant, pageable) >> new PageImpl([])
        0 * commentService._
    }

    // ── SESSION-24 ────────────────────────────────────────────────────────────

    def "cancelUnpreparedSessions cancels a PREPARING session whose start has passed, looping until empty"() {
        given:
        def pageable = PageRequest.of(0, 200)
        def session1 = Session.builder().id(1L).status(SessionStatus.PREPARING).build()
        // total=201 with page size 200 forces hasNext()==true, so the loop re-queries once more
        def firstBatch = new PageImpl([session1], pageable, 201)
        def secondBatch = new PageImpl([], pageable, 0)

        when:
        service.cancelUnpreparedSessions()

        then:
        2 * sessionRepository.findUnpreparedSessionsToCancel(SessionStatus.PREPARING, _ as Instant, pageable) >>>
                [firstBatch, secondBatch]
        1 * sessionRepository.saveAll({ List sessions ->
            sessions[0].status == SessionStatus.CANCELLED &&
            sessions[0].cancelReason != null &&
            sessions[0].cancelledAt != null &&
            sessions[0].cancelledBy == null
        })
    }

    def "cancelUnpreparedSessions does nothing when no PREPARING session is past its start time"() {
        given:
        def pageable = PageRequest.of(0, 200)

        when:
        service.cancelUnpreparedSessions()

        then:
        1 * sessionRepository.findUnpreparedSessionsToCancel(SessionStatus.PREPARING, _ as Instant, pageable) >> new PageImpl([])
        0 * sessionRepository.saveAll(_)
    }
}
