package com.sportconnect.session.service

import com.sportconnect.common.attributes.AttributeGroup
import com.sportconnect.common.attributes.AttributeSchema
import com.sportconnect.common.attributes.node.StringAttribute
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.ForbiddenException
import com.sportconnect.common.exception.NotFoundException
import com.sportconnect.common.exception.ResourceNotFoundException
import com.sportconnect.group.api.dto.GroupRecurrenceConfigResponse
import com.sportconnect.group.api.dto.GroupResponse
import com.sportconnect.group.api.service.GroupService
import com.sportconnect.location.api.dto.LocationResponse
import com.sportconnect.location.api.service.LocationService
import com.sportconnect.session.access.SessionDetailGate
import com.sportconnect.session.access.SessionGate
import com.sportconnect.session.api.dto.CancelSessionRequest
import com.sportconnect.session.api.dto.CreateSessionRequest
import com.sportconnect.session.api.dto.FeeType
import com.sportconnect.session.api.dto.ParticipantStatus
import com.sportconnect.session.api.dto.RejectParticipantRequest
import com.sportconnect.session.api.dto.SessionStatus
import com.sportconnect.session.api.dto.SessionType
import com.sportconnect.session.api.dto.StartTimeFilter
import com.sportconnect.session.api.dto.UpdateSessionRequest
import com.sportconnect.session.api.event.SessionCommentCreatedEvent
import com.sportconnect.session.api.event.SessionInvitationCreatedEvent
import com.sportconnect.session.api.event.SessionJoinRequestApprovedEvent
import com.sportconnect.session.api.event.SessionJoinRequestCreatedEvent
import com.sportconnect.session.api.event.SessionJoinRequestRejectedEvent
import com.sportconnect.session.api.event.SessionParticipantJoinedEvent
import com.sportconnect.session.api.event.SessionParticipantLeftEvent
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
import com.sportconnect.sport.api.dto.SportResponse
import com.sportconnect.sport.api.dto.UserSportProfileResponse
import com.sportconnect.sport.api.service.SportService
import com.sportconnect.sport.api.service.UserSportProfileService
import com.sportconnect.user.api.dto.UserResponse
import com.sportconnect.user.api.service.UserService
import com.fasterxml.jackson.databind.ObjectMapper
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import org.springframework.data.domain.Pageable
import org.springframework.data.domain.Sort
import spock.lang.Specification
import spock.lang.Subject

