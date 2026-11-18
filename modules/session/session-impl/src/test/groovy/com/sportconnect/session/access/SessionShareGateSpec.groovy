package com.sportconnect.session.access

import com.sportconnect.common.exception.ForbiddenException
import com.sportconnect.common.exception.NotFoundException
import com.sportconnect.group.api.service.GroupService
import com.sportconnect.session.api.dto.ParticipantStatus
import com.sportconnect.session.entity.Session
import com.sportconnect.session.entity.SessionParticipant
import com.sportconnect.session.repository.SessionParticipantRepository
import spock.lang.Specification
import spock.lang.Subject

/** SESSION-66: only a JOINED participant of a standalone session may share it. */
class SessionShareGateSpec extends Specification {

    GroupService groupService = Mock()
    SessionParticipantRepository sessionParticipantRepository = Mock()

    @Subject
    SessionShareGate gate = new SessionShareGate(groupService, sessionParticipantRepository)

    UUID viewerId = UUID.randomUUID()

    private Session session(Long groupId = null) {
        Session.builder().id(1L).postId(999L).groupId(groupId).build()
    }

    private void participant(ParticipantStatus status) {
        sessionParticipantRepository.findBySessionIdAndUserId(1L, viewerId) >>
                Optional.of(SessionParticipant.builder().sessionId(1L).userId(viewerId).status(status).build())
    }

    def "isAvailable is false for null"() {
        expect:
        !gate.isAvailable(null)
    }

    def "isAvailable is true for a standalone session without a group check"() {
        when:
        def result = gate.isAvailable(session())

        then:
        result
        0 * groupService._
    }

    def "isAvailable defers to the group for a group-linked session"() {
        when:
        def result = gate.isAvailable(session(5L))

        then:
        1 * groupService.isGroupActive(5L) >> active
        result == active

        where:
        active << [true, false]
    }

    def "isVisibleTo is false for an unauthenticated viewer, no lookups"() {
        when:
        def result = gate.isVisibleTo(session(), null)

        then:
        !result
        0 * sessionParticipantRepository._
    }

    def "a JOINED participant of a standalone session may share it"() {
        given:
        participant(ParticipantStatus.JOINED)

        expect:
        gate.isVisibleTo(session(), viewerId)
    }

    def "a #status participant may not share"() {
        given:
        participant(status)

        expect:
        !gate.isVisibleTo(session(), viewerId)

        where:
        status << [ParticipantStatus.REQUESTED, ParticipantStatus.INVITED, ParticipantStatus.LEFT]
    }

    def "someone with no participant row may not share"() {
        given:
        sessionParticipantRepository.findBySessionIdAndUserId(1L, viewerId) >> Optional.empty()

        expect:
        !gate.isVisibleTo(session(), viewerId)
    }

    def "a group session is not shareable, even by a group member or a JOINED participant"() {
        when:
        def result = gate.isVisibleTo(session(5L), viewerId)

        then:
        !result
        0 * sessionParticipantRepository._
        0 * groupService._
    }

    def "require answers 404 for a missing session and 403 for a caller who may not share, with the given codes"() {
        when:
        gate.require(null, viewerId, "SESSION_NOT_FOUND", "nf", "SESSION_SHARE_NOT_ALLOWED", "no")

        then:
        def nf = thrown(NotFoundException)
        nf.errorCode == "SESSION_NOT_FOUND"

        when:
        sessionParticipantRepository.findBySessionIdAndUserId(1L, viewerId) >> Optional.empty()
        gate.require(session(), viewerId, "SESSION_NOT_FOUND", "nf", "SESSION_SHARE_NOT_ALLOWED", "no")

        then:
        def fb = thrown(ForbiddenException)
        fb.errorCode == "SESSION_SHARE_NOT_ALLOWED"
    }
}
