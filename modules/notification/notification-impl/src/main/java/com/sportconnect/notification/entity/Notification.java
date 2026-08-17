package com.sportconnect.notification.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

/**
 * One aggregation group of notification-worthy events for a single recipient — see
 * {@code documentation/md/vision/NOTIFICATION_MODULE_VISION.md}. Aggregation key is
 * {@code (recipientUserId, type, entityType, entityId)} scoped to {@code isRead = false}; marking
 * a row read closes that group, and the next matching event starts a fresh row rather than
 * reopening this one — {@code NotificationServiceImpl.recordEvent} owns that upsert logic.
 *
 * <p>{@code entityType}/{@code entityId} are a deliberately untyped {@code String} pair, not a
 * {@code Long}/FK — the entities this can point at span domains with incompatible id types
 * (`Post`/`Group`/`Session` use `Long`, `FriendRequest`/`Friendship` use `UUID`), and this module
 * has no cross-domain dependency to resolve or validate them against.
 */
@Entity
@Table(name = "notifications")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Notification {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "recipient_user_id", nullable = false)
    private UUID recipientUserId;

    @Column(nullable = false, length = 100)
    private String type;

    @Column(name = "entity_type", nullable = false, length = 50)
    private String entityType;

    @Column(name = "entity_id", nullable = false, length = 100)
    private String entityId;

    /** Most-recent-first, deduped, bounded to 3 distinct actors — see {@code UuidListConverter}. */
    @Convert(converter = UuidListConverter.class)
    @Column(name = "actor_ids", length = 500)
    @Builder.Default
    private List<UUID> actorIds = new ArrayList<>();

    /** Total events matched into this group, not distinct-actor count (may exceed actorIds.size()). */
    @Column(name = "actor_count", nullable = false)
    @Builder.Default
    private Integer actorCount = 0;

    @Column(name = "is_read", nullable = false)
    @Builder.Default
    private Boolean isRead = false;

    @CreationTimestamp
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
