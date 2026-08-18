package com.sportconnect.notification.service;

import com.sportconnect.notification.access.NotificationGate;
import com.sportconnect.notification.api.dto.NotificationActorSummary;
import com.sportconnect.notification.api.dto.NotificationRecordResult;
import com.sportconnect.notification.api.dto.NotificationResponse;
import com.sportconnect.notification.api.service.NotificationService;
import com.sportconnect.notification.entity.Notification;
import com.sportconnect.notification.repository.NotificationRepository;
import com.sportconnect.session.api.service.SessionService;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.service.UserService;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;
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

    private static final String ENTITY_TYPE_SESSION = "SESSION";

    private final NotificationRepository notificationRepository;
    private final NotificationGate notificationGate;
    private final UserService userService;
    private final SessionService sessionService;

    /**
     * NTF-4: batch-resolves {@code actors}/{@code entityTitle} for the whole page in two calls
     * total (one to {@code user-api}, one to {@code session-api}), never one per row — collects
     * every distinct actorId across the page and every distinct SESSION entityId, looks both up
     * once, then maps each row from the two resulting {@code Map}s.
     */
    @Override
    public Page<NotificationResponse> getNotifications(UUID recipientUserId, Pageable pageable) {
        Page<Notification> notifications =
                notificationRepository.findByRecipientUserIdOrderByUpdatedAtDesc(recipientUserId, pageable);

        List<UUID> actorIds = notifications.getContent().stream()
                .flatMap(n -> n.getActorIds().stream())
                .distinct()
                .collect(Collectors.toList());
        Map<UUID, UserResponse> usersById = actorIds.isEmpty()
                ? Collections.emptyMap()
                : userService.getUsersByIds(actorIds);

        List<Long> sessionIds = notifications.getContent().stream()
                .filter(n -> ENTITY_TYPE_SESSION.equals(n.getEntityType()))
                .map(n -> Long.valueOf(n.getEntityId()))
                .distinct()
                .collect(Collectors.toList());
        Map<Long, String> sessionTitlesById = sessionIds.isEmpty()
                ? Collections.emptyMap()
                : sessionService.getSessionTitlesByIds(sessionIds);

        return notifications.map(n -> toResponse(n, usersById, sessionTitlesById));
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
    public NotificationRecordResult recordEvent(UUID recipientUserId, String type, String entityType, String entityId, UUID actorId) {
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

        Notification saved = notificationRepository.save(notification);
        long unreadCount = notificationRepository.countByRecipientUserIdAndIsReadFalse(recipientUserId);
        return new NotificationRecordResult(saved.getId(), unreadCount);
    }

    private NotificationResponse toResponse(
            Notification notification, Map<UUID, UserResponse> usersById, Map<Long, String> sessionTitlesById) {
        List<NotificationActorSummary> actors = notification.getActorIds().stream()
                .map(usersById::get)
                .filter(Objects::nonNull)
                .map(u -> NotificationActorSummary.builder().id(u.getId()).fullName(u.getFullName()).build())
                .collect(Collectors.toList());

        String entityTitle = ENTITY_TYPE_SESSION.equals(notification.getEntityType())
                ? sessionTitlesById.get(Long.valueOf(notification.getEntityId()))
                : null;

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
                .actors(actors)
                .entityTitle(entityTitle)
                .build();
    }
}
