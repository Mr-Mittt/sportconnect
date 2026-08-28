package com.sportconnect.user.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.NotFoundException
import com.sportconnect.user.api.dto.FriendRequestStatus
import com.sportconnect.user.api.event.FriendRequestAcceptedEvent
import com.sportconnect.user.api.event.FriendRequestCreatedEvent
import com.sportconnect.user.entity.FriendRequest
import com.sportconnect.user.entity.Friendship
import com.sportconnect.user.entity.User
import com.sportconnect.user.repository.FriendRequestRepository
import com.sportconnect.user.repository.FriendshipRepository
import com.sportconnect.user.repository.UserRepository
import org.springframework.data.redis.connection.stream.MapRecord
import org.springframework.data.redis.core.StreamOperations
import org.springframework.data.redis.core.StringRedisTemplate
import spock.lang.Specification
import spock.lang.Subject

class UserFriendServiceImplSpec extends Specification {

    FriendRequestRepository friendRequestRepository = Mock()
    FriendshipRepository friendshipRepository = Mock()
    UserRepository userRepository = Mock()
    StringRedisTemplate stringRedisTemplate = Mock()
    // Real instance, not a Mock() — a pure value-converter with no side effects, and using the
    // real one lets tests assert on the actual serialized payload publishDomainEvent produces.
    ObjectMapper objectMapper = new ObjectMapper()
    UserOutboxWriter userOutboxWriter = Mock()

    @Subject
    UserFriendServiceImpl service = new UserFriendServiceImpl(
            friendRequestRepository,
            friendshipRepository,
            userRepository,
            stringRedisTemplate,
            objectMapper,
            userOutboxWriter
    )

    UUID senderId = UUID.randomUUID()
    UUID receiverId = UUID.randomUUID()
    UUID requestId = UUID.randomUUID()

    def user(UUID id, String firstName = "Test", String lastName = "User") {
        User.builder().id(id).firstName(firstName).lastName(lastName).isActive(true).roles([].toSet()).build()
    }

    // ─── sendFriendRequest ───────────────────────────────────────────────────

    def "sendFriendRequest should create request when valid"() {
        when:
        service.sendFriendRequest(senderId, receiverId)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(receiverId) >> Optional.of(user(receiverId))
        1 * friendshipRepository.existsByUserIdAndFriendId(senderId, receiverId) >> false
        1 * friendRequestRepository.findBySenderIdAndReceiverIdAndStatus(receiverId, senderId, FriendRequestStatus.PENDING) >> Optional.empty()
        1 * friendRequestRepository.findBySenderIdAndReceiverId(senderId, receiverId) >> Optional.empty()
        1 * friendRequestRepository.save(_ as FriendRequest)
    }

    def "sendFriendRequest should throw BadRequestException when sending to self"() {
        when:
        service.sendFriendRequest(senderId, senderId)

        then:
        thrown(BadRequestException)
        0 * friendRequestRepository.save(_)
    }

    def "sendFriendRequest should throw NotFoundException when receiver does not exist"() {
        when:
        service.sendFriendRequest(senderId, receiverId)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(receiverId) >> Optional.empty()
        thrown(NotFoundException)
    }

    def "sendFriendRequest should throw BadRequestException when already friends"() {
        when:
        service.sendFriendRequest(senderId, receiverId)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(receiverId) >> Optional.of(user(receiverId))
        1 * friendshipRepository.existsByUserIdAndFriendId(senderId, receiverId) >> true
        thrown(BadRequestException)
    }

    def "sendFriendRequest should throw BadRequestException when request already pending"() {
        given:
        def existing = FriendRequest.builder().id(requestId).senderId(senderId).receiverId(receiverId)
                .status(FriendRequestStatus.PENDING).build()

        when:
        service.sendFriendRequest(senderId, receiverId)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(receiverId) >> Optional.of(user(receiverId))
        1 * friendshipRepository.existsByUserIdAndFriendId(senderId, receiverId) >> false
        1 * friendRequestRepository.findBySenderIdAndReceiverIdAndStatus(receiverId, senderId, FriendRequestStatus.PENDING) >> Optional.empty()
        1 * friendRequestRepository.findBySenderIdAndReceiverId(senderId, receiverId) >> Optional.of(existing)
        thrown(BadRequestException)
        0 * friendRequestRepository.save(_)
    }

