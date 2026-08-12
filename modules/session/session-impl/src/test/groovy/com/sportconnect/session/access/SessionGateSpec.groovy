package com.sportconnect.session.access

import com.sportconnect.group.api.service.GroupService
import com.sportconnect.session.api.dto.ParticipantStatus
import com.sportconnect.session.entity.Session
import com.sportconnect.session.entity.SessionParticipant
import com.sportconnect.session.repository.SessionParticipantRepository
import spock.lang.Specification
import spock.lang.Subject
import spock.lang.Unroll

class SessionGateSpec extends Specification {

    GroupService groupService = Mock()
    SessionParticipantRepository sessionParticipantRepository = Mock()

    @Subject
    SessionGate sessionGate = new SessionGate(groupService, sessionParticipantRepository)

    UUID viewerId = UUID.randomUUID()
    Long groupId = 5L

    private Session session(Long gId = null) {
        Session.builder().id(1L).postId(999L).groupId(gId).build()
    }

    // ── isAvailable ──────────────────────────────────────────────────────────

    def "isAvailable is false for null"() {
        expect:
        !sessionGate.isAvailable(null)
    }

    def "isAvailable is true for a standalone session, no group check"() {
        when:
        def result = sessionGate.isAvailable(session())

        then:
        result
        0 * groupService._
    }

    def "isAvailable defers to groupService.isGroupActive for a group-linked session"() {
        given:
        def s = session(groupId)

        when:
        def result = sessionGate.isAvailable(s)

        then:
        1 * groupService.isGroupActive(groupId) >> active
        result == active

        where:
        active << [true, false]
    }

    // ── isVisibleTo ──────────────────────────────────────────────────────────

    def "isVisibleTo is false for an unauthenticated viewer, no lookups"() {
        when:
        def result = sessionGate.isVisibleTo(session(), null)

        then:
        !result
        0 * sessionParticipantRepository._
        0 * groupService._
    }

    @Unroll
    def "isVisibleTo is true for a #status participant of a standalone session"() {
        given:
        def s = session()
        def participant = SessionParticipant.builder().sessionId(1L).userId(viewerId).status(status).build()

        when:
        def result = sessionGate.isVisibleTo(s, viewerId)

        then:
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, viewerId) >> Optional.of(participant)
        result
        0 * groupService._

        where:
        status << [ParticipantStatus.JOINED, ParticipantStatus.REQUESTED, ParticipantStatus.INVITED]
    }

    def "isVisibleTo is false for a LEFT participant of a standalone session"() {
        given:
        def s = session()
        def participant = SessionParticipant.builder().sessionId(1L).userId(viewerId).status(ParticipantStatus.LEFT).build()

        when:
        def result = sessionGate.isVisibleTo(s, viewerId)

        then:
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, viewerId) >> Optional.of(participant)
        !result
        0 * groupService._
    }

    def "isVisibleTo is false for a standalone session with no participant row at all"() {
        given:
        def s = session()

        when:
        def result = sessionGate.isVisibleTo(s, viewerId)

        then:
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, viewerId) >> Optional.empty()
        !result
        0 * groupService._
    }

    def "isVisibleTo widens to group membership for a group-linked session (ADR §6)"() {
        given:
        def s = session(groupId)

        when:
        def result = sessionGate.isVisibleTo(s, viewerId)

        then:
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, viewerId) >> Optional.empty()
        1 * groupService.isGroupMember(groupId, viewerId) >> isMember
        result == isMember

        where:
        isMember << [true, false]
    }

    def "isVisibleTo short-circuits on participant status without calling groupService, even for a group-linked session"() {
        given:
        def s = session(groupId)
        def participant = SessionParticipant.builder().sessionId(1L).userId(viewerId).status(ParticipantStatus.JOINED).build()

        when:
        def result = sessionGate.isVisibleTo(s, viewerId)

        then:
        1 * sessionParticipantRepository.findBySessionIdAndUserId(1L, viewerId) >> Optional.of(participant)
        result
        0 * groupService._
    }
}
