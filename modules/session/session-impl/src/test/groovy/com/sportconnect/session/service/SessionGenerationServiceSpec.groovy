package com.sportconnect.session.service

import com.sportconnect.session.api.dto.SessionStatus
import com.sportconnect.session.api.dto.SessionType
import com.sportconnect.session.api.event.SessionStatusStartedEvent
import com.sportconnect.session.entity.Session
import com.sportconnect.session.entity.SessionOutboxEvent
import com.sportconnect.session.repository.SessionOutboxEventRepository
import com.sportconnect.session.repository.SessionRepository
import com.sportconnect.social.post.api.dto.SystemCode
import com.sportconnect.social.post.api.dto.SystemSessionCommentRequest
import com.sportconnect.social.post.api.service.CommentService
import org.springframework.context.ApplicationEventPublisher
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import spock.lang.Specification
import spock.lang.Subject

import java.time.Instant
import java.time.LocalDate

class SessionGenerationServiceSpec extends Specification {

    SessionRepository sessionRepository = Mock()
    SessionOutboxEventRepository sessionOutboxEventRepository = Mock()
    SessionOutboxWriter sessionOutboxWriter = Mock()
    CommentService commentService = Mock()
    ApplicationEventPublisher eventPublisher = Mock()

    @Subject
    SessionGenerationService service = new SessionGenerationService(
            sessionRepository, sessionOutboxEventRepository, sessionOutboxWriter, commentService, eventPublisher)

    def "generatedTitle follows the language, falls back to English and fits the column (SESSION-49)"() {
        expect:
        SessionGenerationService.generatedTitle(name, lang) == expected

        where:
        name      | lang | expected
        "Group A" | "en" | "Group A's session"
        "Nhóm A"  | "vi" | "Trận đấu của nhóm Nhóm A"
        "Group A" | null | "Group A's session"
        "Group A" | "fr" | "Group A's session"
        " Pad "   | "en" | "Pad's session"
    }

    def "generatedTitle is cut to the 200 characters the column holds (SESSION-49)"() {
        expect:
        SessionGenerationService.generatedTitle("x" * 300, "en").length() == 200
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
        0 * eventPublisher.publishEvent(_)
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
        0 * eventPublisher.publishEvent(_)
    }

    // -- SESSION-GROUP-5: closePastSessions reports the regular sessions it completed -------------------------------------

    def "closePastSessions reports the regular sessions it completed as one event, one entry per (group, day)"() {
        given:
        def pageable = PageRequest.of(0, 200)
        def day = LocalDate.of(2026, 11, 20)
        def regular = Session.builder().id(1L).groupId(10L).sessionType(SessionType.GROUP_RECURRING)
                .status(SessionStatus.ONGOING).recurrenceId(7L).occurrenceDate(day).build()
        def sameDayAndGroup = Session.builder().id(2L).groupId(10L).sessionType(SessionType.GROUP_RECURRING)
                .status(SessionStatus.ONGOING).recurrenceId(8L).occurrenceDate(day).build()
        def otherGroup = Session.builder().id(3L).groupId(11L).sessionType(SessionType.GROUP_RECURRING)
                .status(SessionStatus.SCHEDULED).recurrenceId(9L).occurrenceDate(day).build()
        def custom = Session.builder().id(4L).groupId(10L).sessionType(SessionType.GROUP_RECURRING)
                .status(SessionStatus.ONGOING).build()
        def standalone = Session.builder().id(5L).sessionType(SessionType.STANDALONE).status(SessionStatus.ONGOING).build()

        when:
        service.closePastSessions()

        then:
        1 * sessionRepository.findSessionsToComplete([SessionStatus.SCHEDULED, SessionStatus.ONGOING], _ as Instant, pageable) >>
                new PageImpl([regular, sameDayAndGroup, otherGroup, custom, standalone], pageable, 5)
        1 * sessionRepository.saveAll(_)
        1 * eventPublisher.publishEvent({ e ->
            e instanceof GroupSessionGenerationEvents.RegularSessionsEnded &&
                    (e.days() as Set) == ([new GroupSessionGenerationEvents.GroupDay(10L, day),
                                           new GroupSessionGenerationEvents.GroupDay(11L, day)] as Set) &&
                    e.days().size() == 2
        })
    }

    def "closePastSessions reports nothing when the batch holds no regular session (custom and standalone ones never trigger)"() {
        given:
        def pageable = PageRequest.of(0, 200)
        def custom = Session.builder().id(1L).groupId(10L).sessionType(SessionType.GROUP_RECURRING).status(SessionStatus.ONGOING).build()
        def standalone = Session.builder().id(2L).sessionType(SessionType.STANDALONE).status(SessionStatus.ONGOING).build()

        when:
        service.closePastSessions()

        then:
        1 * sessionRepository.findSessionsToComplete(_, _ as Instant, pageable) >> new PageImpl([custom, standalone], pageable, 2)
        1 * sessionRepository.saveAll(_)
        0 * eventPublisher.publishEvent(_)
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
        written.every { it.systemCode == SystemCode.SESSION_STARTED && it.systemParams == null }

        and: "the started notification stays the outbox event's job"
        0 * commentService.createSystemSessionComment(*_)
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