    def "sendFriendRequest should reactivate a DECLINED row back to PENDING instead of inserting a second row"() {
        given:
        def existing = FriendRequest.builder().id(requestId).senderId(senderId).receiverId(receiverId)
                .status(FriendRequestStatus.DECLINED).build()

        when:
        service.sendFriendRequest(senderId, receiverId)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(receiverId) >> Optional.of(user(receiverId))
        1 * friendshipRepository.existsByUserIdAndFriendId(senderId, receiverId) >> false
        1 * friendRequestRepository.findBySenderIdAndReceiverIdAndStatus(receiverId, senderId, FriendRequestStatus.PENDING) >> Optional.empty()
        1 * friendRequestRepository.findBySenderIdAndReceiverId(senderId, receiverId) >> Optional.of(existing)
        1 * friendRequestRepository.save({ it.id == requestId && it.status == FriendRequestStatus.PENDING })
    }

    def "sendFriendRequest should reactivate a CANCELLED row back to PENDING"() {
        given:
        def existing = FriendRequest.builder().id(requestId).senderId(senderId).receiverId(receiverId)
                .status(FriendRequestStatus.CANCELLED).build()

        when:
        service.sendFriendRequest(senderId, receiverId)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(receiverId) >> Optional.of(user(receiverId))
        1 * friendshipRepository.existsByUserIdAndFriendId(senderId, receiverId) >> false
        1 * friendRequestRepository.findBySenderIdAndReceiverIdAndStatus(receiverId, senderId, FriendRequestStatus.PENDING) >> Optional.empty()
        1 * friendRequestRepository.findBySenderIdAndReceiverId(senderId, receiverId) >> Optional.of(existing)
        1 * friendRequestRepository.save({ it.id == requestId && it.status == FriendRequestStatus.PENDING })
    }

    def "sendFriendRequest should reactivate a stale ACCEPTED row (friendship since removed) back to PENDING"() {
        given:
        def existing = FriendRequest.builder().id(requestId).senderId(senderId).receiverId(receiverId)
                .status(FriendRequestStatus.ACCEPTED).build()

        when:
        service.sendFriendRequest(senderId, receiverId)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(receiverId) >> Optional.of(user(receiverId))
        // Not currently friends (removeFriend already ran) — passes the earlier "already friends" gate.
        1 * friendshipRepository.existsByUserIdAndFriendId(senderId, receiverId) >> false
        1 * friendRequestRepository.findBySenderIdAndReceiverIdAndStatus(receiverId, senderId, FriendRequestStatus.PENDING) >> Optional.empty()
        1 * friendRequestRepository.findBySenderIdAndReceiverId(senderId, receiverId) >> Optional.of(existing)
        1 * friendRequestRepository.save({ it.id == requestId && it.status == FriendRequestStatus.PENDING })
    }

    def "sendFriendRequest should establish friendship immediately when the receiver already sent the caller a pending request (crossed requests)"() {
        given:
        def reverseRequest = FriendRequest.builder().id(requestId).senderId(receiverId).receiverId(senderId)
                .status(FriendRequestStatus.PENDING).build()

        when:
        service.sendFriendRequest(senderId, receiverId)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(receiverId) >> Optional.of(user(receiverId))
        1 * friendshipRepository.existsByUserIdAndFriendId(senderId, receiverId) >> false
        1 * friendRequestRepository.findBySenderIdAndReceiverIdAndStatus(receiverId, senderId, FriendRequestStatus.PENDING) >> Optional.of(reverseRequest)
        1 * friendRequestRepository.save({ it.id == requestId && it.status == FriendRequestStatus.ACCEPTED })
        2 * friendshipRepository.save(_ as Friendship)
        // Never falls through to the reactivation/fresh-insert path for the (senderId, receiverId) pair.
        0 * friendRequestRepository.findBySenderIdAndReceiverId(_, _)
    }

    // ─── sendFriendRequest: U13 notification outbox ──────────────────────────

    def "sendFriendRequest writes a user.friend_request.created outbox row for the receiver on a fresh request"() {
        when:
        service.sendFriendRequest(senderId, receiverId)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(receiverId) >> Optional.of(user(receiverId))
        1 * friendshipRepository.existsByUserIdAndFriendId(senderId, receiverId) >> false
        1 * friendRequestRepository.findBySenderIdAndReceiverIdAndStatus(receiverId, senderId, FriendRequestStatus.PENDING) >> Optional.empty()
        1 * friendRequestRepository.findBySenderIdAndReceiverId(senderId, receiverId) >> Optional.empty()
        1 * friendRequestRepository.save(_ as FriendRequest)
        1 * userOutboxWriter.record("user.friend_request.created", { FriendRequestCreatedEvent e ->
            e.actorId == senderId && e.recipientUserId == receiverId
        })
        0 * userOutboxWriter.record("user.friend_request.accepted", _)
    }

