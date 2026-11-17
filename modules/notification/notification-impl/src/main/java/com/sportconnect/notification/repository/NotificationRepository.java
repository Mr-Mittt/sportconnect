package com.sportconnect.notification.repository;

import com.sportconnect.notification.entity.Notification;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface NotificationRepository extends JpaRepository<Notification, Long> {

    Page<Notification> findByRecipientUserIdOrderByUpdatedAtDesc(UUID recipientUserId, Pageable pageable);

    long countByRecipientUserIdAndIsReadFalse(UUID recipientUserId);

    /** The open (unread) aggregation group for a given key, if one exists — see {@code Notification}'s Javadoc. */
    Optional<Notification> findByRecipientUserIdAndTypeAndEntityTypeAndEntityIdAndIsReadFalse(
            UUID recipientUserId, String type, String entityType, String entityId);

    /**
     * NTF-8: hard-deletes every already-read notification of one recipient in a single statement (a derived
     * {@code deleteBy...} would load each row and delete it on its own). Unread rows and other recipients' rows are
     * never matched. Returns how many rows went.
     */
    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("delete from Notification n where n.recipientUserId = :recipientUserId and n.isRead = true")
    int deleteReadByRecipientUserId(@Param("recipientUserId") UUID recipientUserId);
}
