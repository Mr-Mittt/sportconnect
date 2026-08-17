package com.sportconnect.notification.repository;

import com.sportconnect.notification.entity.Notification;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    Page<Notification> findByRecipientUserIdOrderByUpdatedAtDesc(UUID recipientUserId, Pageable pageable);

    long countByRecipientUserIdAndIsReadFalse(UUID recipientUserId);

    /** The open (unread) aggregation group for a given key, if one exists — see {@code Notification}'s Javadoc. */
    Optional<Notification> findByRecipientUserIdAndTypeAndEntityTypeAndEntityIdAndIsReadFalse(
            UUID recipientUserId, String type, String entityType, String entityId);
}
