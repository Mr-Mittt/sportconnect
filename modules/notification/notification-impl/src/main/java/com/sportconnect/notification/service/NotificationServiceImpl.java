package com.sportconnect.notification.service;

import com.sportconnect.notification.access.NotificationGate;
import com.sportconnect.notification.api.dto.NotificationResponse;
import com.sportconnect.notification.api.service.NotificationService;
import com.sportconnect.notification.entity.Notification;
import com.sportconnect.notification.repository.NotificationRepository;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class NotificationServiceImpl implements NotificationService {

    /** Bounded actor-list size for the "X, Y and N others" aggregation display — see the vision doc's open questions. */
    private static final int MAX_ACTOR_IDS = 3;

    private final NotificationRepository notificationRepository;
    private final NotificationGate notificationGate;

    @Override
    public Page<NotificationResponse> getNotifications(UUID recipientUserId, Pageable pageable) {
        return notificationRepository.findByRecipientUserIdOrderByUpdatedAtDesc(recipientUserId, pageable)
                .map(this::toResponse);
    }

    @Override
    public long getUnreadCount(UUID recipientUserId) {
        return notificationRepository.countByRecipientUserIdAndIsReadFalse(recipientUserId);
    }

    @Override
    @Transactional
    public void markAsRead(UUID recipientUserId, Long notificationId) {
        Notification notification = notificationRepository.findById(notificationId).orElse(null);
        notification = notificationGate.require(notification, recipientUserId,
                "Notification not found", "You do not have access to this notification");

        if (!Boolean.TRUE.equals(notification.getIsRead())) {
            notification.setIsRead(true);
            notificationRepository.save(notification);
        }
    }

    /**
     * Finds the open (unread) aggregation group for this key, or starts a new one. The actor list
     * dedupes {@code actorId} (moving it to the front if already present) and is trimmed to the
     * {@value #MAX_ACTOR_IDS} most recent distinct actors; {@code actorCount} counts every matched
     * event, so it can exceed the actor list's length once the same actor triggers repeat events.
     */
    @Override
    @Transactional
    public void recordEvent(UUID recipientUserId, String type, String entityType, String entityId, UUID actorId) {
        Notification notification = notificationRepository
                .findByRecipientUserIdAndTypeAndEntityTypeAndEntityIdAndIsReadFalse(
                        recipientUserId, type, entityType, entityId)
                .orElseGet(() -> Notification.builder()
                        .recipientUserId(recipientUserId)
                        .type(type)
                        .entityType(entityType)
                        .entityId(entityId)
                        .build());

        List<UUID> actorIds = new ArrayList<>(notification.getActorIds());
        actorIds.remove(actorId);
        actorIds.add(0, actorId);
        if (actorIds.size() > MAX_ACTOR_IDS) {
            actorIds = actorIds.subList(0, MAX_ACTOR_IDS);
        }
        notification.setActorIds(actorIds);
        notification.setActorCount(notification.getActorCount() + 1);

        notificationRepository.save(notification);
    }

    private NotificationResponse toResponse(Notification notification) {
        return NotificationResponse.builder()
                .id(notification.getId())
                .type(notification.getType())
                .entityType(notification.getEntityType())
                .entityId(notification.getEntityId())
                .actorIds(notification.getActorIds())
                .actorCount(notification.getActorCount())
                .isRead(notification.getIsRead())
                .createdAt(notification.getCreatedAt())
                .updatedAt(notification.getUpdatedAt())
                .build();
    }
}
