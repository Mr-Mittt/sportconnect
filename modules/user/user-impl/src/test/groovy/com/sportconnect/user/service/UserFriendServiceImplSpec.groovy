package com.sportconnect.user.service

import com.sportconnect.common.exception.BadRequestException
import com.sportconnect.common.exception.NotFoundException
import com.sportconnect.user.api.dto.FriendRequestStatus
import com.sportconnect.user.entity.FriendRequest
import com.sportconnect.user.entity.Friendship
import com.sportconnect.user.entity.User
import com.sportconnect.user.repository.FriendRequestRepository
import com.sportconnect.user.repository.FriendshipRepository
import com.sportconnect.user.repository.UserRepository
import spock.lang.Specification
import spock.lang.Subject

class UserFriendServiceImplSpec extends Specification {

    FriendRequestRepository friendRequestRepository = Mock()
    FriendshipRepository friendshipRepository = Mock()
    UserRepository userRepository = Mock()

    @Subject
    UserFriendServiceImpl service = new UserFriendServiceImpl(
            friendRequestRepository,
            friendshipRepository,
            userRepository
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
        1 * friendRequestRepository.findBySenderIdAndReceiverId(senderId, receiverId) >> Optional.of(existing)
        1 * friendRequestRepository.save({ it.id == requestId && it.status == FriendRequestStatus.PENDING })
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

    def "declineFriendRequest should mark request declined"() {
        given:
        def request = FriendRequest.builder().id(requestId).senderId(senderId).receiverId(receiverId)
                .status(FriendRequestStatus.PENDING).build()

        when:
        service.declineFriendRequest(requestId, receiverId)

        then:
        1 * friendRequestRepository.findByIdAndReceiverId(requestId, receiverId) >> Optional.of(request)
        1 * friendRequestRepository.save({ it.status == FriendRequestStatus.DECLINED })
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
