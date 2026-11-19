package com.sportconnect.session.access

import com.sportconnect.common.exception.ForbiddenException
import com.sportconnect.common.exception.NotFoundException
import com.sportconnect.group.api.service.GroupService
import com.sportconnect.session.api.dto.SessionStatus
import com.sportconnect.session.entity.Session
import spock.lang.Specification
import spock.lang.Subject

/**
 * SESSION-66 / CLIENT-SESSION-49: any identified caller may share a standalone session, in any status and whatever their
 * own participation; a private standalone session is not (SESSION-69); a group session is shareable by its members (SESSION-GROUP-3).
 */
class SessionShareGateSpec extends Specification {

    GroupService groupService = Mock()

    @Subject
    SessionShareGate gate = new SessionShareGate(groupService)

    UUID viewerId = UUID.randomUUID()

    private Session session(Long groupId = null, SessionStatus status = SessionStatus.SCHEDULED, Boolean isPublic = true) {
        Session.builder().id(1L).postId(999L).groupId(groupId).status(status).isPublic(isPublic).build()
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

    def "isVisibleTo is false for an unauthenticated viewer"() {
        expect:
        !gate.isVisibleTo(session(), null)
    }

    def "any identified viewer may share a standalone session, whatever its status (#status) and their participation"() {
        expect:
        gate.isVisibleTo(session(null, status), viewerId)

        where:
        status << SessionStatus.values().toList()
    }

    def "a private standalone session is not shareable, by anyone, in any status (SESSION-69)"() {
        expect:
        !gate.isVisibleTo(session(null, status, false), viewerId)

        where:
        status << SessionStatus.values().toList()
    }

    def "a session with no isPublic value is not shareable either (only an explicit public one is)"() {
        expect:
        !gate.isVisibleTo(session(null, SessionStatus.SCHEDULED, null), viewerId)
    }

    def "require answers 403 SESSION_SHARE_NOT_ALLOWED for a private session"() {
        when:
        gate.require(session(null, SessionStatus.SCHEDULED, false), viewerId, "SESSION_NOT_FOUND", "nf", "SESSION_SHARE_NOT_ALLOWED", "no")

        then:
        def fb = thrown(ForbiddenException)
        fb.errorCode == "SESSION_SHARE_NOT_ALLOWED"
    }

    def "a group session is shareable by a member of the group, in any status (SESSION-GROUP-3)"() {
        when:
        def result = gate.isVisibleTo(session(5L, status), viewerId)

        then:
        1 * groupService.isGroupMember(5L, viewerId) >> true
        result

        where:
        status << SessionStatus.values().toList()
    }

    def "a group session is not shareable by someone who is not a member of the group"() {
        when:
        def result = gate.isVisibleTo(session(5L, status), viewerId)

        then:
        1 * groupService.isGroupMember(5L, viewerId) >> false
        !result

        where:
        status << SessionStatus.values().toList()
    }

    def "an unauthenticated viewer cannot share a group session, with no group lookup"() {
        when:
        def result = gate.isVisibleTo(session(5L), null)

        then:
        !result
        0 * groupService._
    }

    def "a group session's isPublic is irrelevant: membership decides"() {
        when:
        def result = gate.isVisibleTo(session(5L, SessionStatus.SCHEDULED, false), viewerId)

        then:
        1 * groupService.isGroupMember(5L, viewerId) >> true
        result
    }

    def "require answers 404 for a missing session and 403 with the given code for a non-member of a group session"() {
        when:
        gate.require(null, viewerId, "SESSION_NOT_FOUND", "nf", "SESSION_GROUP_MEMBER_REQUIRED", "no")

        then:
        def nf = thrown(NotFoundException)
        nf.errorCode == "SESSION_NOT_FOUND"

        when:
        gate.require(session(5L), viewerId, "SESSION_NOT_FOUND", "nf", "SESSION_GROUP_MEMBER_REQUIRED", "no")

        then:
        1 * groupService.isGroupActive(5L) >> true
        1 * groupService.isGroupMember(5L, viewerId) >> false
        def fb = thrown(ForbiddenException)
        fb.errorCode == "SESSION_GROUP_MEMBER_REQUIRED"
    }

    def "require answers 404 for a group session whose group is no longer active, before the member check"() {
        when:
        gate.require(session(5L), viewerId, "SESSION_NOT_FOUND", "nf", "SESSION_GROUP_MEMBER_REQUIRED", "no")

        then:
        1 * groupService.isGroupActive(5L) >> false
        0 * groupService.isGroupMember(*_)
        thrown(NotFoundException)
    }

    def "require lets a standalone session through for a viewer who has no relation to it"() {
        expect:
        gate.require(session(), viewerId, "SESSION_NOT_FOUND", "nf", "SESSION_SHARE_NOT_ALLOWED", "no") != null
    }
}
