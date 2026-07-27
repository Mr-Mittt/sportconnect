package com.sportconnect.group.service

import com.sportconnect.group.entity.GroupMember
import com.sportconnect.group.entity.GroupRole
import com.sportconnect.group.repository.GroupMemberRepository
import com.sportconnect.group.repository.GroupRoleRepository
import org.springframework.data.domain.PageRequest
import spock.lang.Specification
import spock.lang.Subject

/**
 * services/chat's cold-start bootstrap pull (services/chat/docs/SYNC_DESIGN.md) depends entirely
 * on this pagination logic being correct — a wrong cursor/limit/next_cursor here means the chat
 * service either silently misses rows or loops forever. Added 2026-07-27; this class had zero
 * test coverage before (it's not part of the public GroupService contract, so nothing exercised
 * it incidentally the way a controller test might).
 */
class InternalGroupSyncServiceSpec extends Specification {

    GroupMemberRepository groupMemberRepository = Mock()
    GroupRoleRepository groupRoleRepository = Mock()

    @Subject
    InternalGroupSyncService service = new InternalGroupSyncService(groupMemberRepository, groupRoleRepository)

    def member(Long id, Long groupId, Integer roleId) {
        GroupMember.builder().id(id).groupId(groupId).userId(UUID.randomUUID()).roleId(roleId).build()
    }

    def "listGroupMembers treats a blank cursor as starting from the beginning"() {
        when:
        service.listGroupMembers(cursor, 500)

        then: "an empty page still resolves role names for an empty id list, not a skipped call"
        1 * groupMemberRepository.findByIdGreaterThanOrderByIdAsc(0L, PageRequest.of(0, 500)) >> []
        1 * groupRoleRepository.findAllById([]) >> []

        where:
        cursor << [null, "", "   "]
    }

    def "listGroupMembers parses a non-blank cursor as the after-id"() {
        when:
        service.listGroupMembers("42", 500)

        then:
        1 * groupMemberRepository.findByIdGreaterThanOrderByIdAsc(42L, PageRequest.of(0, 500)) >> []
        _ * groupRoleRepository.findAllById(_) >> []
    }

    def "listGroupMembers clamps the requested limit to MAX_LIMIT (500)"() {
        when:
        service.listGroupMembers(null, 5000)

        then:
        1 * groupMemberRepository.findByIdGreaterThanOrderByIdAsc(0L, PageRequest.of(0, 500)) >> []
        _ * groupRoleRepository.findAllById(_) >> []
    }

    def "listGroupMembers returns a null next_cursor when the page is not full — the last page"() {
        given: "fewer members than the requested page size"
        def members = [member(1L, 10L, 1)]

        when:
        def page = service.listGroupMembers(null, 5)

        then:
        1 * groupMemberRepository.findByIdGreaterThanOrderByIdAsc(0L, PageRequest.of(0, 5)) >> members
        1 * groupRoleRepository.findAllById([1]) >> [GroupRole.builder().id(1).roleName("group_member").build()]

        page.nextCursor() == null
        page.items().size() == 1
    }

    def "listGroupMembers returns the last member's id as next_cursor when the page is full"() {
        given: "exactly as many members as the requested page size — more rows may exist"
        def members = [member(1L, 10L, 1), member(2L, 10L, 1)]

        when:
        def page = service.listGroupMembers(null, 2)

        then:
        1 * groupMemberRepository.findByIdGreaterThanOrderByIdAsc(0L, PageRequest.of(0, 2)) >> members
        1 * groupRoleRepository.findAllById([1]) >> [GroupRole.builder().id(1).roleName("group_member").build()]

        page.nextCursor() == "2"
    }

    def "listGroupMembers resolves role names in exactly one batched query regardless of page size (N+1 guard)"() {
        given: "5 members sharing only 2 distinct roles"
        def members = (1..5).collect { member(it as Long, 10L, it <= 3 ? 1 : 2) }

        when:
        def page = service.listGroupMembers(null, 10)

        then: "role names resolved in exactly one call, with only the distinct ids"
        1 * groupMemberRepository.findByIdGreaterThanOrderByIdAsc(0L, PageRequest.of(0, 10)) >> members
        1 * groupRoleRepository.findAllById({ it.toSet() == [1, 2].toSet() }) >> [
                GroupRole.builder().id(1).roleName("group_member").build(),
                GroupRole.builder().id(2).roleName("group_admin").build(),
        ]

        page.items().size() == 5
        page.items().findAll { it.role() == "group_member" }.size() == 3
        page.items().findAll { it.role() == "group_admin" }.size() == 2
    }
}
