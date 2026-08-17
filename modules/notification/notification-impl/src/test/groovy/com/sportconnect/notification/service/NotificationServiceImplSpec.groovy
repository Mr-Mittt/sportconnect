package com.sportconnect.notification.service

import com.sportconnect.common.exception.ForbiddenException
import com.sportconnect.common.exception.NotFoundException
import com.sportconnect.notification.access.NotificationGate
import com.sportconnect.notification.entity.Notification
import com.sportconnect.notification.repository.NotificationRepository
import org.springframework.data.domain.PageImpl
import org.springframework.data.domain.PageRequest
import spock.lang.Specification
import spock.lang.Subject

class NotificationServiceImplSpec extends Specification {

    NotificationRepository notificationRepository = Mock()
    NotificationGate notificationGate = Mock()

    @Subject
    NotificationServiceImpl notificationService = new NotificationServiceImpl(notificationRepository, notificationGate)

    UUID recipientId = UUID.randomUUID()
    UUID actorId = UUID.randomUUID()

    def "recordEvent starts a new aggregation row when no open group matches"() {
        given:
        notificationRepository.findByRecipientUserIdAndTypeAndEntityTypeAndEntityIdAndIsReadFalse(
                recipientId, "post.comment.created", "POST", "42") >> Optional.empty()
        notificationRepository.countByRecipientUserIdAndIsReadFalse(recipientId) >> 1L

        when:
        def result = notificationService.recordEvent(recipientId, "post.comment.created", "POST", "42", actorId)

        then:
        1 * notificationRepository.save({ Notification n ->
            n.recipientUserId == recipientId &&
                    n.type == "post.comment.created" &&
                    n.entityType == "POST" &&
                    n.entityId == "42" &&
                    n.actorIds == [actorId] &&
                    n.actorCount == 1
        }) >> { Notification n -> n.tap { id = 99L } }
        result.notificationId() == 99L
        result.unreadCount() == 1L
    }

    def "recordEvent bumps actorCount and prepends a new actor onto an existing open group"() {
        given:
        def priorActor = UUID.randomUUID()
        def existing = Notification.builder()
                .id(5L)
                .recipientUserId(recipientId)
                .type("post.comment.created")
                .entityType("POST")
                .entityId("42")
                .actorIds([priorActor])
                .actorCount(1)
                .isRead(false)
                .build()
        notificationRepository.findByRecipientUserIdAndTypeAndEntityTypeAndEntityIdAndIsReadFalse(
                recipientId, "post.comment.created", "POST", "42") >> Optional.of(existing)
        notificationRepository.countByRecipientUserIdAndIsReadFalse(recipientId) >> 1L

        when:
        def result = notificationService.recordEvent(recipientId, "post.comment.created", "POST", "42", actorId)

        then:
        1 * notificationRepository.save({ Notification n ->
            n.id == 5L && n.actorIds == [actorId, priorActor] && n.actorCount == 2
        }) >> existing
        result.notificationId() == 5L
        result.unreadCount() == 1L
    }

    def "recordEvent dedupes a repeat actor by moving it to the front without growing the list"() {
        given:
        def other = UUID.randomUUID()
        def existing = Notification.builder()
                .id(5L)
                .recipientUserId(recipientId)
                .type("post.comment.created")
                .entityType("POST")
                .entityId("42")
                .actorIds([other, actorId])
                .actorCount(2)
                .isRead(false)
                .build()
        notificationRepository.findByRecipientUserIdAndTypeAndEntityTypeAndEntityIdAndIsReadFalse(
                recipientId, "post.comment.created", "POST", "42") >> Optional.of(existing)
        notificationRepository.countByRecipientUserIdAndIsReadFalse(recipientId) >> 1L

        when:
        notificationService.recordEvent(recipientId, "post.comment.created", "POST", "42", actorId)

        then:
        1 * notificationRepository.save({ Notification n ->
            n.actorIds == [actorId, other] && n.actorCount == 3
        }) >> existing
    }

