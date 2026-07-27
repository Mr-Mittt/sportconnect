package com.sportconnect.user.service

import com.sportconnect.user.entity.Friendship
import com.sportconnect.user.entity.User
import com.sportconnect.user.repository.FriendshipRepository
import com.sportconnect.user.repository.UserRepository
import org.springframework.data.domain.PageRequest
import spock.lang.Specification
import spock.lang.Subject

/**
 * services/chat's cold-start bootstrap pull (services/chat/docs/SYNC_DESIGN.md) depends entirely
 * on this pagination logic being correct. Added 2026-07-27; this class had zero test coverage
 * before (it's not part of the public UserService/UserFriendService contracts).
 */
class InternalUserSyncServiceSpec extends Specification {

    private static final UUID MIN_UUID = new UUID(0L, 0L)

    FriendshipRepository friendshipRepository = Mock()
    UserRepository userRepository = Mock()

    @Subject
    InternalUserSyncService service = new InternalUserSyncService(friendshipRepository, userRepository)

    def friendship(UUID id) {
        Friendship.builder().id(id).userId(UUID.randomUUID()).friendId(UUID.randomUUID()).build()
    }

    def user(UUID id) {
        User.builder().id(id).firstName("First").lastName("Last").isActive(true).roles([] as Set).build()
    }

    // ─── listFriendships ─────────────────────────────────────────────────────

    def "listFriendships treats a blank cursor as the nil-UUID minimum"() {
        when:
        service.listFriendships(cursor, 500)

        then:
        1 * friendshipRepository.findByIdGreaterThanOrderByIdAsc(MIN_UUID, PageRequest.of(0, 500)) >> []

        where:
        cursor << [null, "", "   "]
    }

    def "listFriendships parses a non-blank cursor as a UUID"() {
        given:
        def cursorId = UUID.randomUUID()

        when:
        service.listFriendships(cursorId.toString(), 500)

        then:
        1 * friendshipRepository.findByIdGreaterThanOrderByIdAsc(cursorId, PageRequest.of(0, 500)) >> []
    }

    def "listFriendships clamps the requested limit to MAX_LIMIT (500)"() {
        when:
        service.listFriendships(null, 5000)

        then:
        1 * friendshipRepository.findByIdGreaterThanOrderByIdAsc(MIN_UUID, PageRequest.of(0, 500)) >> []
    }

    def "listFriendships returns a null next_cursor when the page is not full — the last page"() {
        given:
        def rows = [friendship(UUID.randomUUID())]

        when:
        def page = service.listFriendships(null, 5)

        then:
        1 * friendshipRepository.findByIdGreaterThanOrderByIdAsc(MIN_UUID, PageRequest.of(0, 5)) >> rows

        page.nextCursor() == null
        page.items().size() == 1
    }

    def "listFriendships returns the last row's id as next_cursor when the page is full"() {
        given: "exactly as many rows as the requested page size — more rows may exist"
        def lastId = UUID.randomUUID()
        def rows = [friendship(UUID.randomUUID()), friendship(lastId)]

        when:
        def page = service.listFriendships(null, 2)

        then:
        1 * friendshipRepository.findByIdGreaterThanOrderByIdAsc(MIN_UUID, PageRequest.of(0, 2)) >> rows

        page.nextCursor() == lastId.toString()
    }

    // ─── listUsers ───────────────────────────────────────────────────────────

    def "listUsers treats a blank cursor as the nil-UUID minimum"() {
        when:
        service.listUsers(cursor, 500)

        then:
        1 * userRepository.findByIdGreaterThanAndIsActiveTrueOrderByIdAsc(MIN_UUID, PageRequest.of(0, 500)) >> []

        where:
        cursor << [null, "", "   "]
    }

    def "listUsers parses a non-blank cursor as a UUID"() {
        given:
        def cursorId = UUID.randomUUID()

        when:
        service.listUsers(cursorId.toString(), 500)

        then:
        1 * userRepository.findByIdGreaterThanAndIsActiveTrueOrderByIdAsc(cursorId, PageRequest.of(0, 500)) >> []
    }

    def "listUsers clamps the requested limit to MAX_LIMIT (500)"() {
        when:
        service.listUsers(null, 5000)

        then:
        1 * userRepository.findByIdGreaterThanAndIsActiveTrueOrderByIdAsc(MIN_UUID, PageRequest.of(0, 500)) >> []
    }

    def "listUsers returns a null next_cursor when the page is not full — the last page"() {
        given:
        def rows = [user(UUID.randomUUID())]

        when:
        def page = service.listUsers(null, 5)

        then:
        1 * userRepository.findByIdGreaterThanAndIsActiveTrueOrderByIdAsc(MIN_UUID, PageRequest.of(0, 5)) >> rows

        page.nextCursor() == null
        page.items().size() == 1
    }

    def "listUsers returns the last row's id as next_cursor when the page is full"() {
        given: "exactly as many rows as the requested page size — more rows may exist"
        def lastId = UUID.randomUUID()
        def rows = [user(UUID.randomUUID()), user(lastId)]

        when:
        def page = service.listUsers(null, 2)

        then:
        1 * userRepository.findByIdGreaterThanAndIsActiveTrueOrderByIdAsc(MIN_UUID, PageRequest.of(0, 2)) >> rows

        page.nextCursor() == lastId.toString()
    }
}