    def "sendFriendRequest writes a user.friend_request.created outbox row when reactivating a DECLINED row"() {
        given:
        def existing = FriendRequest.builder().id(requestId).senderId(senderId).receiverId(receiverId)
                .status(FriendRequestStatus.DECLINED).build()

        when:
        service.sendFriendRequest(senderId, receiverId)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(receiverId) >> Optional.of(user(receiverId))
        1 * friendshipRepository.existsByUserIdAndFriendId(senderId, receiverId) >> false
        1 * friendRequestRepository.findBySenderIdAndReceiverIdAndStatus(receiverId, senderId, FriendRequestStatus.PENDING) >> Optional.empty()
        1 * friendRequestRepository.findBySenderIdAndReceiverId(senderId, receiverId) >> Optional.of(existing)
        1 * friendRequestRepository.save({ it.id == requestId && it.status == FriendRequestStatus.PENDING })
        1 * userOutboxWriter.record("user.friend_request.created", { FriendRequestCreatedEvent e ->
            e.requestId == requestId && e.actorId == senderId && e.recipientUserId == receiverId
        })
    }

    def "sendFriendRequest writes user.friend_request.accepted (not .created) to the original requester on the crossed-request path"() {
        given:
        def reverseRequest = FriendRequest.builder().id(requestId).senderId(receiverId).receiverId(senderId)
                .status(FriendRequestStatus.PENDING).build()

        when:
        service.sendFriendRequest(senderId, receiverId)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(receiverId) >> Optional.of(user(receiverId))
        1 * friendshipRepository.existsByUserIdAndFriendId(senderId, receiverId) >> false
        1 * friendRequestRepository.findBySenderIdAndReceiverIdAndStatus(receiverId, senderId, FriendRequestStatus.PENDING) >> Optional.of(reverseRequest)
        2 * friendshipRepository.save(_ as Friendship)
        // The original requester (receiverId, who sent the pending reverse request) is the recipient;
        // the caller (senderId, who just reciprocated) is the actor.
        1 * userOutboxWriter.record("user.friend_request.accepted", { FriendRequestAcceptedEvent e ->
            e.requestId == requestId && e.actorId == senderId && e.recipientUserId == receiverId
        })
        0 * userOutboxWriter.record("user.friend_request.created", _)
    }

    def "sendFriendRequest writes no outbox row when the request is rejected as already pending"() {
        given:
        def existing = FriendRequest.builder().id(requestId).senderId(senderId).receiverId(receiverId)
                .status(FriendRequestStatus.PENDING).build()

        when:
        service.sendFriendRequest(senderId, receiverId)

        then:
        1 * userRepository.findByIdAndIsActiveTrue(receiverId) >> Optional.of(user(receiverId))
        1 * friendshipRepository.existsByUserIdAndFriendId(senderId, receiverId) >> false
        1 * friendRequestRepository.findBySenderIdAndReceiverIdAndStatus(receiverId, senderId, FriendRequestStatus.PENDING) >> Optional.empty()
        1 * friendRequestRepository.findBySenderIdAndReceiverId(senderId, receiverId) >> Optional.of(existing)
        thrown(BadRequestException)
        0 * userOutboxWriter.record(_, _)
    }

    // ─── acceptFriendRequest ─────────────────────────────────────────────────

    def "acceptFriendRequest should create two friendship rows on success"() {
        given:
        def request = FriendRequest.builder().id(requestId).senderId(senderId).receiverId(receiverId)
                .status(FriendRequestStatus.PENDING).build()

        when:
        service.acceptFriendRequest(requestId, receiverId)

        then:
        1 * friendRequestRepository.findByIdAndReceiverId(requestId, receiverId) >> Optional.of(request)
        1 * friendRequestRepository.save({ it.status == FriendRequestStatus.ACCEPTED })
        2 * friendshipRepository.save(_ as Friendship)
    }

