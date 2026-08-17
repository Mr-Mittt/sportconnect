package com.sportconnect.session.service

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ForbiddenException
import com.sportconnect.common.exception.NotFoundException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.group.api.dto.GroupResponse
import com.sportconnect.group.api.service.GroupService
import com.sportconnect.location.api.dto.LocationResponse
import com.sportconnect.location.api.service.LocationService
import com.sportconnect.session.access.SessionGate
import com.sportconnect.session.api.dto.CancelSessionRequest
import com.sportconnect.session.api.dto.CreateSessionRequest
import com.sportconnect.session.api.dto.FeeType
import com.sportconnect.session.api.dto.ParticipantStatus
import com.sportconnect.session.api.dto.RejectParticipantRequest
import com.sportconnect.session.api.dto.SessionStatus
import com.sportconnect.session.api.dto.SessionType
import com.sportconnect.session.api.dto.UpdateSessionRequest
import com.sportconnect.session.api.event.SessionCommentCreatedEvent
import com.sportconnect.session.api.event.SessionInvitationCreatedEvent
import com.sportconnect.session.api.event.SessionJoinRequestApprovedEvent
import com.sportconnect.session.api.event.SessionJoinRequestCreatedEvent
import com.sportconnect.session.api.event.SessionJoinRequestRejectedEvent
import com.sportconnect.session.api.event.SessionParticipantJoinedEvent
import com.sportconnect.session.entity.Session
import com.sportconnect.session.entity.SessionOutboxEvent
import com.sportconnect.session.entity.SessionParticipant
import com.sportconnect.session.repository.SessionOutboxEventRepository
import com.sportconnect.session.repository.SessionParticipantRepository
import com.sportconnect.session.repository.SessionRepository
import com.sportconnect.social.post.api.dto.CommentResponse
import com.sportconnect.social.post.api.dto.CreateCommentRequest
import com.sportconnect.social.post.api.service.CommentService
import com.sportconnect.social.post.api.service.PostService
import com.sportconnect.sport.api.dto.UserSportProfileResponse
import com.sportconnect.sport.api.service.SportService
import com.sportconnect.sport.api.service.UserSportProfileService
import com.sportconnect.user.api.service.UserService
import com.fasterxml.jackson.databind.ObjectMapper
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
    UserSportProfileService userSportProfileService = Mock()
    PostService postService = Mock()
    CommentService commentService = Mock()
    SessionGate sessionGate = Mock()
    SessionOutboxEventRepository sessionOutboxEventRepository = Mock()
    ObjectMapper objectMapper = new ObjectMapper()

    @Subject
    SessionServiceImpl sessionService = new SessionServiceImpl(
            sessionRepository, sessionParticipantRepository, groupService, locationService, userService,
            sportService, userSportProfileService, postService, commentService, sessionGate,
            sessionOutboxEventRepository, objectMapper)

    def basketballLocation = LocationResponse.builder().id(1L).sportId(1L).name("Court").build()
    def tennisLocation = LocationResponse.builder().id(2L).sportId(2L).name("Tennis Court").build()

    def setup() {
        // SESSION-10/A17: every createSession call creates a companion SESSION_POST first — a
        // lenient default so tests that aren't specifically about this behavior don't each need
        // to stub it themselves, same convention as stubBatchEnrichment().
        postService.createSessionPost(_, _) >> 999L
    }

    private void stubBatchEnrichment() {
        userService.getUsersByIds(_) >> [:]
        sportService.getSportsByIds(_) >> [:]
        locationService.getLocationsByIds(_) >> [1L: basketballLocation]
        sessionParticipantRepository.countBySessionIdsAndStatus(_, _) >> []
        sessionParticipantRepository.findBySessionIdInAndUserId(_, _) >> []
        postService.getSessionPostLikeInfo(_, _) >> [:]
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

    def "createSession auto-joins the creator for a standalone session"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).scheduledStart(LocalDateTime.now().plusDays(1)).build()
        def saved = Session.builder().id(1L).sessionType(SessionType.STANDALONE).createdBy(userId)
                .sportId(1L).locationId(1L).scheduledStart(request.scheduledStart).status(SessionStatus.SCHEDULED).build()

        when:
        sessionService.createSession(userId, request)

        then:
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save(_) >> saved
        1 * sessionParticipantRepository.saveAll({ List participants ->
            participants.size() == 1 && participants[0].sessionId == 1L &&
                    participants[0].userId == userId && participants[0].status == ParticipantStatus.JOINED
        })
        interaction { stubBatchEnrichment() }
    }

    def "createSession does not auto-join the creator for a group-linked session"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .groupId(5L).locationId(1L).scheduledStart(LocalDateTime.now().plusDays(1)).build()
        def group = GroupResponse.builder().id(5L).sportId(1L).build()
        def saved = Session.builder().id(2L).groupId(5L).sessionType(SessionType.GROUP_RECURRING)
                .createdBy(userId).sportId(1L).locationId(1L).scheduledStart(request.scheduledStart)
                .status(SessionStatus.SCHEDULED).build()

        when:
        sessionService.createSession(userId, request)

        then:
        1 * groupService.canManageMembers(5L, userId) >> true
        1 * groupService.getGroup(5L, userId) >> group
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save(_) >> saved
        0 * sessionParticipantRepository.saveAll(_)
        interaction { stubBatchEnrichment() }
    }

    def "createSession pre-creates INVITED rows for inviteeIds, deduped and excluding the creator's own id"() {
        given:
        def userId = UUID.randomUUID()
        def inviteeA = UUID.randomUUID()
        def inviteeB = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).scheduledStart(LocalDateTime.now().plusDays(1))
                .inviteeIds([inviteeA, inviteeB, inviteeA, userId])
                .build()
        def saved = Session.builder().id(1L).sessionType(SessionType.STANDALONE).createdBy(userId)
                .sportId(1L).locationId(1L).scheduledStart(request.scheduledStart).status(SessionStatus.SCHEDULED).build()

        when:
        sessionService.createSession(userId, request)

        then:
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save(_) >> saved
        1 * sessionParticipantRepository.saveAll({ List participants ->
            def invited = participants.findAll { it.status == ParticipantStatus.INVITED }
            def joined = participants.findAll { it.status == ParticipantStatus.JOINED }
            participants.size() == 3 &&
                    joined.size() == 1 && joined[0].userId == userId &&
                    invited.size() == 2 &&
                    invited*.userId.toSet() == [inviteeA, inviteeB].toSet()
        })
        interaction { stubBatchEnrichment() }
    }

    def "createSession writes a session.invitation.created outbox row per invitee, with the invitee as recipient"() {
        given:
        def userId = UUID.randomUUID()
        def inviteeA = UUID.randomUUID()
        def inviteeB = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).scheduledStart(LocalDateTime.now().plusDays(1))
                .inviteeIds([inviteeA, inviteeB])
                .build()
        def saved = Session.builder().id(1L).sessionType(SessionType.STANDALONE).createdBy(userId)
                .sportId(1L).locationId(1L).scheduledStart(request.scheduledStart).status(SessionStatus.SCHEDULED).build()

        when:
        sessionService.createSession(userId, request)

        then:
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save(_) >> saved
        1 * sessionParticipantRepository.saveAll(_)
        interaction { stubBatchEnrichment() }
        1 * sessionOutboxEventRepository.saveAll({ List<SessionOutboxEvent> events ->
            events.size() == 2 && events.every { it.eventType == "session.invitation.created" } &&
                    events.collect { objectMapper.readValue(it.payload, SessionInvitationCreatedEvent).recipientUserId }
                            .toSet() == [inviteeA, inviteeB].toSet()
        })
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
        sessionService.getSession(99L, UUID.randomUUID())

        then:
        1 * sessionRepository.findById(99L) >> Optional.empty()
        thrown(ResourceNotFoundException)
    }

    def "getSession populates callerParticipation from the caller's own SessionParticipant row"() {
        given:
        def callerId = UUID.randomUUID()
        def session = Session.builder().id(1L).sportId(1L).locationId(1L).build()
        def ownRow = SessionParticipant.builder().id(9L).sessionId(1L).userId(callerId)
                .status(ParticipantStatus.REQUESTED).build()
        stubBatchEnrichment()

        when:
        def response = sessionService.getSession(1L, callerId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdInAndUserId([1L], callerId) >> [ownRow]
        response.callerParticipation.status == ParticipantStatus.REQUESTED
        response.callerParticipation.id == 9L
        // Caller's own identity is already known client-side — not re-enriched here.
        response.callerParticipation.userFullName == null
    }

    def "getSession leaves callerParticipation null when the caller has no row for that session"() {
        given:
        def callerId = UUID.randomUUID()
        def session = Session.builder().id(1L).sportId(1L).locationId(1L).build()
        stubBatchEnrichment()

        when:
        def response = sessionService.getSession(1L, callerId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdInAndUserId([1L], callerId) >> []
        response.callerParticipation == null
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

    def "joinSession is open for a standalone session, joining instantly when autoApprove is true"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).autoApprove(true).build()

        when:
        sessionService.joinSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        0 * groupService._
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.empty()
        1 * sessionParticipantRepository.save({ SessionParticipant p -> p.status == ParticipantStatus.JOINED }) >> { SessionParticipant p -> p }
    }

    def "joinSession flips an existing LEFT row back to JOINED when autoApprove is true instead of inserting a duplicate"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).autoApprove(true).build()
        def existing = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.LEFT).build()

        when:
        sessionService.joinSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(existing)
        1 * sessionParticipantRepository.save({ SessionParticipant p -> p.id == 9L && p.status == ParticipantStatus.JOINED }) >> existing
    }

    def "joinSession puts a non-invited joiner into REQUESTED when autoApprove is false"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).autoApprove(false).build()

        when:
        sessionService.joinSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.empty()
        1 * sessionParticipantRepository.save({ SessionParticipant p -> p.status == ParticipantStatus.REQUESTED }) >> { SessionParticipant p -> p }
    }

    def "joinSession resolves an INVITED row straight to JOINED even when autoApprove is false"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).autoApprove(false).build()
        def existing = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.INVITED).build()

        when:
        sessionService.joinSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(existing)
        1 * sessionParticipantRepository.save({ SessionParticipant p -> p.id == 9L && p.status == ParticipantStatus.JOINED }) >> existing
    }

    def "joinSession writes a session.join_request.created outbox row, recipient is the organizer, when autoApprove is false"() {
        given:
        def organizerId = UUID.randomUUID()
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(organizerId).autoApprove(false).build()

        when:
        sessionService.joinSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.empty()
        1 * sessionParticipantRepository.save(_) >> { SessionParticipant p -> p }
        1 * sessionOutboxEventRepository.save({ SessionOutboxEvent e ->
            e.eventType == "session.join_request.created" &&
                    objectMapper.readValue(e.payload, SessionJoinRequestCreatedEvent).actorId == userId &&
                    objectMapper.readValue(e.payload, SessionJoinRequestCreatedEvent).recipientUserId == organizerId
        }) >> { SessionOutboxEvent e -> e }
    }

    def "joinSession writes a session.participant.joined outbox row when autoApprove is true"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).autoApprove(true).build()

        when:
        sessionService.joinSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.empty()
        1 * sessionParticipantRepository.save(_) >> { SessionParticipant p -> p }
        1 * sessionOutboxEventRepository.save({ SessionOutboxEvent e ->
            e.eventType == "session.participant.joined" &&
                    objectMapper.readValue(e.payload, SessionParticipantJoinedEvent).actorId == userId
        }) >> { SessionOutboxEvent e -> e }
    }

    def "joinSession writes a session.participant.joined outbox row when an INVITED row resolves to JOINED"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).autoApprove(false).build()
        def existing = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.INVITED).build()

        when:
        sessionService.joinSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(existing)
        1 * sessionParticipantRepository.save(_) >> existing
        1 * sessionOutboxEventRepository.save({ SessionOutboxEvent e -> e.eventType == "session.participant.joined" })
    }

    def "joinSession does not re-fire session.join_request.created when the caller is already REQUESTED"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).autoApprove(false).build()
        def existing = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.REQUESTED).build()

        when:
        sessionService.joinSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(existing)
        1 * sessionParticipantRepository.save(_) >> existing
        0 * sessionOutboxEventRepository.save(_)
    }

    def "joinSession never fires an outbox event when the caller is already JOINED"() {
        given:
        def userId = UUID.randomUUID()
        // autoApprove is false here on purpose: this is the pre-existing gap noted in
        // SessionServiceImpl.joinSession — the status ternary recomputes REQUESTED for an
        // already-JOINED caller re-invoking join on a non-autoApprove session. The guard added
        // for SESSION-15 must still not fire anything, regardless of that recompute.
        def session = Session.builder().id(1L).autoApprove(false).build()
        def existing = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.JOINED).build()

        when:
        sessionService.joinSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(existing)
        1 * sessionParticipantRepository.save(_) >> existing
        0 * sessionOutboxEventRepository.save(_)
    }

    def "leaveSession rejects when the caller has no participant row at all"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).build()

        when:
        sessionService.leaveSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.empty()
        thrown(BadRequestException)
    }

    def "leaveSession rejects a row that's already LEFT"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).build()
        def existing = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.LEFT).build()

        when:
        sessionService.leaveSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(existing)
        thrown(BadRequestException)
        0 * sessionParticipantRepository.save(_)
    }

    def "leaveSession flips a JOINED row to LEFT"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).build()
        def existing = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.JOINED).build()

        when:
        sessionService.leaveSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(existing)
        1 * sessionParticipantRepository.save({ SessionParticipant p -> p.status == ParticipantStatus.LEFT }) >> existing
    }

    def "leaveSession doubles as decline, flipping an INVITED row to LEFT"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).build()
        def existing = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.INVITED).build()

        when:
        sessionService.leaveSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(existing)
        1 * sessionParticipantRepository.save({ SessionParticipant p -> p.status == ParticipantStatus.LEFT }) >> existing
    }

    def "leaveSession doubles as cancelling my own request, flipping a REQUESTED row to LEFT"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).build()
        def existing = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.REQUESTED).build()

        when:
        sessionService.leaveSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(existing)
        1 * sessionParticipantRepository.save({ SessionParticipant p -> p.status == ParticipantStatus.LEFT }) >> existing
    }

    def "leaveSession rejects the creator of a standalone session, even though they're auto-JOINED"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).groupId(null).createdBy(userId).build()

        when:
        sessionService.leaveSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        0 * sessionParticipantRepository._
        thrown(BadRequestException)
    }

    def "leaveSession allows a group-linked session's creator to leave if they joined like a normal member"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).groupId(5L).createdBy(userId).build()
        def existing = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.JOINED).build()

        when:
        sessionService.leaveSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(existing)
        1 * sessionParticipantRepository.save({ SessionParticipant p -> p.status == ParticipantStatus.LEFT }) >> existing
    }

    def "getSessionParticipants defaults to JOINED and stays public when status is omitted"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)

        when:
        sessionService.getSessionParticipants(1L, callerId, null, pageable)

        then:
        0 * sessionRepository.findById(_)
        1 * sessionParticipantRepository.findBySessionIdAndStatus(1L, ParticipantStatus.JOINED, pageable) >> new PageImpl([])
    }

    def "getSessionParticipants gates a non-JOINED status the same as cancelSession/updateSession"() {
        given:
        def callerId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(UUID.randomUUID()).status(SessionStatus.SCHEDULED).build()
        def pageable = PageRequest.of(0, 10)

        when:
        sessionService.getSessionParticipants(1L, callerId, ParticipantStatus.REQUESTED, pageable)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        thrown(BadRequestException)
        0 * sessionParticipantRepository.findBySessionIdAndStatus(*_)
    }

    def "getSessionParticipants allows the creator to view a non-JOINED status"() {
        given:
        def callerId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(callerId).status(SessionStatus.SCHEDULED).build()
        def pageable = PageRequest.of(0, 10)

        when:
        sessionService.getSessionParticipants(1L, callerId, ParticipantStatus.REQUESTED, pageable)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndStatus(1L, ParticipantStatus.REQUESTED, pageable) >> new PageImpl([])
    }

    def "approveParticipant transitions a REQUESTED row to JOINED"() {
        given:
        def callerId = UUID.randomUUID()
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(callerId).status(SessionStatus.SCHEDULED).build()
        def participant = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.REQUESTED).build()

        when:
        sessionService.approveParticipant(1L, callerId, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(participant)
        1 * sessionParticipantRepository.save({ SessionParticipant p -> p.status == ParticipantStatus.JOINED }) >> participant
    }

    def "approveParticipant writes both session.join_request.approved (to the requester) and session.participant.joined (fan-out) outbox rows"() {
        given:
        def callerId = UUID.randomUUID()
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(callerId).status(SessionStatus.SCHEDULED).build()
        def participant = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.REQUESTED).build()

        when:
        sessionService.approveParticipant(1L, callerId, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(participant)
        1 * sessionParticipantRepository.save(_) >> participant
        1 * sessionOutboxEventRepository.save({ SessionOutboxEvent e ->
            e.eventType == "session.join_request.approved" &&
                    objectMapper.readValue(e.payload, SessionJoinRequestApprovedEvent).actorId == callerId &&
                    objectMapper.readValue(e.payload, SessionJoinRequestApprovedEvent).recipientUserId == userId
        }) >> { SessionOutboxEvent e -> e }
        1 * sessionOutboxEventRepository.save({ SessionOutboxEvent e ->
            e.eventType == "session.participant.joined" &&
                    objectMapper.readValue(e.payload, SessionParticipantJoinedEvent).actorId == userId
        }) >> { SessionOutboxEvent e -> e }
    }

    def "approveParticipant rejects when no REQUESTED row exists"() {
        given:
        def callerId = UUID.randomUUID()
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(callerId).status(SessionStatus.SCHEDULED).build()

        when:
        sessionService.approveParticipant(1L, callerId, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.empty()
        thrown(BadRequestException)
        0 * sessionParticipantRepository.save(_)
    }

    def "approveParticipant rejects an INVITED row — only the invitee's own joinSession call resolves it"() {
        given:
        def callerId = UUID.randomUUID()
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(callerId).status(SessionStatus.SCHEDULED).build()
        def participant = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.INVITED).build()

        when:
        sessionService.approveParticipant(1L, callerId, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(participant)
        thrown(BadRequestException)
        0 * sessionParticipantRepository.save(_)
    }

    def "approveParticipant rejects for a cancelled session"() {
        given:
        def callerId = UUID.randomUUID()
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(callerId).status(SessionStatus.CANCELLED).build()

        when:
        sessionService.approveParticipant(1L, callerId, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        thrown(BadRequestException)
        0 * sessionParticipantRepository.findBySessionIdAndUserId(_, _)
    }

    def "rejectParticipant transitions a REQUESTED row to LEFT and persists the optional reason"() {
        given:
        def callerId = UUID.randomUUID()
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(callerId).status(SessionStatus.SCHEDULED).build()
        def participant = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.REQUESTED).build()
        def request = RejectParticipantRequest.builder().reason("Session is full").build()

        when:
        sessionService.rejectParticipant(1L, callerId, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(participant)
        1 * sessionParticipantRepository.save({ SessionParticipant p ->
            p.status == ParticipantStatus.LEFT && p.rejectReason == "Session is full"
        }) >> participant
    }

    def "rejectParticipant writes a session.join_request.rejected outbox row with the reason, recipient is the requester"() {
        given:
        def callerId = UUID.randomUUID()
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(callerId).status(SessionStatus.SCHEDULED).build()
        def participant = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.REQUESTED).build()
        def request = RejectParticipantRequest.builder().reason("Session is full").build()

        when:
        sessionService.rejectParticipant(1L, callerId, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(participant)
        1 * sessionParticipantRepository.save(_) >> participant
        1 * sessionOutboxEventRepository.save({ SessionOutboxEvent e ->
            def payload = objectMapper.readValue(e.payload, SessionJoinRequestRejectedEvent)
            e.eventType == "session.join_request.rejected" &&
                    payload.actorId == callerId && payload.recipientUserId == userId && payload.reason == "Session is full"
        }) >> { SessionOutboxEvent e -> e }
    }

    def "rejectParticipant for a group-linked session requires canManageMembers"() {
        given:
        def callerId = UUID.randomUUID()
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).groupId(5L).createdBy(UUID.randomUUID()).status(SessionStatus.SCHEDULED).build()

        when:
        sessionService.rejectParticipant(1L, callerId, userId, null)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * groupService.canManageMembers(5L, callerId) >> false
        thrown(BadRequestException)
        0 * sessionParticipantRepository.findBySessionIdAndUserId(_, _)
    }

    def "discoverSessions with no sportId filter queries across all the caller's active sports"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)

        when:
        sessionService.discoverSessions(callerId, null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [
                UserSportProfileResponse.builder().sportId(1L).build(),
                UserSportProfileResponse.builder().sportId(2L).build()
        ]
        1 * sessionRepository.findDiscoverSessions(SessionStatus.SCHEDULED, [1L, 2L], callerId, ParticipantStatus.JOINED, pageable) >> new PageImpl([])
    }

    def "discoverSessions with a sportId the caller has an active profile for narrows to that sport"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)

        when:
        sessionService.discoverSessions(callerId, 2L, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [
                UserSportProfileResponse.builder().sportId(1L).build(),
                UserSportProfileResponse.builder().sportId(2L).build()
        ]
        1 * sessionRepository.findDiscoverSessions(SessionStatus.SCHEDULED, [2L], callerId, ParticipantStatus.JOINED, pageable) >> new PageImpl([])
    }

    def "discoverSessions returns an empty page without querying when the sportId isn't one of the caller's active sports"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)

        when:
        def result = sessionService.discoverSessions(callerId, 99L, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        0 * sessionRepository.findDiscoverSessions(*_)
        result.totalElements == 0
    }

    def "discoverSessions returns an empty page without querying when the caller has zero active sport profiles"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)

        when:
        def result = sessionService.discoverSessions(callerId, null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> []
        0 * sessionRepository.findDiscoverSessions(*_)
        result.totalElements == 0
    }

    def "getJoinedSessions delegates to the repository for the given status"() {
        given:
        def userId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)

        when:
        sessionService.getJoinedSessions(userId, SessionStatus.ONGOING, pageable)

        then:
        1 * sessionRepository.findJoinedSessionsByStatus(SessionStatus.ONGOING, userId, ParticipantStatus.JOINED, pageable) >> new PageImpl([])
    }

    def "getJoinedSessions with a null status queries every status in one call"() {
        given:
        def userId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)

        when:
        sessionService.getJoinedSessions(userId, null, pageable)

        then:
        1 * sessionRepository.findJoinedSessions(userId, ParticipantStatus.JOINED, pageable) >> new PageImpl([])
        0 * sessionRepository.findJoinedSessionsByStatus(*_)
    }

    def "createSession sets capacity/feeType/feeAmountVnd from the request"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).scheduledStart(LocalDateTime.now().plusDays(1))
                .capacity(12).feeType(FeeType.FIXED).feeAmountVnd(50000L)
                .build()
        def saved = Session.builder().id(1L).sessionType(SessionType.STANDALONE).createdBy(userId)
                .sportId(1L).locationId(1L).scheduledStart(request.scheduledStart)
                .status(SessionStatus.SCHEDULED).capacity(12).feeType(FeeType.FIXED).feeAmountVnd(50000L).build()

        when:
        def result = sessionService.createSession(userId, request)

        then:
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save({ Session s ->
            s.capacity == 12 && s.feeType == FeeType.FIXED && s.feeAmountVnd == 50000L
        }) >> saved
        interaction { stubBatchEnrichment() }
        result.capacity == 12
        result.feeType == FeeType.FIXED
        result.feeAmountVnd == 50000L
    }

    def "createSession rejects FIXED feeType with no feeAmountVnd"() {
        given:
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).scheduledStart(LocalDateTime.now())
                .capacity(10).feeType(FeeType.FIXED).build()

        when:
        sessionService.createSession(UUID.randomUUID(), request)

        then:
        1 * locationService.getLocation(1L) >> basketballLocation
        thrown(BadRequestException)
        0 * sessionRepository.save(_)
    }

    def "createSession clears feeAmountVnd when feeType isn't FIXED"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).scheduledStart(LocalDateTime.now().plusDays(1))
                .capacity(10).feeType(FeeType.FREE).feeAmountVnd(99999L)
                .build()
        def saved = Session.builder().id(1L).sessionType(SessionType.STANDALONE).createdBy(userId)
                .sportId(1L).locationId(1L).scheduledStart(request.scheduledStart)
                .status(SessionStatus.SCHEDULED).capacity(10).feeType(FeeType.FREE).build()

        when:
        sessionService.createSession(userId, request)

        then:
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save({ Session s -> s.feeType == FeeType.FREE && s.feeAmountVnd == null }) >> saved
        interaction { stubBatchEnrichment() }
    }

    def "createSession sets initialSlot from the request"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).scheduledStart(LocalDateTime.now().plusDays(1))
                .capacity(7).feeType(FeeType.FREE).initialSlot(2)
                .build()
        def saved = Session.builder().id(1L).sessionType(SessionType.STANDALONE).createdBy(userId)
                .sportId(1L).locationId(1L).scheduledStart(request.scheduledStart)
                .status(SessionStatus.SCHEDULED).capacity(7).feeType(FeeType.FREE).initialSlot(2).build()

        when:
        def result = sessionService.createSession(userId, request)

        then:
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save({ Session s -> s.initialSlot == 2 }) >> saved
        interaction { stubBatchEnrichment() }
        result.initialSlot == 2
    }

    def "createSession defaults initialSlot to 0 when omitted from the request"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).scheduledStart(LocalDateTime.now().plusDays(1))
                .capacity(7).feeType(FeeType.FREE).build()
        def saved = Session.builder().id(1L).sessionType(SessionType.STANDALONE).createdBy(userId)
                .sportId(1L).locationId(1L).scheduledStart(request.scheduledStart)
                .status(SessionStatus.SCHEDULED).capacity(7).feeType(FeeType.FREE).build()

        when:
        sessionService.createSession(userId, request)

        then:
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save({ Session s -> s.initialSlot == 0 }) >> saved
        interaction { stubBatchEnrichment() }
    }

    def "createSession folds initialSlot on top of the real JOINED participant count"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).scheduledStart(LocalDateTime.now().plusDays(1))
                .capacity(7).feeType(FeeType.FREE).initialSlot(2)
                .build()
        def saved = Session.builder().id(1L).sessionType(SessionType.STANDALONE).createdBy(userId)
                .sportId(1L).locationId(1L).scheduledStart(request.scheduledStart)
                .status(SessionStatus.SCHEDULED).capacity(7).feeType(FeeType.FREE).initialSlot(2).build()
        def countRow = [getSessionId: { 1L }, getCount: { 1L }] as SessionParticipantRepository.SessionParticipantCount

        when:
        def result = sessionService.createSession(userId, request)

        then:
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save(_) >> saved
        userService.getUsersByIds(_) >> [:]
        sportService.getSportsByIds(_) >> [:]
        locationService.getLocationsByIds(_) >> [1L: basketballLocation]
        sessionParticipantRepository.findBySessionIdInAndUserId(_, _) >> []
        postService.getSessionPostLikeInfo(_, _) >> [:]
        // 1 real JOINED row (the creator, auto-joined) + initialSlot(2) = 3.
        1 * sessionParticipantRepository.countBySessionIdsAndStatus(_, _) >> [countRow]
        result.participantCount == 3L
    }

    def "updateSession applies a partial initialSlot update"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(userId).sportId(1L).locationId(1L)
                .scheduledStart(LocalDateTime.now()).status(SessionStatus.SCHEDULED)
                .capacity(10).feeType(FeeType.FREE).initialSlot(0).build()
        def request = UpdateSessionRequest.builder().initialSlot(5).build()

        when:
        sessionService.updateSession(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionRepository.save({ Session s -> s.initialSlot == 5 }) >> session
        interaction { stubBatchEnrichment() }
    }

    def "updateSession applies a partial capacity update"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(userId).sportId(1L).locationId(1L)
                .scheduledStart(LocalDateTime.now()).status(SessionStatus.SCHEDULED)
                .capacity(10).feeType(FeeType.FREE).build()
        def request = UpdateSessionRequest.builder().capacity(20).build()

        when:
        sessionService.updateSession(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionRepository.save({ Session s -> s.capacity == 20 }) >> session
        interaction { stubBatchEnrichment() }
    }

    def "updateSession rejects switching to FIXED without ever supplying a feeAmountVnd"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(userId).sportId(1L).locationId(1L)
                .scheduledStart(LocalDateTime.now()).status(SessionStatus.SCHEDULED)
                .capacity(10).feeType(FeeType.FREE).build()
        def request = UpdateSessionRequest.builder().feeType(FeeType.FIXED).build()

        when:
        sessionService.updateSession(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        thrown(BadRequestException)
        0 * sessionRepository.save(_)
    }

    def "updateSession clears a stale feeAmountVnd when switching away from FIXED"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(userId).sportId(1L).locationId(1L)
                .scheduledStart(LocalDateTime.now()).status(SessionStatus.SCHEDULED)
                .capacity(10).feeType(FeeType.FIXED).feeAmountVnd(30000L).build()
        def request = UpdateSessionRequest.builder().feeType(FeeType.SPLIT).build()

        when:
        sessionService.updateSession(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionRepository.save({ Session s -> s.feeType == FeeType.SPLIT && s.feeAmountVnd == null }) >> session
        interaction { stubBatchEnrichment() }
    }

    // ── createSession — companion SESSION_POST (SESSION-10/A17) ────────────────

    def "createSession creates the companion SESSION_POST before saving, and uses the returned id as postId"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).title("Sunday badminton")
                .scheduledStart(LocalDateTime.now().plusDays(1)).build()

        when:
        sessionService.createSession(userId, request)

        then:
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * postService.createSessionPost(userId, "Session: Sunday badminton") >> 42L
        1 * sessionRepository.save({ Session s -> s.postId == 42L }) >> Session.builder().id(1L).postId(42L).build()
        interaction { stubBatchEnrichment() }
    }

    def "createSession creates the companion SESSION_POST for a group-linked session too"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .groupId(5L).locationId(1L).scheduledStart(LocalDateTime.now().plusDays(1)).build()
        def group = GroupResponse.builder().id(5L).sportId(1L).build()

        when:
        sessionService.createSession(userId, request)

        then:
        1 * groupService.canManageMembers(5L, userId) >> true
        1 * groupService.getGroup(5L, userId) >> group
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * postService.createSessionPost(userId, _) >> 43L
        1 * sessionRepository.save({ Session s -> s.postId == 43L && s.groupId == 5L }) >> Session.builder().id(2L).postId(43L).groupId(5L).build()
        interaction { stubBatchEnrichment() }
    }

    // ── session comment proxy (SESSION-10/A17) ──────────────────────────────
    // Gates via SessionGate (a real ResourceGate<Session>, its own SessionGateSpec covers the
    // branch logic — see documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md §7's supersession note),
    // then delegates to CommentService's bypass methods. sessionGate is mocked here — these tests
    // only assert the gate is consulted and its result drives the outcome.

    def "createSessionComment gates via SessionGate then delegates to CommentService.createSessionComment"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateCommentRequest.builder().content("see you there").build()
        def session = Session.builder().id(1L).postId(999L).build()
        def response = CommentResponse.builder().id(5L).postId(999L).content(request.content).build()

        when:
        def result = sessionService.createSessionComment(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionGate.require(session, userId, _, _) >> session
        1 * commentService.createSessionComment(999L, userId, request) >> response
        result == response
    }

    def "createSessionComment writes a session.comment.created outbox row with the new comment's id"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateCommentRequest.builder().content("see you there").build()
        def session = Session.builder().id(1L).postId(999L).build()
        def response = CommentResponse.builder().id(5L).postId(999L).content(request.content).build()

        when:
        sessionService.createSessionComment(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionGate.require(session, userId, _, _) >> session
        1 * commentService.createSessionComment(999L, userId, request) >> response
        1 * sessionOutboxEventRepository.save({ SessionOutboxEvent e ->
            def payload = objectMapper.readValue(e.payload, SessionCommentCreatedEvent)
            e.eventType == "session.comment.created" && payload.sessionId == 1L &&
                    payload.actorId == userId && payload.commentId == 5L
        }) >> { SessionOutboxEvent e -> e }
    }

    def "createSessionComment propagates SessionGate's rejection without calling CommentService"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateCommentRequest.builder().content("x").build()
        def session = Session.builder().id(1L).postId(999L).build()

        when:
        sessionService.createSessionComment(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionGate.require(session, userId, _, _) >> { throw new ForbiddenException("You don't have access to this session's comments") }
        0 * commentService._
        thrown(ForbiddenException)
    }

    def "createSessionComment rejects a nonexistent session before ever consulting SessionGate's isVisibleTo"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateCommentRequest.builder().content("x").build()

        when:
        sessionService.createSessionComment(999L, userId, request)

        then:
        1 * sessionRepository.findById(999L) >> Optional.empty()
        1 * sessionGate.require(null, userId, _, _) >> { throw new NotFoundException("Session not found") }
        0 * commentService._
        thrown(NotFoundException)
    }

    def "getSessionComments gates via SessionGate then delegates to CommentService.getSessionPostComments"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 20)
        def session = Session.builder().id(1L).postId(999L).build()
        def page = new PageImpl<>([CommentResponse.builder().id(5L).postId(999L).build()])

        when:
        def result = sessionService.getSessionComments(1L, callerId, pageable)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionGate.require(session, callerId, _, _) >> session
        1 * commentService.getSessionPostComments(999L, callerId, pageable) >> page
        result == page
    }

    def "likeSessionComment gates via SessionGate then delegates to CommentService.likeSessionComment"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).postId(999L).build()

        when:
        sessionService.likeSessionComment(1L, 5L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionGate.require(session, userId, _, _) >> session
        1 * commentService.likeSessionComment(999L, 5L, userId)
    }

    def "unlikeSessionComment gates via SessionGate then delegates to CommentService.unlikeSessionComment"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).postId(999L).build()

        when:
        sessionService.unlikeSessionComment(1L, 5L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionGate.require(session, userId, _, _) >> session
        1 * commentService.unlikeSessionComment(999L, 5L, userId)
    }

    // ── likeSession / unlikeSession (SESSION-10/A17) ────────────────────────────

    def "likeSession gates via SessionGate then delegates to PostService.likeSessionPost"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).postId(999L).build()

        when:
        sessionService.likeSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionGate.require(session, userId, _, _) >> session
        1 * postService.likeSessionPost(999L, userId)
    }

    def "likeSession propagates SessionGate's rejection without calling PostService"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).postId(999L).build()

        when:
        sessionService.likeSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionGate.require(session, userId, _, _) >> { throw new ForbiddenException("You don't have access to this session") }
        0 * postService.likeSessionPost(_, _)
        thrown(ForbiddenException)
    }

    def "unlikeSession gates via SessionGate then delegates to PostService.unlikeSessionPost"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).postId(999L).build()

        when:
        sessionService.unlikeSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionGate.require(session, userId, _, _) >> session
        1 * postService.unlikeSessionPost(999L, userId)
    }

    // ── SessionResponse.likeCount / isLikedByCurrentUser (batch, via mapToResponses) ─

    def "getSession resolves likeCount/isLikedByCurrentUser from PostService.getSessionPostLikeInfo, keyed by the session's postId"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).postId(999L).sportId(1L).locationId(1L)
                .scheduledStart(LocalDateTime.now()).status(SessionStatus.SCHEDULED)
                .capacity(10).feeType(FeeType.FREE).initialSlot(0).build()

        when:
        def result = sessionService.getSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        userService.getUsersByIds(_) >> [:]
        sportService.getSportsByIds(_) >> [:]
        locationService.getLocationsByIds(_) >> [1L: basketballLocation]
        sessionParticipantRepository.countBySessionIdsAndStatus(_, _) >> []
        sessionParticipantRepository.findBySessionIdInAndUserId(_, _) >> []
        1 * postService.getSessionPostLikeInfo([999L], userId) >>
                [999L: com.sportconnect.social.post.api.dto.PostLikeInfoResponse.builder()
                        .likeCount(5L).isLikedByCurrentUser(true).build()]
        result.likeCount == 5L
        result.isLikedByCurrentUser == true
    }

    def "getSession defaults likeCount/isLikedByCurrentUser to 0/false when the post isn't in the batch result"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).postId(999L).sportId(1L).locationId(1L)
                .scheduledStart(LocalDateTime.now()).status(SessionStatus.SCHEDULED)
                .capacity(10).feeType(FeeType.FREE).initialSlot(0).build()

        when:
        def result = sessionService.getSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        interaction { stubBatchEnrichment() }
        result.likeCount == 0L
        result.isLikedByCurrentUser == false
    }
}