import java.time.LocalDate
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneId

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
    SessionDetailGate sessionDetailGate = Mock()
    SessionOutboxEventRepository sessionOutboxEventRepository = Mock()
    SessionOutboxWriter sessionOutboxWriter = Mock()
    SessionGenerationService sessionGenerationService = Mock()
    // SESSION-23: real filter + mapper â€” the filter is pure logic with its own spec, and the
    // size check needs a real serializer. Existing create/update tests pass no attributes, so
    // sportService.getSessionAttributeSchemaRaw is never hit; the attributes-path tests stub it.
    ObjectMapper objectMapper = new ObjectMapper()

    @Subject
    SessionServiceImpl sessionService = new SessionServiceImpl(
            sessionRepository, sessionParticipantRepository, groupService, locationService, userService,
            sportService, userSportProfileService, postService, commentService, sessionGate, sessionDetailGate,
            sessionOutboxEventRepository, sessionOutboxWriter, sessionGenerationService, objectMapper)

    def basketballLocation = LocationResponse.builder().id(1L).sportId(1L).name("Court").build()
    def tennisLocation = LocationResponse.builder().id(2L).sportId(2L).name("Tennis Court").build()

    def setup() {
        // SESSION-10/A17: every createSession call creates a companion SESSION_POST first â€” a
        // lenient default so tests that aren't specifically about this behavior don't each need
        // to stub it themselves, same convention as stubBatchEnrichment().
        postService.createSessionPost(_, _) >> 999L
        // SESSION-21: joinSession/leaveSession/approveParticipant now resolve the participant's
        // display name for the system comment's content. Same lenient-default rationale â€” the
        // tests that actually care about the name stub it themselves in their then-block.
        userService.getUsersByIds(_) >> [:]
        // A7: createSession now resolves a caller-supplied sportId to check it is still active.
        // Lenient default for the same reason as above â€” 40+ createSession tests pass a sportId
        // without caring about sport status; the one test that does care overrides this.
        sportService.requireActiveSportById(_) >> SportResponse.builder().id(1L).name("Basketball").isActive(true).build()
    }

    private void stubBatchEnrichment() {
        userService.getUsersByIds(_) >> [:]
        sportService.getActiveSportsByIds(_) >> [:]
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
                .scheduledStart(Instant.now().plusSeconds(86400))
                .build()
        def saved = Session.builder().id(1L).sessionType(SessionType.STANDALONE).createdBy(userId)
                .sportId(1L).locationId(1L).locationNote("Court 3").scheduledStart(request.scheduledStart)
                .status(SessionStatus.SCHEDULED).build()

        when:
        def result = sessionService.createSession(userId, request)

        then:
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save({ Session s ->
            s.sessionType == SessionType.STANDALONE && s.groupId == null && s.locationNote == "Court 3" &&
                    s.isPublic == true
        }) >> saved
        0 * groupService._
        interaction { stubBatchEnrichment() }
        result.sessionType == SessionType.STANDALONE
        result.locationNote == "Court 3"
    }

    def "createSession rejects a standalone session without a sportId"() {
        given:
        def request = CreateSessionRequest.builder().locationId(1L).scheduledStart(Instant.now()).build()

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
                .groupId(5L).locationId(1L).scheduledStart(Instant.now()).build()

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
                .groupId(5L).locationId(1L).scheduledStart(Instant.now().plusSeconds(86400)).build()
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
                .sportId(1L).locationId(1L).scheduledStart(Instant.now().plusSeconds(86400)).build()
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
                .groupId(5L).locationId(1L).scheduledStart(Instant.now().plusSeconds(86400)).build()
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
        1 * sessionRepository.save({ Session s -> s.isPublic == false }) >> saved
        0 * sessionParticipantRepository.saveAll(_)
        interaction { stubBatchEnrichment() }
    }

    def "createSession pre-creates INVITED rows for inviteeIds, deduped and excluding the creator's own id"() {
        given:
        def userId = UUID.randomUUID()
        def inviteeA = UUID.randomUUID()
        def inviteeB = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).scheduledStart(Instant.now().plusSeconds(86400))
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
                .sportId(1L).locationId(1L).scheduledStart(Instant.now().plusSeconds(86400))
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
        2 * sessionOutboxWriter.build("session.invitation.created", { SessionInvitationCreatedEvent e ->
            [inviteeA, inviteeB].contains(e.recipientUserId)
        }) >> new SessionOutboxEvent()
        1 * sessionOutboxEventRepository.saveAll({ List<SessionOutboxEvent> events -> events.size() == 2 })
    }

    def "createSession rejects a caller-supplied sportId naming a deactivated sport"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).scheduledStart(Instant.now().plusSeconds(86400)).build()

        when:
        sessionService.createSession(userId, request)

        then: "a deactivated sport is indistinguishable from a missing one (A7)"
        1 * sportService.requireActiveSportById(1L) >> { throw new ResourceNotFoundException("Sport", "id", 1L) }
        0 * locationService.getLocation(_)

        and: "nothing is persisted"
        0 * sessionRepository.save(_)

        and:
        thrown(ResourceNotFoundException)
    }

    def "createSession accepts a group-inherited sportId without re-checking sport status"() {
        given: "a group session with no sportId on the request, so it inherits the group's"
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .groupId(5L).locationId(1L).scheduledStart(Instant.now().plusSeconds(86400)).build()
        def group = GroupResponse.builder().id(5L).sportId(1L).build()
        def saved = Session.builder().id(3L).groupId(5L).sessionType(SessionType.GROUP_RECURRING)
                .createdBy(userId).sportId(1L).locationId(1L).scheduledStart(request.scheduledStart)
                .status(SessionStatus.SCHEDULED).build()

        when:
        sessionService.createSession(userId, request)

        then: "no sport-status lookup happens â€” createGroup already guarantees it (A7)"
        0 * sportService.requireActiveSportById(_)

        and:
        1 * groupService.canManageMembers(5L, userId) >> true
        1 * groupService.getGroup(5L, userId) >> group
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save(_ as Session) >> saved
        interaction { stubBatchEnrichment() }
    }

    def "createSession rejects a locationId whose sport doesn't match"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(2L).scheduledStart(Instant.now()).build()

        when:
        sessionService.createSession(userId, request)

        then:
        1 * locationService.getLocation(2L) >> tennisLocation
        thrown(BadRequestException)
        0 * sessionRepository.save(_)
    }

    // --- SESSION-23: session attributes ---

    /** One live STRING attribute at path {@code match/note}. */
    private static AttributeSchema sessionSchema() {
        AttributeSchema.builder().groups([
                AttributeGroup.builder().key("match").label(["en": "Match"]).isAvailable(true)
                        .attributes([
                                StringAttribute.builder().key("note").label(["en": "Note"])
                                        .isAvailable(true).build()
                        ]).build()
        ]).build()
    }

    def "createSession filters submitted attributes against the sport session schema and persists the survivors"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).scheduledStart(Instant.now().plusSeconds(86400))
                .attributes(["match/note": "bring water", "match/unknown": "x"])
                .build()
        def saved = Session.builder().id(1L).sessionType(SessionType.STANDALONE).createdBy(userId)
                .sportId(1L).locationId(1L).scheduledStart(request.scheduledStart)
                .status(SessionStatus.SCHEDULED).attributes(["match/note": "bring water"]).build()

        when:
        def result = sessionService.createSession(userId, request)

        then:
        1 * sportService.getSessionAttributeSchemaRaw(1L) >> sessionSchema()
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save({ Session s -> s.attributes == ["match/note": "bring water"] }) >> saved
        interaction { stubBatchEnrichment() }
        result.attributes == ["match/note": "bring water"]
    }

    def "createSession without attributes never fetches the session schema and leaves attributes null"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).scheduledStart(Instant.now().plusSeconds(86400)).build()
        def saved = Session.builder().id(1L).sessionType(SessionType.STANDALONE).createdBy(userId)
                .sportId(1L).locationId(1L).scheduledStart(request.scheduledStart).status(SessionStatus.SCHEDULED).build()

        when:
        sessionService.createSession(userId, request)

        then:
        0 * sportService.getSessionAttributeSchemaRaw(_)
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save({ Session s -> s.attributes == null }) >> saved
        interaction { stubBatchEnrichment() }
    }

    def "createSession rejects attributes whose filtered form exceeds the 4KB cap"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).scheduledStart(Instant.now().plusSeconds(86400))
                .attributes(["match/note": "x" * 5000])
                .build()

        when:
        sessionService.createSession(userId, request)

        then:
        1 * sportService.getSessionAttributeSchemaRaw(1L) >> sessionSchema()
        1 * locationService.getLocation(1L) >> basketballLocation
        thrown(BadRequestException)
        0 * sessionRepository.save(_)
    }

    def "updateSession replaces the stored attributes map wholesale, not merged"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(userId).sportId(1L).locationId(1L)
                .scheduledStart(Instant.now()).status(SessionStatus.SCHEDULED)
                .attributes(["match/note": "old", "match/gone": "y"]).build()
        def request = UpdateSessionRequest.builder().attributes(["match/note": "new"]).build()

        when:
        sessionService.updateSession(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sportService.getSessionAttributeSchemaRaw(1L) >> sessionSchema()
        1 * sessionRepository.save({ Session s -> s.attributes == ["match/note": "new"] }) >> session
        interaction { stubBatchEnrichment() }
    }

    def "updateSession with null attributes leaves the stored map untouched and never fetches the schema"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(userId).sportId(1L).locationId(1L)
                .scheduledStart(Instant.now()).status(SessionStatus.SCHEDULED)
                .attributes(["match/note": "keep"]).build()
        def request = UpdateSessionRequest.builder().title("New title").build()

        when:
        sessionService.updateSession(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        0 * sportService.getSessionAttributeSchemaRaw(_)
        1 * sessionRepository.save({ Session s -> s.attributes == ["match/note": "keep"] }) >> session
        interaction { stubBatchEnrichment() }
    }

    def "updateSession with an explicit empty attributes map clears them"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(userId).sportId(1L).locationId(1L)
                .scheduledStart(Instant.now()).status(SessionStatus.SCHEDULED)
                .attributes(["match/note": "old"]).build()
        def request = UpdateSessionRequest.builder().attributes([:]).build()

        when:
        sessionService.updateSession(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sportService.getSessionAttributeSchemaRaw(1L) >> sessionSchema()
        1 * sessionRepository.save({ Session s -> s.attributes == [:] }) >> session
        interaction { stubBatchEnrichment() }
    }

    /** SESSION-40 (scope addition): member-only regardless of the group's own public/private
     * flag — widened from the previous GroupService.getGroup delegation, which only gated a
     * private group. */
    def "getGroupSessions requires group membership, regardless of the group's public/private flag"() {
        given:
        def userId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)

        when:
        sessionService.getGroupSessions(5L, userId, pageable)

        then:
        1 * groupService.isGroupMember(5L, userId) >> true
        1 * sessionRepository.findByGroupId(5L, pageable) >> new PageImpl([])
    }

    def "getGroupSessions rejects a non-member without querying sessions"() {
        given:
        def userId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)

        when:
        sessionService.getGroupSessions(5L, userId, pageable)

        then:
        1 * groupService.isGroupMember(5L, userId) >> false
        thrown(BadRequestException)
        0 * sessionRepository.findByGroupId(*_)
    }

    def "updateSession allows the creator of a standalone session"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(userId).sportId(1L).locationId(1L)
                .scheduledStart(Instant.now()).status(SessionStatus.SCHEDULED).build()
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

    /** SESSION-40: getSession is now gated via SessionDetailGate.require — a null resource
     * (session not found) throws NotFoundException from that default method, not this service's
     * own previous ResourceNotFoundException. */
    def "getSession throws NotFoundException when missing"() {
        given:
        def callerId = UUID.randomUUID()

        when:
        sessionService.getSession(99L, callerId)

        then:
        1 * sessionRepository.findById(99L) >> Optional.empty()
        1 * sessionDetailGate.require(null, callerId, _, _) >> { throw new NotFoundException("Session not found") }
        thrown(NotFoundException)
    }

    def "getSession throws ForbiddenException when the gate denies visibility"() {
        given:
        def callerId = UUID.randomUUID()
        def session = Session.builder().id(1L).sportId(1L).locationId(1L).groupId(5L).isPublic(false).build()

        when:
        sessionService.getSession(1L, callerId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionDetailGate.require(session, callerId, _, _) >> { throw new ForbiddenException("You don't have access to this session") }
        thrown(ForbiddenException)
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
        1 * sessionDetailGate.require(session, callerId, _, _) >> session
        1 * sessionParticipantRepository.findBySessionIdInAndUserId([1L], callerId) >> [ownRow]
        response.callerParticipation.status == ParticipantStatus.REQUESTED
        response.callerParticipation.id == 9L
        // Caller's own identity is already known client-side â€” not re-enriched here.
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
        1 * sessionDetailGate.require(session, callerId, _, _) >> session
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
        1 * sessionOutboxWriter.record("session.join_request.created", { SessionJoinRequestCreatedEvent e ->
            e.actorId == userId && e.recipientUserId == organizerId
        })
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
        1 * sessionOutboxWriter.record("session.participant.joined", { SessionParticipantJoinedEvent e ->
            e.actorId == userId
        })
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
        1 * sessionOutboxWriter.record("session.participant.joined", _ as SessionParticipantJoinedEvent)
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
        0 * sessionOutboxWriter.record(_, _)
    }

    def "joinSession is a no-op when the caller is already JOINED, autoApprove false"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).autoApprove(false).build()
        def existing = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.JOINED).build()

        when:
        sessionService.joinSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(existing)
        0 * sessionParticipantRepository.save(_)
        0 * sessionOutboxWriter.record(_, _)
    }

    def "joinSession is a no-op when the caller is already JOINED, autoApprove true"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).autoApprove(true).build()
        def existing = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(ParticipantStatus.JOINED).build()

        when:
        sessionService.joinSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(existing)
        0 * sessionParticipantRepository.save(_)
        0 * sessionOutboxWriter.record(_, _)
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

    def "leaveSession flips a JOINED row to LEFT and writes a session.participant.left outbox row"() {
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
        // SESSION-19: the only one of leaveSession's three source states that notifies anyone.
        1 * sessionOutboxWriter.record("session.participant.left", { SessionParticipantLeftEvent e ->
            e.sessionId == 1L && e.actorId == userId
        })
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
        // SESSION-19: declining an invite notifies nobody â€” no one was counting on this person.
        0 * sessionOutboxWriter.record(_, _)
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
        // SESSION-19: cancelling one's own pending request notifies nobody, same reasoning.
        0 * sessionOutboxWriter.record(_, _)
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
        1 * sessionOutboxWriter.record("session.join_request.approved", { SessionJoinRequestApprovedEvent e ->
            e.actorId == callerId && e.recipientUserId == userId
        })
        1 * sessionOutboxWriter.record("session.participant.joined", { SessionParticipantJoinedEvent e ->
            e.actorId == userId
        })
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

    def "approveParticipant rejects an INVITED row â€” only the invitee's own joinSession call resolves it"() {
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
        1 * sessionOutboxWriter.record("session.join_request.rejected", { SessionJoinRequestRejectedEvent e ->
            e.actorId == callerId && e.recipientUserId == userId && e.reason == "Session is full"
        })
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

    // SESSION-25 â€” discoverSessions' full param list, in the order SessionRepository.findDiscoverSessions
    // declares them: statuses, sportIds, callerId, joinedStatus, lowerBound, title, locationId, feeType,
    // maxFeeAmountVnd, dayStart, dayEnd, startTimeBeforeOrEqual, startTimeAfterOrEqual, zoneOffsetSeconds,
    // minOpenSlots, pageable. Every test here stubs an empty PageImpl (mapToResponses short-circuits on
    // an empty list, so no batch-enrichment stub is needed) and asserts only on the query construction,
    // matching the pre-existing tests' own style.

    def "discoverSessions with no sportId filter queries across all the caller's active sports, defaulting statuses"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)
        def date = LocalDate.now().plusDays(1)

        when:
        sessionService.discoverSessions(callerId, null, null, null, null, null, null, date, null, null, null, null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [
                UserSportProfileResponse.builder().sportId(1L).build(),
                UserSportProfileResponse.builder().sportId(2L).build()
        ]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED], [1L, 2L], callerId,
                ParticipantStatus.JOINED, [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, null, false, [-1L], null, null,
                date.atStartOfDay(ZoneId.of("UTC")).toInstant(),
                date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                null, null, null, null, pageable) >> new PageImpl([])
    }

    def "discoverSessions with a sportId the caller has an active profile for narrows to that sport"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)
        def date = LocalDate.now().plusDays(1)

        when:
        sessionService.discoverSessions(callerId, 2L, null, null, null, null, null, date, null, null, null, null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [
                UserSportProfileResponse.builder().sportId(1L).build(),
                UserSportProfileResponse.builder().sportId(2L).build()
        ]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED], [2L], callerId,
                ParticipantStatus.JOINED, [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, null, false, [-1L], null, null,
                date.atStartOfDay(ZoneId.of("UTC")).toInstant(),
                date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                null, null, null, null, pageable) >> new PageImpl([])
    }

    def "discoverSessions returns an empty page without querying when the sportId isn't one of the caller's active sports"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)

        when:
        def result = sessionService.discoverSessions(callerId, 99L, null, null, null, null, null, null, null, null, null, null, pageable)

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
        def result = sessionService.discoverSessions(callerId, null, null, null, null, null, null, null, null, null, null, null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> []
        0 * sessionRepository.findDiscoverSessions(*_)
        result.totalElements == 0
    }

    def "discoverSessions passes an explicit status list through unchanged when it contains no ONGOING"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)
        def date = LocalDate.now().plusDays(1)

        when:
        sessionService.discoverSessions(callerId, 1L, null, null, null, null, null, date, null, null, null,
                [SessionStatus.SCHEDULED], pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.SCHEDULED], [1L], callerId, ParticipantStatus.JOINED,
                [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, null, false, [-1L], null, null,
                date.atStartOfDay(ZoneId.of("UTC")).toInstant(),
                date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                null, null, null, null, pageable) >> new PageImpl([])
    }

    /** SESSION-37 â€” ONGOING is never a 400 (unlike a genuinely invalid value), but it's stripped
     * out of an explicit list before querying, whether or not other values survive alongside it. */
    def "discoverSessions strips ONGOING out of an explicit status list that has other values surviving"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)
        def date = LocalDate.now().plusDays(1)

        when:
        sessionService.discoverSessions(callerId, 1L, null, null, null, null, null, date, null, null, null,
                [SessionStatus.SCHEDULED, SessionStatus.ONGOING], pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.SCHEDULED], [1L], callerId, ParticipantStatus.JOINED,
                [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, null, false, [-1L], null, null,
                date.atStartOfDay(ZoneId.of("UTC")).toInstant(),
                date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                null, null, null, null, pageable) >> new PageImpl([])
    }

    /** SESSION-37 â€” stripping ONGOING out of a status list containing only ONGOING falls back to
     * the default list, the same as an omitted/empty status param â€” never an empty result. */
    def "discoverSessions falls back to the default status list when stripping ONGOING empties an explicit list"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)
        def date = LocalDate.now().plusDays(1)

        when:
        sessionService.discoverSessions(callerId, 1L, null, null, null, null, null, date, null, null, null,
                [SessionStatus.ONGOING], pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED], [1L], callerId, ParticipantStatus.JOINED,
                [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, null, false, [-1L], null, null,
                date.atStartOfDay(ZoneId.of("UTC")).toInstant(),
                date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                null, null, null, null, pageable) >> new PageImpl([])
    }

    def "discoverSessions forwards title/locationId/minOpenSlots/feeType/maxFeeAmountVnd filters"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)
        def date = LocalDate.now().plusDays(1)

        when:
        sessionService.discoverSessions(callerId, 1L, "Sunday", [5L], 2, FeeType.FIXED, 100000L,
                date, null, null, null, null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED], [1L], callerId,
                ParticipantStatus.JOINED, [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, "Sunday", true, [5L], FeeType.FIXED, 100000L,
                date.atStartOfDay(ZoneId.of("UTC")).toInstant(),
                date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                null, null, null, 2, pageable) >> new PageImpl([])
    }

    /** 2026-09-22 â€” locationId widened from single-value to multi-value, OR-combined, matching
     * getSessionDiscoverDateCounts' own shape (which shipped it first). */
    def "discoverSessions passes hasLocationIds=false and a sentinel when locationId is omitted"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)
        def date = LocalDate.now().plusDays(1)

        when:
        sessionService.discoverSessions(callerId, 1L, null, null, null, null, null, date, null, null, null, null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED], [1L], callerId,
                ParticipantStatus.JOINED, [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, null, false, [-1L], null, null,
                date.atStartOfDay(ZoneId.of("UTC")).toInstant(),
                date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                null, null, null, null, pageable) >> new PageImpl([])
    }

    def "discoverSessions passes hasLocationIds=true and multiple values when several are given"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)
        def date = LocalDate.now().plusDays(1)

        when:
        sessionService.discoverSessions(callerId, 1L, null, [5L, 6L], null, null, null, date, null, null, null, null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED], [1L], callerId,
                ParticipantStatus.JOINED, [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, null, true, [5L, 6L], null, null,
                date.atStartOfDay(ZoneId.of("UTC")).toInstant(),
                date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                null, null, null, null, pageable) >> new PageImpl([])
    }

    def "discoverSessions given a date but no viewerZoneId computes a UTC dayStart/dayEnd range"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)
        def date = LocalDate.now().plusDays(3)

        when:
        sessionService.discoverSessions(callerId, 1L, null, null, null, null, null, date, null, null, null, null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED], [1L], callerId,
                ParticipantStatus.JOINED, [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, null, false, [-1L], null, null,
                date.atStartOfDay(ZoneId.of("UTC")).toInstant(),
                date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                null, null, null, null, pageable) >> new PageImpl([])
    }

    def "discoverSessions given a date and viewerZoneId computes the dayStart/dayEnd range in that zone, not UTC"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)
        def date = LocalDate.now().plusDays(3)
        def zone = ZoneId.of("America/New_York")

        when:
        sessionService.discoverSessions(callerId, 1L, null, null, null, null, null, date, null, null,
                "America/New_York", null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED], [1L], callerId,
                ParticipantStatus.JOINED, [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, null, false, [-1L], null, null,
                date.atStartOfDay(zone).toInstant(),
                date.plusDays(1).atStartOfDay(zone).toInstant(),
                null, null, null, null, pageable) >> new PageImpl([])
    }

    def "discoverSessions rejects an invalid viewerZoneId"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)

        when:
        sessionService.discoverSessions(callerId, 1L, null, null, null, null, null,
                LocalDate.now(), null, null, "Not/AZone", null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        thrown(BadRequestException)
        0 * sessionRepository.findDiscoverSessions(*_)
    }

    def "discoverSessions maps startTimeFilter AFTER_OR_EQUAL to the startTimeAfterOrEqual param and passes a non-null zoneOffsetSeconds"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)
        def time = LocalTime.of(18, 0)
        def date = LocalDate.now().plusDays(1)

        when:
        sessionService.discoverSessions(callerId, 1L, null, null, null, null, null, date,
                StartTimeFilter.AFTER_OR_EQUAL, time, null, null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED], [1L], callerId,
                ParticipantStatus.JOINED, [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, null, false, [-1L], null, null,
                date.atStartOfDay(ZoneId.of("UTC")).toInstant(),
                date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                null, time.toSecondOfDay(), { it != null }, null, pageable) >> new PageImpl([])
    }

    def "discoverSessions maps startTimeFilter BEFORE_OR_EQUAL to the startTimeBeforeOrEqual param"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)
        def time = LocalTime.of(9, 0)
        def date = LocalDate.now().plusDays(1)

        when:
        sessionService.discoverSessions(callerId, 1L, null, null, null, null, null, date,
                StartTimeFilter.BEFORE_OR_EQUAL, time, null, null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED], [1L], callerId,
                ParticipantStatus.JOINED, [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, null, false, [-1L], null, null,
                date.atStartOfDay(ZoneId.of("UTC")).toInstant(),
                date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                time.toSecondOfDay(), null, { it != null }, null, pageable) >> new PageImpl([])
    }

    /** Pre-existing flake found while verifying SESSION-38 (unrelated to that ticket's own
     * changes): {@code date} must be "future" relative to {@code zone}'s own "today", not the
     * JVM's â€” computing it from {@code LocalDate.now()} (the JVM's default zone, Asia/Bangkok on
     * this deployment) intermittently landed on the *same* calendar day as Tokyo's "today"
     * whenever the JVM zone's wall-clock time was late enough that Tokyo (2 hours ahead) had
     * already rolled to the next date, tripping SESSION-37's date==today clamp and breaking this
     * test's hardcoded dayStart expectation. Deriving {@code date} from {@code zone} itself makes
     * this deterministic regardless of the JVM's own zone. */
    def "discoverSessions with a startTimeFilter passes the viewerZoneId's current offset, not the JVM's"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)
        def time = LocalTime.of(9, 0)
        def zone = ZoneId.of("Asia/Tokyo")
        def date = LocalDate.now(zone).plusDays(1)
        def expectedOffsetSeconds = zone.getRules().getOffset(Instant.now()).getTotalSeconds()

        when:
        sessionService.discoverSessions(callerId, 1L, null, null, null, null, null, date,
                StartTimeFilter.BEFORE_OR_EQUAL, time, "Asia/Tokyo", null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED], [1L], callerId,
                ParticipantStatus.JOINED, [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, null, false, [-1L], null, null,
                date.atStartOfDay(zone).toInstant(),
                date.plusDays(1).atStartOfDay(zone).toInstant(),
                time.toSecondOfDay(), null, expectedOffsetSeconds, null, pageable) >> new PageImpl([])
    }

    def "discoverSessions strips the caller-supplied Pageable sort before querying"() {
        given:
        def callerId = UUID.randomUUID()
        def sortedPageable = PageRequest.of(1, 5, Sort.by("title").ascending())
        def date = LocalDate.now().plusDays(1)

        when:
        sessionService.discoverSessions(callerId, 1L, null, null, null, null, null, date, null, null, null, null, sortedPageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED], [1L], callerId,
                ParticipantStatus.JOINED, [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, null, false, [-1L], null, null,
                date.atStartOfDay(ZoneId.of("UTC")).toInstant(),
                date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                null, null, null, null,
                PageRequest.of(1, 5)) >> new PageImpl([])
    }

    // â”€â”€ SESSION-37: date's clamp/floor behavior â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // dayStart can no longer be asserted as an exact precomputed instant for "today"/past cases
    // (it's derived from Instant.now() at call time) â€” these use a loose bound instead, same
    // style as the existing zoneOffsetSeconds "{ it != null }" matchers above.

    def "discoverSessions with date == today floors dayStart at now() instead of today's own start-of-day"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)
        def date = LocalDate.now(ZoneId.of("UTC"))
        def beforeCall = Instant.now()

        when:
        sessionService.discoverSessions(callerId, 1L, null, null, null, null, null, date, null, null, null, null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED], [1L], callerId,
                ParticipantStatus.JOINED, [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, null, false, [-1L], null, null,
                { Instant dayStart -> !dayStart.isBefore(beforeCall) && dayStart.isBefore(date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant()) },
                date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                null, null, null, null, pageable) >> new PageImpl([])
    }

    def "discoverSessions with a past date silently clamps to today's semantics, not a 400"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)
        def today = LocalDate.now(ZoneId.of("UTC"))
        def pastDate = today.minusDays(10)
        def beforeCall = Instant.now()

        when:
        sessionService.discoverSessions(callerId, 1L, null, null, null, null, null, pastDate, null, null, null, null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED], [1L], callerId,
                ParticipantStatus.JOINED, [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, null, false, [-1L], null, null,
                { Instant dayStart -> !dayStart.isBefore(beforeCall) },
                today.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                null, null, null, null, pageable) >> new PageImpl([])
    }

    def "discoverSessions with a future date uses the plain full-day start, not now()"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)
        def date = LocalDate.now(ZoneId.of("UTC")).plusDays(5)

        when:
        sessionService.discoverSessions(callerId, 1L, null, null, null, null, null, date, null, null, null, null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED], [1L], callerId,
                ParticipantStatus.JOINED, [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, null, false, [-1L], null, null,
                date.atStartOfDay(ZoneId.of("UTC")).toInstant(),
                date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                null, null, null, null, pageable) >> new PageImpl([])
    }

    // â”€â”€ SESSION-37: startTimeFilter/startTime independence â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def "discoverSessions given startTime without startTimeFilter defaults the direction to AFTER_OR_EQUAL"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)
        def time = LocalTime.of(9, 0)
        def date = LocalDate.now().plusDays(1)

        when:
        sessionService.discoverSessions(callerId, 1L, null, null, null, null, null, date,
                null, time, null, null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED], [1L], callerId,
                ParticipantStatus.JOINED, [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, null, false, [-1L], null, null,
                date.atStartOfDay(ZoneId.of("UTC")).toInstant(),
                date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                null, time.toSecondOfDay(), { it != null }, null, pageable) >> new PageImpl([])
    }

    def "discoverSessions given startTimeFilter without startTime has no effect"() {
        given:
        def callerId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 10)
        def date = LocalDate.now().plusDays(1)

        when:
        sessionService.discoverSessions(callerId, 1L, null, null, null, null, null, date,
                StartTimeFilter.AFTER_OR_EQUAL, null, null, null, pageable)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED], [1L], callerId,
                ParticipantStatus.JOINED, [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], null, null, false, [-1L], null, null,
                date.atStartOfDay(ZoneId.of("UTC")).toInstant(),
                date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                null, null, null, null, pageable) >> new PageImpl([])
    }

    // â”€â”€ SESSION-39: getSessionDiscoverDateCounts â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def "getSessionDiscoverDateCounts with no dates given defaults to today plus the next 7 days"() {
        given:
        def callerId = UUID.randomUUID()
        def today = LocalDate.now(ZoneId.of("UTC"))
        def expectedDateStrings = (0..7).collect { today.plusDays(it).toString() }

        when:
        def result = sessionService.getSessionDiscoverDateCounts(
                callerId, 1L, null, null, null, null, null, null, null, null, null, null)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverDateCounts(
                [SessionStatus.PREPARING.name(), SessionStatus.SCHEDULED.name()], [1L], callerId,
                ParticipantStatus.JOINED.name(),
                [ParticipantStatus.JOINED.name(), ParticipantStatus.REQUESTED.name(), ParticipantStatus.INVITED.name()],
                _ as Instant, today.plusDays(8).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                expectedDateStrings, today.toString(), _ as Instant,
                null, false, [-1L], null, null, null, null, null, null, "UTC") >> []
        result.counts.size() == 8
        result.counts*.date == (0..7).collect { today.plusDays(it) }
        result.counts*.count == [0L] * 8
    }

    def "getSessionDiscoverDateCounts with explicit future dates sorts/dedupes them and backfills missing rows with zero"() {
        given:
        def callerId = UUID.randomUUID()
        def today = LocalDate.now(ZoneId.of("UTC"))
        def d1 = today.plusDays(3)
        def d2 = today.plusDays(1)

        when:
        def result = sessionService.getSessionDiscoverDateCounts(
                callerId, 1L, null, null, null, null, null, [d1, d2, d2], null, null, null, null)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverDateCounts(
                _, [1L], callerId, _, _, d2.atStartOfDay(ZoneId.of("UTC")).toInstant(),
                d1.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                [d2.toString(), d1.toString()], _, _,
                _, false, [-1L], _, _, _, _, _, _, "UTC") >> [stubDateCount(d2, 5L)]
        result.counts.size() == 2
        result.counts[0].date == d2
        result.counts[0].count == 5L
        result.counts[1].date == d1
        result.counts[1].count == 0L
    }

    def "getSessionDiscoverDateCounts silently drops any given date before today"() {
        given:
        def callerId = UUID.randomUUID()
        def today = LocalDate.now(ZoneId.of("UTC"))
        def pastDate = today.minusDays(5)
        def futureDate = today.plusDays(2)

        when:
        sessionService.getSessionDiscoverDateCounts(
                callerId, 1L, null, null, null, null, null, [pastDate, futureDate], null, null, null, null)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverDateCounts(
                _, [1L], callerId, _, _, _, _, [futureDate.toString()], _, _,
                _, false, [-1L], _, _, _, _, _, _, "UTC") >> []
    }

    def "getSessionDiscoverDateCounts returns an empty counts list without querying when every given date is in the past"() {
        given:
        def callerId = UUID.randomUUID()
        def today = LocalDate.now(ZoneId.of("UTC"))

        when:
        def result = sessionService.getSessionDiscoverDateCounts(
                callerId, 1L, null, null, null, null, null,
                [today.minusDays(1), today.minusDays(10)], null, null, null, null)

        then:
        0 * userSportProfileService.getUserProfiles(*_)
        0 * sessionRepository.findDiscoverDateCounts(*_)
        result.counts == []
    }

    def "getSessionDiscoverDateCounts backfills every effective date at zero, without querying, when sportId isn't one of the caller's active sports"() {
        given:
        def callerId = UUID.randomUUID()
        def today = LocalDate.now(ZoneId.of("UTC"))

        when:
        def result = sessionService.getSessionDiscoverDateCounts(
                callerId, 99L, null, null, null, null, null, [today], null, null, null, null)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        0 * sessionRepository.findDiscoverDateCounts(*_)
        result.counts.size() == 1
        result.counts[0].date == today
        result.counts[0].count == 0L
    }

    def "getSessionDiscoverDateCounts backfills every effective date at zero, without querying, when the caller has zero active sport profiles"() {
        given:
        def callerId = UUID.randomUUID()
        def today = LocalDate.now(ZoneId.of("UTC"))

        when:
        def result = sessionService.getSessionDiscoverDateCounts(
                callerId, null, null, null, null, null, null, [today], null, null, null, null)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> []
        0 * sessionRepository.findDiscoverDateCounts(*_)
        result.counts.size() == 1
        result.counts[0].count == 0L
    }

    def "getSessionDiscoverDateCounts passes hasLocationIds=true and the given values when locationId is supplied"() {
        given:
        def callerId = UUID.randomUUID()
        def today = LocalDate.now(ZoneId.of("UTC"))

        when:
        sessionService.getSessionDiscoverDateCounts(
                callerId, 1L, null, [10L, 20L], null, null, null, [today], null, null, null, null)

        then:
        1 * userSportProfileService.getUserProfiles(callerId) >> [UserSportProfileResponse.builder().sportId(1L).build()]
        1 * sessionRepository.findDiscoverDateCounts(
                _, [1L], callerId, _, _, _, _, _, _, _,
                _, true, [10L, 20L], _, _, _, _, _, _, "UTC") >> []
    }

    def "getSessionDiscoverDateCounts rejects an invalid viewerZoneId"() {
        given:
        def callerId = UUID.randomUUID()

        when:
        sessionService.getSessionDiscoverDateCounts(
                callerId, 1L, null, null, null, null, null, null, null, null, "Not/AZone", null)

        then:
        thrown(BadRequestException)
        0 * userSportProfileService.getUserProfiles(*_)
        0 * sessionRepository.findDiscoverDateCounts(*_)
    }

    // â”€â”€ SESSION-38: generateNextOccurrenceForGroup â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def "generateNextOccurrenceForGroup re-fetches the group's config via a singleton-list batch call and delegates to SessionGenerationService"() {
        given:
        def config = GroupRecurrenceConfigResponse.builder().groupId(10L).build()

        when:
        sessionService.generateNextOccurrenceForGroup(10L)

        then:
        1 * groupService.getGroupRecurrenceConfigsByGroupIds([10L]) >> [config]
        1 * sessionGenerationService.generateForConfigs([config])
    }

    def "generateNextOccurrenceForGroup still delegates with an empty configs list when the group isn't eligible"() {
        when:
        sessionService.generateNextOccurrenceForGroup(10L)

        then:
        1 * groupService.getGroupRecurrenceConfigsByGroupIds([10L]) >> []
        1 * sessionGenerationService.generateForConfigs([])
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

    // SESSION-27 â€” replaces GET /sessions/mine.

    def "getUpcomingSessions with no date queries JOINED/INVITED across PREPARING/SCHEDULED/ONGOING"() {
        given:
        def userId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 20)

        when:
        sessionService.getUpcomingSessions(userId, null, null, pageable)

        then:
        1 * sessionRepository.findUpcomingSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED, SessionStatus.ONGOING],
                userId,
                [ParticipantStatus.JOINED, ParticipantStatus.INVITED],
                SessionStatus.PREPARING, SessionStatus.SCHEDULED,
                pageable) >> new PageImpl([])
        0 * sessionRepository.findUpcomingSessionsByDate(*_)
    }

    def "getUpcomingSessions strips any client-supplied sort, keeping only page/size"() {
        given:
        def userId = UUID.randomUUID()
        def sortedPageable = PageRequest.of(1, 5, Sort.by(Sort.Direction.DESC, "createdAt"))

        when:
        sessionService.getUpcomingSessions(userId, null, null, sortedPageable)

        then:
        1 * sessionRepository.findUpcomingSessions(*_) >> { args ->
            Pageable used = args[5]
            assert used.pageNumber == 1
            assert used.pageSize == 5
            assert used.sort.isUnsorted()
            new PageImpl([])
        }
    }

    def "getUpcomingSessions with a date but no viewerZoneId narrows to that calendar day in UTC"() {
        given:
        def userId = UUID.randomUUID()
        def date = LocalDate.of(2026, 9, 20)
        def pageable = PageRequest.of(0, 20)

        when:
        sessionService.getUpcomingSessions(userId, date, null, pageable)

        then:
        1 * sessionRepository.findUpcomingSessionsByDate(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED, SessionStatus.ONGOING],
                userId,
                [ParticipantStatus.JOINED, ParticipantStatus.INVITED],
                SessionStatus.PREPARING, SessionStatus.SCHEDULED,
                date.atStartOfDay(ZoneId.of("UTC")).toInstant(),
                date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                pageable) >> new PageImpl([])
        0 * sessionRepository.findUpcomingSessions(*_)
    }

    def "getUpcomingSessions with a date and viewerZoneId narrows to that calendar day in the given zone"() {
        given:
        def userId = UUID.randomUUID()
        def date = LocalDate.of(2026, 9, 20)
        def zone = ZoneId.of("America/New_York")
        def pageable = PageRequest.of(0, 20)

        when:
        sessionService.getUpcomingSessions(userId, date, "America/New_York", pageable)

        then:
        1 * sessionRepository.findUpcomingSessionsByDate(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED, SessionStatus.ONGOING],
                userId,
                [ParticipantStatus.JOINED, ParticipantStatus.INVITED],
                SessionStatus.PREPARING, SessionStatus.SCHEDULED,
                date.atStartOfDay(zone).toInstant(),
                date.plusDays(1).atStartOfDay(zone).toInstant(),
                pageable) >> new PageImpl([])
    }

    def "getUpcomingSessions rejects an invalid viewerZoneId"() {
        given:
        def userId = UUID.randomUUID()
        def date = LocalDate.of(2026, 9, 20)
        def pageable = PageRequest.of(0, 20)

        when:
        sessionService.getUpcomingSessions(userId, date, "Not/AZone", pageable)

        then:
        thrown(BadRequestException)
        0 * sessionRepository.findUpcomingSessionsByDate(*_)
    }

    // SESSION-42 â€” "my pending requests", reusing findUpcomingSessions unchanged.

    def "getRequestedSessions queries REQUESTED-only across PREPARING/SCHEDULED/ONGOING"() {
        given:
        def userId = UUID.randomUUID()
        def pageable = PageRequest.of(0, 20)

        when:
        sessionService.getRequestedSessions(userId, pageable)

        then:
        1 * sessionRepository.findUpcomingSessions(
                [SessionStatus.PREPARING, SessionStatus.SCHEDULED, SessionStatus.ONGOING],
                userId,
                [ParticipantStatus.REQUESTED],
                SessionStatus.PREPARING, SessionStatus.SCHEDULED,
                pageable) >> new PageImpl([])
    }

    def "getRequestedSessions strips any client-supplied sort, keeping only page/size"() {
        given:
        def userId = UUID.randomUUID()
        def sortedPageable = PageRequest.of(1, 5, Sort.by(Sort.Direction.DESC, "createdAt"))

        when:
        sessionService.getRequestedSessions(userId, sortedPageable)

        then:
        1 * sessionRepository.findUpcomingSessions(*_) >> { args ->
            Pageable used = args[5]
            assert used.pageNumber == 1
            assert used.pageSize == 5
            assert used.sort.isUnsorted()
            new PageImpl([])
        }
    }

    def "getSessionHistory queries JOINED-only across CANCELLED/COMPLETED for the given date, defaulting to UTC"() {
        given:
        def userId = UUID.randomUUID()
        def date = LocalDate.of(2026, 9, 14)
        def pageable = PageRequest.of(0, 20)

        when:
        sessionService.getSessionHistory(userId, date, null, pageable)

        then:
        1 * sessionRepository.findHistorySessionsByDate(
                [SessionStatus.CANCELLED, SessionStatus.COMPLETED],
                userId, ParticipantStatus.JOINED,
                date.atStartOfDay(ZoneId.of("UTC")).toInstant(),
                date.plusDays(1).atStartOfDay(ZoneId.of("UTC")).toInstant(),
                pageable) >> new PageImpl([])
    }

    def "getSessionHistory with a viewerZoneId narrows to that calendar day in the given zone"() {
        given:
        def userId = UUID.randomUUID()
        def date = LocalDate.of(2026, 9, 14)
        def zone = ZoneId.of("America/New_York")
        def pageable = PageRequest.of(0, 20)

        when:
        sessionService.getSessionHistory(userId, date, "America/New_York", pageable)

        then:
        1 * sessionRepository.findHistorySessionsByDate(
                [SessionStatus.CANCELLED, SessionStatus.COMPLETED],
                userId, ParticipantStatus.JOINED,
                date.atStartOfDay(zone).toInstant(),
                date.plusDays(1).atStartOfDay(zone).toInstant(),
                pageable) >> new PageImpl([])
    }

    def "getSessionHistory rejects an invalid viewerZoneId"() {
        given:
        def userId = UUID.randomUUID()
        def date = LocalDate.of(2026, 9, 14)
        def pageable = PageRequest.of(0, 20)

        when:
        sessionService.getSessionHistory(userId, date, "Not/AZone", pageable)

        then:
        thrown(BadRequestException)
        0 * sessionRepository.findHistorySessionsByDate(*_)
    }

    def "getSessionHistory strips any client-supplied sort, keeping only page/size"() {
        given:
        def userId = UUID.randomUUID()
        def date = LocalDate.of(2026, 9, 14)
        def sortedPageable = PageRequest.of(2, 10, Sort.by(Sort.Direction.ASC, "id"))

        when:
        sessionService.getSessionHistory(userId, date, null, sortedPageable)

        then:
        1 * sessionRepository.findHistorySessionsByDate(*_) >> { args ->
            Pageable used = args[5]
            assert used.pageNumber == 2
            assert used.pageSize == 10
            assert used.sort.isUnsorted()
            new PageImpl([])
        }
    }

    def "getSessionHistoryDates returns hasMore=false when the repository's row count is within dateCount"() {
        given:
        def userId = UUID.randomUUID()

        when:
        def result = sessionService.getSessionHistoryDates(userId, 3, null, null)

        then:
        1 * sessionRepository.findHistoryDateCounts(
                [SessionStatus.CANCELLED.name(), SessionStatus.COMPLETED.name()],
                userId, ParticipantStatus.JOINED.name(), null, "UTC", 4) >> [
                stubDateCount(LocalDate.of(2026, 9, 14), 2L),
                stubDateCount(LocalDate.of(2026, 9, 10), 1L)
        ]
        result.dates.size() == 2
        result.dates[0].date == LocalDate.of(2026, 9, 14)
        result.dates[0].count == 2L
        !result.hasMore
    }

    def "getSessionHistoryDates returns hasMore=true and trims to dateCount when an extra row comes back"() {
        given:
        def userId = UUID.randomUUID()

        when:
        def result = sessionService.getSessionHistoryDates(userId, 2, null, null)

        then:
        1 * sessionRepository.findHistoryDateCounts(_, _, _, _, _, 3) >> [
                stubDateCount(LocalDate.of(2026, 9, 14), 2L),
                stubDateCount(LocalDate.of(2026, 9, 10), 1L),
                stubDateCount(LocalDate.of(2026, 9, 5), 1L)
        ]
        result.dates.size() == 2
        result.hasMore
    }

    def "getSessionHistoryDates passes the before cursor through unchanged"() {
        given:
        def userId = UUID.randomUUID()
        def before = LocalDate.of(2026, 9, 10)

        when:
        sessionService.getSessionHistoryDates(userId, 5, before, null)

        then:
        1 * sessionRepository.findHistoryDateCounts(_, userId, _, before, _, 6) >> []
    }

    def "getSessionHistoryDates defaults to UTC when viewerZoneId is omitted"() {
        given:
        def userId = UUID.randomUUID()

        when:
        sessionService.getSessionHistoryDates(userId, 5, null, null)

        then:
        1 * sessionRepository.findHistoryDateCounts(_, _, _, _, "UTC", _) >> []
    }

    def "getSessionHistoryDates passes a valid viewerZoneId through to the repository"() {
        given:
        def userId = UUID.randomUUID()

        when:
        sessionService.getSessionHistoryDates(userId, 5, null, "America/Los_Angeles")

        then:
        1 * sessionRepository.findHistoryDateCounts(_, _, _, _, "America/Los_Angeles", _) >> []
    }

    def "getSessionHistoryDates rejects an invalid viewerZoneId"() {
        given:
        def userId = UUID.randomUUID()

        when:
        sessionService.getSessionHistoryDates(userId, 5, null, "Not/AZone")

        then:
        0 * sessionRepository.findHistoryDateCounts(*_)
        thrown(BadRequestException)
    }

    private static SessionRepository.SessionDateCountProjection stubDateCount(LocalDate date, Long count) {
        return new SessionRepository.SessionDateCountProjection() {
            LocalDate getSessionDate() { date }
            Long getCount() { count }
        }
    }

    def "createSession sets capacity/feeType/feeAmountVnd from the request"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).scheduledStart(Instant.now().plusSeconds(86400))
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
                .sportId(1L).locationId(1L).scheduledStart(Instant.now())
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
                .sportId(1L).locationId(1L).scheduledStart(Instant.now().plusSeconds(86400))
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
                .sportId(1L).locationId(1L).scheduledStart(Instant.now().plusSeconds(86400))
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
                .sportId(1L).locationId(1L).scheduledStart(Instant.now().plusSeconds(86400))
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
                .sportId(1L).locationId(1L).scheduledStart(Instant.now().plusSeconds(86400))
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
        sportService.getActiveSportsByIds(_) >> [:]
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
                .scheduledStart(Instant.now()).status(SessionStatus.SCHEDULED)
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
                .scheduledStart(Instant.now()).status(SessionStatus.SCHEDULED)
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
        // SESSION-24: feeType is only changeable while PREPARING â€” moved off SCHEDULED so this
        // still reaches resolveFeeAmountVnd's own validation rather than the new PREPARING gate.
        def session = Session.builder().id(1L).createdBy(userId).sportId(1L).locationId(1L)
                .scheduledStart(Instant.now()).status(SessionStatus.PREPARING)
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
        // SESSION-24: feeType is only changeable while PREPARING â€” moved off SCHEDULED (this
        // scenario is no longer reachable there at all, see the rejection test right below).
        def session = Session.builder().id(1L).createdBy(userId).sportId(1L).locationId(1L)
                .scheduledStart(Instant.now()).status(SessionStatus.PREPARING)
                .capacity(10).feeType(FeeType.FIXED).feeAmountVnd(30000L).build()
        def request = UpdateSessionRequest.builder().feeType(FeeType.SPLIT).build()

        when:
        sessionService.updateSession(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionRepository.save({ Session s -> s.feeType == FeeType.SPLIT && s.feeAmountVnd == null }) >> session
        interaction { stubBatchEnrichment() }
        1 * sessionOutboxWriter.record("session.details.updated", _)
    }

    def "updateSession rejects changing feeType once the session is genuinely SCHEDULED"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(userId).sportId(1L).locationId(1L)
                .scheduledStart(Instant.now()).status(SessionStatus.SCHEDULED)
                .capacity(10).feeType(FeeType.FIXED).feeAmountVnd(30000L).build()
        def request = UpdateSessionRequest.builder().feeType(FeeType.SPLIT).build()

        when:
        sessionService.updateSession(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        thrown(BadRequestException)
        0 * sessionRepository.save(_)
    }

    def "updateSession rejects changing locationId once the session is genuinely SCHEDULED"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(userId).sportId(1L).locationId(1L)
                .scheduledStart(Instant.now()).status(SessionStatus.SCHEDULED)
                .capacity(10).feeType(FeeType.FREE).build()
        def request = UpdateSessionRequest.builder().locationId(2L).build()

        when:
        sessionService.updateSession(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        thrown(BadRequestException)
        0 * sessionRepository.save(_)
        0 * locationService.getLocation(_)
    }

    // â”€â”€ SESSION-24 â€” PREPARING status â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def "createSession starts PREPARING when locationId is missing"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).scheduledStart(Instant.now().plusSeconds(86400))
                .capacity(10).feeType(FeeType.FREE).build()
        def saved = Session.builder().id(1L).sessionType(SessionType.STANDALONE).createdBy(userId)
                .sportId(1L).scheduledStart(request.scheduledStart).status(SessionStatus.PREPARING).build()

        when:
        def result = sessionService.createSession(userId, request)

        then:
        0 * locationService.getLocation(_)
        1 * sessionRepository.save({ Session s -> s.status == SessionStatus.PREPARING && s.locationId == null }) >> saved
        interaction { stubBatchEnrichment() }
        result.status == SessionStatus.PREPARING
    }

    def "createSession starts PREPARING when feeType is missing"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).scheduledStart(Instant.now().plusSeconds(86400))
                .capacity(10).build()
        def saved = Session.builder().id(1L).sessionType(SessionType.STANDALONE).createdBy(userId)
                .sportId(1L).locationId(1L).scheduledStart(request.scheduledStart)
                .status(SessionStatus.PREPARING).build()

        when:
        def result = sessionService.createSession(userId, request)

        then:
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save({ Session s -> s.status == SessionStatus.PREPARING && s.feeType == null }) >> saved
        interaction { stubBatchEnrichment() }
        result.status == SessionStatus.PREPARING
    }

    def "createSession starts PREPARING when both locationId and feeType are missing"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).scheduledStart(Instant.now().plusSeconds(86400)).capacity(10).build()
        def saved = Session.builder().id(1L).sessionType(SessionType.STANDALONE).createdBy(userId)
                .sportId(1L).scheduledStart(request.scheduledStart).status(SessionStatus.PREPARING).build()

        when:
        def result = sessionService.createSession(userId, request)

        then:
        0 * locationService.getLocation(_)
        1 * sessionRepository.save({ Session s ->
            s.status == SessionStatus.PREPARING && s.locationId == null && s.feeType == null
        }) >> saved
        interaction { stubBatchEnrichment() }
        result.status == SessionStatus.PREPARING
    }

    def "createSession starts SCHEDULED when both locationId and feeType are present"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).scheduledStart(Instant.now().plusSeconds(86400))
                .capacity(10).feeType(FeeType.FREE).build()
        def saved = Session.builder().id(1L).sessionType(SessionType.STANDALONE).createdBy(userId)
                .sportId(1L).locationId(1L).scheduledStart(request.scheduledStart)
                .status(SessionStatus.SCHEDULED).build()

        when:
        def result = sessionService.createSession(userId, request)

        then:
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save({ Session s -> s.status == SessionStatus.SCHEDULED }) >> saved
        interaction { stubBatchEnrichment() }
        result.status == SessionStatus.SCHEDULED
    }

    def "updateSession flips PREPARING to SCHEDULED once both locationId and feeType are completed"() {
        given:
        def userId = UUID.randomUUID()
        // .feeType(null) explicitly, not omitted â€” Session.feeType's @Builder.Default only
        // applies when the builder method is never called at all; a genuinely-missing feeType
        // (as a real PREPARING session would have) requires calling it with null.
        def session = Session.builder().id(1L).createdBy(userId).sportId(1L).feeType(null)
                .scheduledStart(Instant.now().plusSeconds(86400)).status(SessionStatus.PREPARING)
                .capacity(10).build()
        def request = UpdateSessionRequest.builder().locationId(1L).feeType(FeeType.FREE).build()

        when:
        def result = sessionService.updateSession(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save({ Session s -> s.status == SessionStatus.SCHEDULED }) >> session
        interaction { stubBatchEnrichment() }
        1 * sessionOutboxWriter.record("session.details.updated", { it.sessionId == 1L && it.actorId == userId })
        result.status == SessionStatus.SCHEDULED
    }

    def "updateSession stays PREPARING when only one of locationId/feeType is completed"() {
        given:
        def userId = UUID.randomUUID()
        // .feeType(null) explicitly â€” see the comment in the sibling "flips PREPARING to
        // SCHEDULED" test above for why omitting the builder call entirely is wrong here.
        def session = Session.builder().id(1L).createdBy(userId).sportId(1L).feeType(null)
                .scheduledStart(Instant.now().plusSeconds(86400)).status(SessionStatus.PREPARING)
                .capacity(10).build()
        def request = UpdateSessionRequest.builder().locationId(1L).build()

        when:
        def result = sessionService.updateSession(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * locationService.getLocation(1L) >> basketballLocation
        1 * sessionRepository.save({ Session s -> s.status == SessionStatus.PREPARING && s.locationId == 1L }) >> session
        interaction { stubBatchEnrichment() }
        result.status == SessionStatus.PREPARING
    }

    def "updateSession writes a session.details.updated outbox row on every successful update, regardless of field"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).createdBy(userId).sportId(1L).locationId(1L)
                .scheduledStart(Instant.now()).status(SessionStatus.SCHEDULED)
                .capacity(10).feeType(FeeType.FREE).build()
        def request = UpdateSessionRequest.builder().title("New title").build()

        when:
        sessionService.updateSession(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionRepository.save(_) >> session
        interaction { stubBatchEnrichment() }
        1 * sessionOutboxWriter.record("session.details.updated", { it.sessionId == 1L && it.actorId == userId })
    }

    // â”€â”€ createSession â€” companion SESSION_POST (SESSION-10/A17) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def "createSession creates the companion SESSION_POST before saving, and uses the returned id as postId"() {
        given:
        def userId = UUID.randomUUID()
        def request = CreateSessionRequest.builder()
                .sportId(1L).locationId(1L).title("Sunday badminton")
                .scheduledStart(Instant.now().plusSeconds(86400)).build()

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
                .groupId(5L).locationId(1L).scheduledStart(Instant.now().plusSeconds(86400)).build()
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

    // â”€â”€ session comment proxy (SESSION-10/A17) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    // Gates via SessionGate (a real ResourceGate<Session>, its own SessionGateSpec covers the
    // branch logic â€” see documentation/md/adr/RESOURCE_ACCESS_GATE_ADR.md Â§7's supersession note),
    // then delegates to CommentService's bypass methods. sessionGate is mocked here â€” these tests
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
        1 * sessionOutboxWriter.record("session.comment.created", { SessionCommentCreatedEvent e ->
            e.sessionId == 1L && e.actorId == userId && e.commentId == 5L
        })
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

    // â”€â”€ likeSession / unlikeSession (SESSION-10/A17) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    // â”€â”€ getParticipantIdsByStatuses (NTF-2 fan-out recipient resolution) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    //
    // SESSION-20 made the session-status filter an explicit parameter. ACTIVE and ANY below are
    // the two sets notification-impl's SessionEventsConsumer actually passes â€” the cases are
    // written against those rather than ad-hoc lists so this spec breaks if either changes shape.

    private static final List<SessionStatus> ACTIVE = [SessionStatus.SCHEDULED, SessionStatus.ONGOING]
    private static final List<SessionStatus> ANY = SessionStatus.values() as List

    def "getParticipantIdsByStatuses returns distinct participant ids for a SCHEDULED session"() {
        given:
        def session = Session.builder().id(1L).status(SessionStatus.SCHEDULED).build()
        def u1 = UUID.randomUUID()
        def u2 = UUID.randomUUID()
        def rows = [
                SessionParticipant.builder().sessionId(1L).userId(u1).status(ParticipantStatus.JOINED).build(),
                SessionParticipant.builder().sessionId(1L).userId(u2).status(ParticipantStatus.REQUESTED).build(),
        ]

        when:
        def result = sessionService.getParticipantIdsByStatuses(1L,
                [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED], ACTIVE)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndStatusIn(1L,
                [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED]) >> rows
        result.toSet() == [u1, u2].toSet()
    }

    def "getParticipantIdsByStatuses returns participants for an ONGOING session too"() {
        given:
        def session = Session.builder().id(1L).status(SessionStatus.ONGOING).build()

        when:
        def result = sessionService.getParticipantIdsByStatuses(1L, [ParticipantStatus.JOINED], ACTIVE)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndStatusIn(1L, [ParticipantStatus.JOINED]) >> []
        result == []
    }

    def "getParticipantIdsByStatuses returns empty without querying participants for a session status the caller didn't allow"() {
        given:
        def session = Session.builder().id(1L).status(excludedStatus).build()

        when:
        def result = sessionService.getParticipantIdsByStatuses(1L, [ParticipantStatus.JOINED], ACTIVE)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        0 * sessionParticipantRepository.findBySessionIdAndStatusIn(_, _)
        result == []

        where:
        excludedStatus << [SessionStatus.CANCELLED, SessionStatus.COMPLETED]
    }

    /**
     * SESSION-20's actual fix. Before it, this method hardcoded (SCHEDULED, ONGOING) internally, so
     * a comment on a COMPLETED/CANCELLED session â€” which SessionGate permits â€” resolved zero
     * recipients and notified nobody. With the comment event's ANY_SESSION_STATUS set, the same
     * recipients come back in every lifecycle state.
     */
    def "getParticipantIdsByStatuses resolves the full comment-recipient set for a #sessionStatus session when the caller allows any status"() {
        given:
        def session = Session.builder().id(1L).status(sessionStatus).build()
        def commenterPeer = UUID.randomUUID()
        def invitee = UUID.randomUUID()
        def commentStatuses = [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED]
        def rows = [
                SessionParticipant.builder().sessionId(1L).userId(commenterPeer).status(ParticipantStatus.JOINED).build(),
                SessionParticipant.builder().sessionId(1L).userId(invitee).status(ParticipantStatus.INVITED).build(),
        ]

        when:
        def result = sessionService.getParticipantIdsByStatuses(1L, commentStatuses, ANY)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndStatusIn(1L, commentStatuses) >> rows
        result.toSet() == [commenterPeer, invitee].toSet()

        where:
        sessionStatus << [SessionStatus.COMPLETED, SessionStatus.CANCELLED,
                          SessionStatus.SCHEDULED, SessionStatus.ONGOING]
    }

    def "getParticipantIdsByStatuses returns empty for a nonexistent session even when every status is allowed"() {
        when:
        def result = sessionService.getParticipantIdsByStatuses(999L, [ParticipantStatus.JOINED], ANY)

        then:
        1 * sessionRepository.findById(999L) >> Optional.empty()
        0 * sessionParticipantRepository.findBySessionIdAndStatusIn(_, _)
        result == []
    }

    // â”€â”€ SessionResponse.likeCount / isLikedByCurrentUser (batch, via mapToResponses) â”€

    def "getSession resolves likeCount/isLikedByCurrentUser from PostService.getSessionPostLikeInfo, keyed by the session's postId"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).postId(999L).sportId(1L).locationId(1L)
                .scheduledStart(Instant.now()).status(SessionStatus.SCHEDULED)
                .capacity(10).feeType(FeeType.FREE).initialSlot(0).build()

        when:
        def result = sessionService.getSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionDetailGate.require(session, userId, _, _) >> session
        userService.getUsersByIds(_) >> [:]
        sportService.getActiveSportsByIds(_) >> [:]
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
                .scheduledStart(Instant.now()).status(SessionStatus.SCHEDULED)
                .capacity(10).feeType(FeeType.FREE).initialSlot(0).build()

        when:
        def result = sessionService.getSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionDetailGate.require(session, userId, _, _) >> session
        interaction { stubBatchEnrichment() }
        result.likeCount == 0L
        result.isLikedByCurrentUser == false
    }

    // â”€â”€ SESSION-21 system comments in the discussion thread â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

    def "joinSession writes a system comment authored by the session creator when the caller lands on JOINED"() {
        given: "a session created by someone other than the joiner"
        def creatorId = UUID.randomUUID()
        def joinerId = UUID.randomUUID()
        def session = Session.builder().id(1L).postId(999L).createdBy(creatorId).autoApprove(true).build()
        def joiner = UserResponse.builder().id(joinerId).firstName("Alice").lastName("Nguyen").build()

        when:
        sessionService.joinSession(1L, joinerId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, joinerId) >> Optional.empty()
        1 * sessionParticipantRepository.save(_) >> { SessionParticipant p -> p }
        1 * userService.getUsersByIds([joinerId]) >> [(joinerId): joiner]

        and: "the entry is authored by the creator, not the joiner it is about"
        1 * commentService.createSystemSessionComment(999L, creatorId, "Alice Nguyen joined the session")

        and: "no comment notification â€” participant.joined already covers this moment"
        0 * sessionOutboxWriter.record("session.comment.created", _)
    }

    def "joinSession writes no system comment when the caller only lands on REQUESTED"() {
        given:
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).postId(999L).createdBy(UUID.randomUUID()).autoApprove(false).build()

        when:
        sessionService.joinSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.empty()
        1 * sessionParticipantRepository.save(_) >> { SessionParticipant p -> p }
        0 * commentService.createSystemSessionComment(_, _, _)
    }

    def "joinSession writes no system comment when the caller is already JOINED"() {
        given: "SESSION-16's early return â€” no genuine transition, so nothing to record"
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).postId(999L).createdBy(UUID.randomUUID()).autoApprove(true).build()
        def existing = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId)
                .status(ParticipantStatus.JOINED).build()

        when:
        sessionService.joinSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(existing)
        0 * commentService.createSystemSessionComment(_, _, _)
    }

    def "leaveSession writes a system comment on a genuine JOINED to LEFT transition"() {
        given:
        def creatorId = UUID.randomUUID()
        def leaverId = UUID.randomUUID()
        def session = Session.builder().id(1L).postId(999L).createdBy(creatorId).groupId(5L).build()
        def participant = SessionParticipant.builder().id(9L).sessionId(1L).userId(leaverId)
                .status(ParticipantStatus.JOINED).build()
        def leaver = UserResponse.builder().id(leaverId).firstName("Alice").lastName("Nguyen").build()

        when:
        sessionService.leaveSession(1L, leaverId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, leaverId) >> Optional.of(participant)
        1 * sessionParticipantRepository.save(_) >> participant
        1 * userService.getUsersByIds([leaverId]) >> [(leaverId): leaver]
        1 * commentService.createSystemSessionComment(999L, creatorId, "Alice Nguyen left the session")
        0 * sessionOutboxWriter.record("session.comment.created", _)
    }

    def "leaveSession writes no system comment when the row was only #status"() {
        given: "SESSION-19: declining an invite / cancelling a request is not a departure"
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).postId(999L).createdBy(UUID.randomUUID()).groupId(5L).build()
        def participant = SessionParticipant.builder().id(9L).sessionId(1L).userId(userId).status(status).build()

        when:
        sessionService.leaveSession(1L, userId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, userId) >> Optional.of(participant)
        1 * sessionParticipantRepository.save(_) >> participant
        0 * commentService.createSystemSessionComment(_, _, _)

        where:
        status << [ParticipantStatus.INVITED, ParticipantStatus.REQUESTED]
    }

    def "approveParticipant writes a system comment for the approved requester"() {
        given:
        def creatorId = UUID.randomUUID()
        def requesterId = UUID.randomUUID()
        def session = Session.builder().id(1L).postId(999L).createdBy(creatorId)
                .status(SessionStatus.SCHEDULED).build()
        def participant = SessionParticipant.builder().id(9L).sessionId(1L).userId(requesterId)
                .status(ParticipantStatus.REQUESTED).build()
        def requester = UserResponse.builder().id(requesterId).firstName("Alice").lastName("Nguyen").build()

        when:
        sessionService.approveParticipant(1L, creatorId, requesterId)

        then: "the session is fetched exactly once, then reused for the system comment"
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, requesterId) >> Optional.of(participant)
        1 * sessionParticipantRepository.save(_) >> participant
        1 * userService.getUsersByIds([requesterId]) >> [(requesterId): requester]
        1 * commentService.createSystemSessionComment(999L, creatorId, "Alice Nguyen joined the session")
        0 * sessionOutboxWriter.record("session.comment.created", _)
    }

    def "rejectParticipant writes no system comment"() {
        given: "a rejection is not one of the three moments the thread records"
        def creatorId = UUID.randomUUID()
        def requesterId = UUID.randomUUID()
        def session = Session.builder().id(1L).postId(999L).createdBy(creatorId)
                .status(SessionStatus.SCHEDULED).build()
        def participant = SessionParticipant.builder().id(9L).sessionId(1L).userId(requesterId)
                .status(ParticipantStatus.REQUESTED).build()

        when:
        sessionService.rejectParticipant(1L, creatorId, requesterId, null)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, requesterId) >> Optional.of(participant)
        1 * sessionParticipantRepository.save(_) >> participant
        0 * commentService.createSystemSessionComment(_, _, _)
    }

    def "a system comment falls back to a neutral label when the participant cannot be resolved"() {
        given:
        def creatorId = UUID.randomUUID()
        def joinerId = UUID.randomUUID()
        def session = Session.builder().id(1L).postId(999L).createdBy(creatorId).autoApprove(true).build()

        when:
        sessionService.joinSession(1L, joinerId)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, joinerId) >> Optional.empty()
        1 * sessionParticipantRepository.save(_) >> { SessionParticipant p -> p }
        1 * userService.getUsersByIds([joinerId]) >> [:]

        and: "an unresolvable name never fails an otherwise valid join"
        1 * commentService.createSystemSessionComment(999L, creatorId, "A participant joined the session")
    }

    def "createSessionComment still emits session.comment.created for a real user comment"() {
        given: "the notification suppression is scoped to system entries only, not the whole thread"
        def userId = UUID.randomUUID()
        def session = Session.builder().id(1L).postId(999L).createdBy(UUID.randomUUID()).build()
        def request = CreateCommentRequest.builder().content("see you there").build()
        def response = CommentResponse.builder().id(77L).build()

        when:
        sessionService.createSessionComment(1L, userId, request)

        then:
        1 * sessionRepository.findById(1L) >> Optional.of(session)
        1 * sessionGate.require(session, userId, _, _) >> session
        1 * commentService.createSessionComment(999L, userId, request) >> response
        1 * sessionOutboxWriter.record("session.comment.created", _)
        0 * commentService.createSystemSessionComment(_, _, _)
    }
}