    def "acceptFriendRequest publishes a friendship.accepted event"() {
        // Regression coverage for services/chat's sync mechanism, added 2026-07-27 — see
        // services/chat/docs/SYNC_DESIGN.md.
        given:
        def request = FriendRequest.builder().id(requestId).senderId(senderId).receiverId(receiverId)
                .status(FriendRequestStatus.PENDING).build()
        def streamOps = Mock(StreamOperations)

        when:
        service.acceptFriendRequest(requestId, receiverId)

        then:
        1 * friendRequestRepository.findByIdAndReceiverId(requestId, receiverId) >> Optional.of(request)
        1 * friendRequestRepository.save({ it.status == FriendRequestStatus.ACCEPTED })
        2 * friendshipRepository.save(_ as Friendship)

        and:
        1 * stringRedisTemplate.opsForStream() >> streamOps
        1 * streamOps.add({ MapRecord record ->
            def payload = objectMapper.readValue(record.value['payload'] as String, Map)
            record.value['event_type'] == 'friendship.accepted' &&
                    payload['user_id'] == senderId.toString() &&
                    payload['friend_id'] == receiverId.toString()
        })
    }

    def "acceptFriendRequest writes a user.friend_request.accepted outbox row to the original sender"() {
        given:
        def request = FriendRequest.builder().id(requestId).senderId(senderId).receiverId(receiverId)
                .status(FriendRequestStatus.PENDING).build()

        when:
        service.acceptFriendRequest(requestId, receiverId)

        then:
        1 * friendRequestRepository.findByIdAndReceiverId(requestId, receiverId) >> Optional.of(request)
        1 * friendRequestRepository.save({ it.status == FriendRequestStatus.ACCEPTED })
        2 * friendshipRepository.save(_ as Friendship)
        1 * userOutboxWriter.record("user.friend_request.accepted", { FriendRequestAcceptedEvent e ->
            e.requestId == requestId && e.actorId == receiverId && e.recipientUserId == senderId
        })
        0 * userOutboxWriter.record("user.friend_request.created", _)
    }

    def "acceptFriendRequest should throw NotFoundException when request not found for receiver"() {
        when:
        service.acceptFriendRequest(requestId, receiverId)

        then:
        1 * friendRequestRepository.findByIdAndReceiverId(requestId, receiverId) >> Optional.empty()
        thrown(NotFoundException)
    }

    def "acceptFriendRequest should throw BadRequestException when request is not pending"() {
        given:
        def request = FriendRequest.builder().id(requestId).senderId(senderId).receiverId(receiverId)
                .status(FriendRequestStatus.DECLINED).build()

        when:
        service.acceptFriendRequest(requestId, receiverId)

        then:
        1 * friendRequestRepository.findByIdAndReceiverId(requestId, receiverId) >> Optional.of(request)
        thrown(BadRequestException)
    }

    // ─── declineFriendRequest ────────────────────────────────────────────────

    def "declineFriendRequest should mark request declined and write no outbox row (reject stays silent)"() {
        given:
        def request = FriendRequest.builder().id(requestId).senderId(senderId).receiverId(receiverId)
                .status(FriendRequestStatus.PENDING).build()

        when:
        service.declineFriendRequest(requestId, receiverId)

        then:
        1 * friendRequestRepository.findByIdAndReceiverId(requestId, receiverId) >> Optional.of(request)
        1 * friendRequestRepository.save({ it.status == FriendRequestStatus.DECLINED })
        0 * userOutboxWriter.record(_, _)
    }

    def "declineFriendRequest should throw NotFoundException when request not found"() {
        when:
        service.declineFriendRequest(requestId, receiverId)

        then:
        1 * friendRequestRepository.findByIdAndReceiverId(requestId, receiverId) >> Optional.empty()
        thrown(NotFoundException)
    }

    // ─── cancelFriendRequest ─────────────────────────────────────────────────

    def "cancelFriendRequest should mark request cancelled"() {
        given:
        def request = FriendRequest.builder().id(requestId).senderId(senderId).receiverId(receiverId)
                .status(FriendRequestStatus.PENDING).build()

        when:
        service.cancelFriendRequest(requestId, senderId)

        then:
        1 * friendRequestRepository.findByIdAndSenderId(requestId, senderId) >> Optional.of(request)
        1 * friendRequestRepository.save({ it.status == FriendRequestStatus.CANCELLED })
    }

    def "cancelFriendRequest should throw NotFoundException when request not found for sender"() {
        when:
        service.cancelFriendRequest(requestId, senderId)

        then:
        1 * friendRequestRepository.findByIdAndSenderId(requestId, senderId) >> Optional.empty()
        thrown(NotFoundException)
    }

    // ─── removeFriend ────────────────────────────────────────────────────────

