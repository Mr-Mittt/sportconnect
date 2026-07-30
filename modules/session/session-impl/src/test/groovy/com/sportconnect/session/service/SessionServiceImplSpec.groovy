package com.sportconnect.session.service

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.group.api.dto.GroupResponse
import com.sportconnect.group.api.service.GroupService
import com.sportconnect.location.api.dto.LocationResponse
import com.sportconnect.location.api.service.LocationService
import com.sportconnect.session.api.dto.CancelSessionRequest
import com.sportconnect.session.api.dto.CreateSessionRequest
import com.sportconnect.session.api.dto.ParticipantStatus
import com.sportconnect.session.api.dto.SessionStatus
import com.sportconnect.session.api.dto.SessionType
import com.sportconnect.session.api.dto.UpdateSessionRequest
import com.sportconnect.session.entity.Session
import com.sportconnect.session.entity.SessionParticipant
import com.sportconnect.session.repository.SessionParticipantRepository
import com.sportconnect.session.repository.SessionRepository
import com.sportconnect.sport.api.service.SportService
import com.sportconnect.user.api.service.UserService
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDateTime

class SessionServiceImplSpec extends Specification {

    SessionRepository sessionRepository = Mock()
    SessionParticipantRepository sessionParticipantRepository = Mock()
    GroupService groupService = Mock()
    LocationService locationService = Mock()
    UserService userService = Mock()
    SportService sportService = Mock()

    @Subject
    SessionServiceImpl sessionService = new SessionServiceImpl(
            sessionRepository, sessionParticipantRepository, groupService, locationService, userService, sportService)

    def basketballLocation = LocationResponse.builder().id(1L).sportId(1L).name("Court").build()
    def tennisLocation = LocationResponse.builder().id(2L).sportId(2L).name("Tennis Court").build()

    private void stubBatchEnrichment() {
        userService.getUsersByIds(_) >> [:]
        sportService.getSportsByIds(_) >> [:]
        locationService.getLocationsByIds(_) >> [1L: basketballLocation]
        sessionParticipantRepository.countBySessionIdsAndStatus(_, _) >> []
    }

