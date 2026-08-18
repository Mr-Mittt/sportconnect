package com.sportconnect.session.service

import com.sportconnect.group.api.dto.GroupRecurrenceConfigResponse
import com.sportconnect.group.api.service.GroupService
import com.sportconnect.session.api.dto.SessionStatus
import com.sportconnect.session.api.dto.SessionType
import com.sportconnect.session.api.event.SessionStatusStartedEvent
import com.sportconnect.session.entity.Session
import com.sportconnect.session.entity.SessionOutboxEvent
import com.sportconnect.session.repository.SessionOutboxEventRepository
import com.sportconnect.session.repository.SessionRepository
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import spock.lang.Specification
import spock.lang.Subject

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.LocalTime

class SessionGenerationServiceSpec extends Specification {

    SessionRepository sessionRepository = Mock()
    GroupService groupService = Mock()
    SessionOutboxEventRepository sessionOutboxEventRepository = Mock()
    SessionOutboxWriter sessionOutboxWriter = Mock()

    @Subject
    SessionGenerationService service = new SessionGenerationService(
            sessionRepository, groupService, sessionOutboxEventRepository, sessionOutboxWriter)

    def "generateUpcomingSessions skips a group with an incomplete recurrence rule"() {
        given:
        def config = GroupRecurrenceConfigResponse.builder()
                .groupId(1L).sportId(1L).ownerId(UUID.randomUUID())
                .recurrenceDayOfWeek(DayOfWeek.TUESDAY)
                .recurrenceLocationId(null) // incomplete — no location
                .build()

        when:
        service.generateUpcomingSessions()

        then:
        1 * groupService.getGroupsWithAutoGenerateSessionsEnabled() >> [config]
        0 * sessionRepository._
    }

    def "generateUpcomingSessions skips a group whose next occurrence already exists"() {
        given:
        def config = GroupRecurrenceConfigResponse.builder()
                .groupId(1L).sportId(1L).ownerId(UUID.randomUUID())
                .recurrenceDayOfWeek(DayOfWeek.TUESDAY).recurrenceTime(LocalTime.of(19, 0))
                .recurrenceLocationId(5L)
                .build()

        when:
        service.generateUpcomingSessions()

        then:
        1 * groupService.getGroupsWithAutoGenerateSessionsEnabled() >> [config]
        1 * sessionRepository.existsByGroupIdAndScheduledStart(1L, _ as LocalDateTime) >> true
        0 * sessionRepository.save(_)
    }

    def "generateUpcomingSessions creates a session copying the recurrence config"() {
        given:
        def ownerId = UUID.randomUUID()
        def config = GroupRecurrenceConfigResponse.builder()
                .groupId(1L).sportId(1L).ownerId(ownerId)
                .recurrenceDayOfWeek(DayOfWeek.TUESDAY).recurrenceTime(LocalTime.of(19, 0))
                .recurrenceDurationMinutes(90).recurrenceLocationId(5L)
                .recurrenceLocationNote("Court 3")
                .build()

        when:
        service.generateUpcomingSessions()

        then:
        1 * groupService.getGroupsWithAutoGenerateSessionsEnabled() >> [config]
        1 * sessionRepository.existsByGroupIdAndScheduledStart(1L, _ as LocalDateTime) >> false
        1 * sessionRepository.save({ Session s ->
            s.groupId == 1L &&
            s.sessionType == SessionType.GROUP_RECURRING &&
            s.createdBy == ownerId &&
            s.sportId == 1L &&
            s.locationId == 5L &&
            s.locationNote == "Court 3" &&
            s.status == SessionStatus.SCHEDULED &&
            s.scheduledEndAt == s.scheduledStart.plusMinutes(90)
        }) >> { Session s -> s }
    }

    def "generateUpcomingSessions swallows a unique-constraint race instead of failing the batch"() {
        given:
        def config = GroupRecurrenceConfigResponse.builder()
                .groupId(1L).sportId(1L).ownerId(UUID.randomUUID())
                .recurrenceDayOfWeek(DayOfWeek.TUESDAY).recurrenceTime(LocalTime.of(19, 0))
                .recurrenceLocationId(5L)
                .build()

        when:
        service.generateUpcomingSessions()

        then:
        1 * groupService.getGroupsWithAutoGenerateSessionsEnabled() >> [config]
        1 * sessionRepository.existsByGroupIdAndScheduledStart(1L, _ as LocalDateTime) >> false
        1 * sessionRepository.save(_) >> { throw new DataIntegrityViolationException("dup") }
        noExceptionThrown()
    }

    def "computeNextOccurrence rolls forward a week when today is the target weekday but the time already passed"() {
        given:
        def past = LocalTime.now().minusHours(1)

        when:
        def result = service.computeNextOccurrence(LocalDate.now().dayOfWeek, past)

        then:
        result.toLocalDate() == LocalDate.now().plusWeeks(1)
        result.toLocalTime() == past
    }

    def "computeNextOccurrence uses today when today is the target weekday and the time hasn't passed"() {
        given:
        def future = LocalTime.now().plusHours(2)

        when:
        def result = service.computeNextOccurrence(LocalDate.now().dayOfWeek, future)

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
        def session1 = Session.builder().id(1L).status(SessionStatus.ONGOING).build()
        // total=201 with page size 200 forces hasNext()==true, so the loop re-queries once more
        def firstBatch = new PageImpl([session1], pageable, 201)
        def secondBatch = new PageImpl([], pageable, 0)

        when:
        service.closePastSessions()

        then:
        2 * sessionRepository.findSessionsToComplete(
                [SessionStatus.SCHEDULED, SessionStatus.ONGOING], _ as LocalDateTime, pageable) >>>
                [firstBatch, secondBatch]
        1 * sessionRepository.saveAll({ List sessions -> sessions[0].status == SessionStatus.COMPLETED })
    }

    def "closePastSessions does nothing when there are no past-due sessions"() {
        given:
        def pageable = PageRequest.of(0, 200)

        when:
        service.closePastSessions()

        then:
        1 * sessionRepository.findSessionsToComplete(
                [SessionStatus.SCHEDULED, SessionStatus.ONGOING], _ as LocalDateTime, pageable) >> new PageImpl([])
        0 * sessionRepository.saveAll(_)
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
        2 * sessionRepository.findSessionsToStart(SessionStatus.SCHEDULED, _ as LocalDateTime, pageable) >>>
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
        1 * sessionRepository.findSessionsToStart(SessionStatus.SCHEDULED, _ as LocalDateTime, pageable) >> new PageImpl([])
        0 * sessionRepository.saveAll(_)
        0 * sessionOutboxWriter.build(_, _)
        0 * sessionOutboxEventRepository.saveAll(_)
    }
}