    def "removeFriend should delete both direction rows"() {
        when:
        service.removeFriend(senderId, receiverId)

        then:
        1 * friendshipRepository.existsByUserIdAndFriendId(senderId, receiverId) >> true
        1 * friendshipRepository.deleteBothDirections(senderId, receiverId)
    }

    def "removeFriend publishes a friendship.removed event"() {
        // Regression coverage for services/chat's sync mechanism, added 2026-07-27.
        given:
        def streamOps = Mock(StreamOperations)

        when:
        service.removeFriend(senderId, receiverId)

        then:
        1 * friendshipRepository.existsByUserIdAndFriendId(senderId, receiverId) >> true
        1 * friendshipRepository.deleteBothDirections(senderId, receiverId)

        and:
        1 * stringRedisTemplate.opsForStream() >> streamOps
        1 * streamOps.add({ MapRecord record ->
            def payload = objectMapper.readValue(record.value['payload'] as String, Map)
            record.value['event_type'] == 'friendship.removed' &&
                    payload['user_id'] == senderId.toString() &&
                    payload['friend_id'] == receiverId.toString()
        })
    }

    def "removeFriend should throw BadRequestException when not friends"() {
        when:
        service.removeFriend(senderId, receiverId)

        then:
        1 * friendshipRepository.existsByUserIdAndFriendId(senderId, receiverId) >> false
        thrown(BadRequestException)
    }

    // ─── getFriends / areFriends / getAcceptedFriendIds ─────────────────────

    def "getFriends should return active friends"() {
        given:
        def friendId = UUID.randomUUID()
        def friendship = Friendship.builder().userId(senderId).friendId(friendId).build()
        def friendUser = user(friendId, "Jane", "Doe")

        when:
        def result = service.getFriends(senderId)

        then:
        1 * friendshipRepository.findByUserId(senderId) >> [friendship]
        1 * userRepository.findAllById([friendId]) >> [friendUser]

        result.size() == 1
        result[0].firstName == "Jane"
    }

    def "areFriends should return true when friendship exists"() {
        when:
        def result = service.areFriends(senderId, receiverId)

        then:
        1 * friendshipRepository.existsByUserIdAndFriendId(senderId, receiverId) >> true
        result == true
    }

    def "areFriends should return false when not friends"() {
        when:
        def result = service.areFriends(senderId, receiverId)

        then:
        1 * friendshipRepository.existsByUserIdAndFriendId(senderId, receiverId) >> false
        result == false
    }

    def "getAcceptedFriendIds should return list of friend UUIDs"() {
        given:
        def friendId = UUID.randomUUID()
        def friendship = Friendship.builder().userId(senderId).friendId(friendId).build()

        when:
        def result = service.getAcceptedFriendIds(senderId)

        then:
        1 * friendshipRepository.findByUserId(senderId) >> [friendship]
        result == [friendId]
    }

    // ─── pending request lists ────────────────────────────────────────────────

    def "getPendingReceivedRequests should return incoming pending requests"() {
        given:
        def request = FriendRequest.builder().id(requestId).senderId(senderId).receiverId(receiverId)
                .status(FriendRequestStatus.PENDING).build()

        when:
        def result = service.getPendingReceivedRequests(receiverId)

        then:
        1 * friendRequestRepository.findByReceiverIdAndStatus(receiverId, FriendRequestStatus.PENDING) >> [request]
        1 * userRepository.findAllById([senderId, receiverId]) >> [user(senderId), user(receiverId)]

        result.size() == 1
        result[0].requestId == requestId
    }

    def "getPendingReceivedRequests should return an empty list without querying users when there are no pending requests"() {
        when:
        def result = service.getPendingReceivedRequests(receiverId)

        then:
        1 * friendRequestRepository.findByReceiverIdAndStatus(receiverId, FriendRequestStatus.PENDING) >> []
        0 * userRepository.findAllById(_)

        result.isEmpty()
    }

    def "getPendingSentRequests should return outgoing pending requests"() {
        given:
        def request = FriendRequest.builder().id(requestId).senderId(senderId).receiverId(receiverId)
                .status(FriendRequestStatus.PENDING).build()

        when:
        def result = service.getPendingSentRequests(senderId)

        then:
        1 * friendRequestRepository.findBySenderIdAndStatus(senderId, FriendRequestStatus.PENDING) >> [request]
        1 * userRepository.findAllById([senderId, receiverId]) >> [user(senderId), user(receiverId)]

        result.size() == 1
        result[0].senderId == senderId
    }
}
