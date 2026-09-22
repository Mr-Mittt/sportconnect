package com.sportconnect.session.access

import com.sportconnect.group.api.service.GroupService
import com.sportconnect.session.api.dto.ParticipantStatus
import com.sportconnect.session.entity.Session
import com.sportconnect.session.entity.SessionParticipant
import com.sportconnect.session.repository.SessionParticipantRepository
import spock.lang.Specification
import spock.lang.Subject
import spock.lang.Unroll

class SessionDetailGateSpec extends Specification {

    GroupService groupService = Mock()
    SessionParticipantRepository sessionParticipantRepository = Mock()

    @Subject
    SessionDetailGate sessionDetailGate = new SessionDetailGate(groupService, sessionParticipantRepository)

    UUID viewerId = UUID.randomUUID()
    Long groupId = 5L

    private Session session(Long gId = null, Boolean isPublic = false) {
        Session.builder().id(1L).postId(999L).groupId(gId).isPublic(isPublic).build()
    }

    // ── isAvailable (same rule as SessionGate) ──────────────────────────────

    def "isAvailable is false for null"() {
        expect:
        !sessionDetailGate.isAvailable(null)
    }

    def "isAvailable is true for a standalone session, no group check"() {
        when:
        def result = sessionDetailGate.isAvailable(session())

        then:
        result
        0 * groupService._
    }

    def "isAvailable defers to groupService.isGroupActive for a group-linked session"() {
        given:
        def s = session(groupId)

        when:
        def result = sessionDetailGate.isAvailable(s)

        then:
        1 * groupService.isGroupActive(groupId) >> active
        result == active

        where:
        active << [true, false]
    }

    // ── isVisibleTo ──────────────────────────────────────────────────────────

    def "isVisibleTo is false for an unauthenticated viewer, no lookups"() {
        when:
        def result = sessionDetailGate.isVisibleTo(session(), null)

        then:
        !result
        0 * sessionParticipantRepository._
        0 * groupService._
    }

    def "isVisibleTo is true for isPublic=true regardless of type, no further lookups"() {
        expect:
        sessionDetailGate.isVisibleTo(session(gId, true), viewerId)

        where:
        gId << [null, 5L]
    }

    @Unroll
    def "isVisibleTo (isPublic=false, standalone) is true for a #status participant"() {
        given:
        def s = session()
        def participant = SessionParticipant.builder().sessionId(1L).userId(viewerId).status(status).build()

        when:
        def result = sessionDetailGate.isVisibleTo(s, viewerId)

        then:
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, viewerId) >> Optional.of(participant)
        result
        0 * groupService._

        where:
        status << [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED]
    }

    def "isVisibleTo (isPublic=false, standalone) is false for a LEFT participant"() {
        given:
        def s = session()
        def participant = SessionParticipant.builder().sessionId(1L).userId(viewerId).status(ParticipantStatus.LEFT).build()

        when:
        def result = sessionDetailGate.isVisibleTo(s, viewerId)

        then:
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, viewerId) >> Optional.of(participant)
        !result
    }

    def "isVisibleTo (isPublic=false, standalone) is false with no participant row at all"() {
        given:
        def s = session()

        when:
        def result = sessionDetailGate.isVisibleTo(s, viewerId)

        then:
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, viewerId) >> Optional.empty()
        !result
    }

    def "isVisibleTo (isPublic=false, group-linked) defers to groupService.isGroupMember, no participant lookup"() {
        given:
        def s = session(groupId)

        when:
        def result = sessionDetailGate.isVisibleTo(s, viewerId)

        then:
        1 * groupService.isGroupMember(groupId, viewerId) >> isMember
        result == isMember
        0 * sessionParticipantRepository._

        where:
        isMember << [true, false]
    }
}