    def "createSession creates a standalone session open to any user"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L)
                .locationId(1L)
                .locationNote("Court 3")
                .scheduledStart(LocalDateTime.now().plusDays(1))
                .build()
        def saved = Session.builder().id(1L).sessionType(SessionType.STANDALONE).createdBy(userId)
                .sportId(1L).locationId(1L).locationNote("Court 3").scheduledStart(request.scheduledStart)
                .status(SessionStatus.SCHEDULED).build()

        when:
        def result = sessionService.createSession(userId, request)

        then:
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save({ Session s ->
            s.sessionType == SessionType.STANDALONE && s.groupId == null && s.locationNote == "Court 3"
        }) >> saved
        0 * groupService._
        interaction { stubBatchEnrichment() }
        result.sessionType == SessionType.STANDALONE
        result.locationNote == "Court 3"
    }

    def "createSession rejects a standalone session without a sportId"() {
        given:
        def request = CreateSessionRequest.builder().locationId(1L).scheduledStart(LocalDateTime.now()).build()

        when:
        sessionService.createSession(UUID.randomUUID(), request)

        then:
        thrown(BadRequestException)
        0 * sessionRepository.save(_)
    }

    def "createSession requires canManageMembers for a group-linked session"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .groupId(5L).locationId(1L).scheduledStart(LocalDateTime.now()).build()

        when:
        sessionService.createSession(userId, request)

        then:
        1 * groupService.canManageMembers(5L, userId) >> false
        thrown(BadRequestException)
        0 * sessionRepository.save(_)
    }

    def "createSession inherits sportId from the group when omitted"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .groupId(5L).locationId(1L).scheduledStart(LocalDateTime.now().plusDays(1)).build()
        def group = GroupResponse.builder().id(5L).sportId(1L).build()
        def saved = Session.builder().id(2L).groupId(5L).sessionType(SessionType.GROUP_RECURRING)
                .createdBy(userId).sportId(1L).locationId(1L).scheduledStart(request.scheduledStart)
                .status(SessionStatus.SCHEDULED).build()

        when:
        def result = sessionService.createSession(userId, request)

        then:
        1 * groupService.canManageMembers(5L, userId) >> true
        1 * groupService.getGroup(5L, userId) >> group
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save({ Session s -> s.sportId == 1L && s.sessionType == SessionType.GROUP_RECURRING }) >> saved
        interaction { stubBatchEnrichment() }
        result.sportId == 1L
    }

    def "createSession rejects a locationId whose sport doesn't match"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(2L).scheduledStart(LocalDateTime.now()).build()

        when:
        sessionService.createSession(userId, request)

        then:
        1 * locationService.getLocation(2L) >> tennisLocation
        thrown(BadRequestException)
        0 * sessionRepository.save(_)
    }

    def "getGroupSessions delegates private-group visibility to GroupService.getGroup"() {
        given:
        def userId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)

        when:
        sessionService.getGroupSessions(5L, userId, pageable)

        then:
        1 * groupService.getGroup(5L, userId) >> GroupResponse.builder().id(5L).build()
        1 * sessionRepository.findByGroupId(5L, pageable) >> new PageImpl([])
    }

    def "updateSession allows the creator of a standalone session"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(userId).sportId(1L).locationId(1L)
                .scheduledStart(LocalDateTime.now()).status(SessionStatus.SCHEDULED).build()
        def request = UpdateSessionRequest.builder().title("New title").build()

        when:
        sessionService.updateSession(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionRepository.save({ Session s -> s.title == "New title" }) >> session
        interaction { stubBatchEnrichment() }
    }

    def "updateSession rejects a non-creator for a standalone session"() {
        given:
        def session = Session.builder().id(1L).createdBy(UUID.randomUUID()).status(SessionStatus.SCHEDULED).build()

        when:
        sessionService.updateSession(1L, UUID.randomUUID(), UpdateSessionRequest.builder().build())

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        thrown(BadRequestException)
    }

    def "updateSession for a group-linked session requires canManageMembers"() {
        given:
        def session = Session.builder().id(1L).groupId(5L).createdBy(UUID.randomUUID()).status(SessionStatus.SCHEDULED).build()
        def userId = UUID.randomUUID()

        when:
        sessionService.updateSession(1L, userId, UpdateSessionRequest.builder().build())

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * groupService.canManageMembers(5L, userId) >> false
        thrown(BadRequestException)
    }

    def "cancelSession rejects cancelling a completed session"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(userId).status(SessionStatus.COMPLETED).build()

        when:
        sessionService.cancelSession(1L, userId, CancelSessionRequest.builder().build())

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        thrown(BadRequestException)
        0 * sessionRepository.save(_)
    }

    def "cancelSession rejects cancelling an already-cancelled session"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(userId).status(SessionStatus.CANCELLED).build()

        when:
        sessionService.cancelSession(1L, userId, null)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        thrown(BadRequestException)
        0 * sessionRepository.save(_)
    }

    def "cancelSession sets status/reason/cancelledBy/cancelledAt for the creator of a standalone session"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(userId).status(SessionStatus.SCHEDULED).build()
        def request = CancelSessionRequest.builder().reason("Rained out").build()

        when:
        def result = sessionService.cancelSession(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionRepository.save({ Session s ->
            s.status == SessionStatus.CANCELLED &&
            s.cancelReason == "Rained out" &&
            s.cancelledBy == userId &&
            s.cancelledAt != null
        }) >> { Session s -> s }
        interaction { stubBatchEnrichment() }
        result.status == SessionStatus.CANCELLED
        result.cancelReason == "Rained out"
    }

    def "cancelSession for a group-linked session requires canManageMembers"() {
        given:
        def session = Session.builder().id(1L).groupId(5L).createdBy(UUID.randomUUID()).status(SessionStatus.SCHEDULED).build()
        def userId = UUID.randomUUID()

        when:
        sessionService.cancelSession(1L, userId, null)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * groupService.canManageMembers(5L, userId) >> false
        thrown(BadRequestException)
        0 * sessionRepository.save(_)
    }

    def "getSession throws ResourceNotFoundException when missing"() {
        when:
        sessionService.getSession(99L)

        then:
        1 * sessionRepository.findById(99L) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    def "joinSession rejects joining a cancelled session"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).status(SessionStatus.CANCELLED).build()

        when:
        sessionService.joinSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        0 * groupService._
        thrown(BadRequestException)
        0 * sessionParticipantRepository.save(_)
    }

    def "joinSession requires group membership for a group-linked session"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).groupId(5L).build()

        when:
        sessionService.joinSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * groupService.isGroupMember(5L, userId) >> false
        thrown(BadRequestException)
        0 * sessionParticipantRepository.save(_)
    }

    def "joinSession is open for a standalone session"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).build()

        when:
        sessionService.joinSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        0 * groupService._
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.empty()
        1 * sessionParticipantRepository.save({ SessionParticipant p -> p.status == ParticipantStatus.JOINED }) >> { SessionParticipant p -> p }
    }

    def "joinSession flips an existing LEFT row back to JOINED instead of inserting a duplicate"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).build()
        def existing = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.LEFT).build()

        when:
        sessionService.joinSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(existing)
        1 * sessionParticipantRepository.save({ SessionParticipant p -> p.id == 9L && p.status == ParticipantStatus.JOINED }) >> existing
    }

    def "leaveSession rejects when not currently joined"() {
        given:
        def userId = UUID.randomUUID()

        when:
        sessionService.leaveSession(1L, userId)

        then:
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.empty()
        thrown(BadRequestException)
    }

    def "leaveSession flips a JOINED row to LEFT"() {
        given:
        def userId = UUID.randomUUID()
        def existing = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.JOINED).build()

        when:
        sessionService.leaveSession(1L, userId)

        then:
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(existing)
        1 * sessionParticipantRepository.save({ SessionParticipant p -> p.status == ParticipantStatus.LEFT }) >> existing
    }

    def "getSessionParticipants returns only JOINED participants"() {
        given:
        def pageable = PageRequest.of(0, 10)

        when:
        sessionService.getSessionParticipants(1L, pageable)

        then:
        1 * sessionParticipantRepository.findBySessionIdAndStatus(1L, ParticipantStatus.JOINED, pageable) >> new PageImpl([])
    }
}