    def "recordEvent bounds actorIds to the 3 most recent distinct actors"() {
        given:
        def a1 = UUID.randomUUID()
        def a2 = UUID.randomUUID()
        def a3 = UUID.randomUUID()
        def existing = Notification.builder()
                .id(5L)
                .recipientUserId(recipientId)
                .type("post.comment.created")
                .entityType("POST")
                .entityId("42")
                .actorIds([a3, a2, a1])
                .actorCount(3)
                .isRead(false)
                .build()
        notificationRepository.findByRecipientUserIdAndTypeAndEntityTypeAndEntityIdAndIsReadFalse(
                recipientId, "post.comment.created", "POST", "42") >> Optional.of(existing)
        notificationRepository.countByRecipientUserIdAndIsReadFalse(recipientId) >> 1L
        def newActor = UUID.randomUUID()

        when:
        notificationService.recordEvent(recipientId, "post.comment.created", "POST", "42", newActor)

        then:
        1 * notificationRepository.save({ Notification n ->
            n.actorIds == [newActor, a3, a2] && n.actorCount == 4
        }) >> existing
    }

    def "a read row is never matched by recordEvent's lookup — a fresh row starts instead"() {
        given:
        notificationRepository.findByRecipientUserIdAndTypeAndEntityTypeAndEntityIdAndIsReadFalse(
                recipientId, "post.comment.created", "POST", "42") >> Optional.empty()
        notificationRepository.countByRecipientUserIdAndIsReadFalse(recipientId) >> 1L

        when:
        notificationService.recordEvent(recipientId, "post.comment.created", "POST", "42", actorId)

        then:
        1 * notificationRepository.save({ Notification n -> n.id == null && n.actorCount == 1 }) >> { Notification n -> n }
    }

    def "markAsRead flips isRead when the caller owns the notification"() {
        given:
        def notification = Notification.builder().id(7L).recipientUserId(recipientId).isRead(false).build()
        notificationRepository.findById(7L) >> Optional.of(notification)
        notificationGate.require(notification, recipientId, _, _) >> notification

        when:
        notificationService.markAsRead(recipientId, 7L)

        then:
        1 * notificationRepository.save({ Notification n -> n.isRead == true })
    }

    def "markAsRead is a no-op save-wise when already read"() {
        given:
        def notification = Notification.builder().id(7L).recipientUserId(recipientId).isRead(true).build()
        notificationRepository.findById(7L) >> Optional.of(notification)
        notificationGate.require(notification, recipientId, _, _) >> notification

        when:
        notificationService.markAsRead(recipientId, 7L)

        then:
        0 * notificationRepository.save(_)
    }

    def "markAsRead propagates NotFoundException for a nonexistent notification"() {
        given:
        notificationRepository.findById(7L) >> Optional.empty()
        notificationGate.require(null, recipientId, _, _) >> { throw new NotFoundException("Notification not found") }

        when:
        notificationService.markAsRead(recipientId, 7L)

        then:
        thrown(NotFoundException)
    }

    def "markAsRead propagates ForbiddenException for someone else's notification"() {
        given:
        def notification = Notification.builder().id(7L).recipientUserId(UUID.randomUUID()).isRead(false).build()
        notificationRepository.findById(7L) >> Optional.of(notification)
        notificationGate.require(notification, recipientId, _, _) >> { throw new ForbiddenException("You do not have access to this notification") }

        when:
        notificationService.markAsRead(recipientId, 7L)

        then:
        thrown(ForbiddenException)
    }

    def "getNotifications delegates to the repository ordered query"() {
        given:
        def pageable = PageRequest.of(0, 20)
        def notification = Notification.builder()
                .id(1L)
                .recipientUserId(recipientId)
                .type("post.comment.created")
                .entityType("POST")
                .entityId("42")
                .actorIds([actorId])
                .actorCount(1)
                .isRead(false)
                .build()
        notificationRepository.findByRecipientUserIdOrderByUpdatedAtDesc(recipientId, pageable) >>
                new PageImpl<>([notification])

        when:
        def result = notificationService.getNotifications(recipientId, pageable)

        then:
        result.content.size() == 1
        result.content[0].id == 1L
        result.content[0].actorIds == [actorId]
    }

    def "getUnreadCount delegates to the repository"() {
        given:
        notificationRepository.countByRecipientUserIdAndIsReadFalse(recipientId) >> 3L

        expect:
        notificationService.getUnreadCount(recipientId) == 3L
    }
}
