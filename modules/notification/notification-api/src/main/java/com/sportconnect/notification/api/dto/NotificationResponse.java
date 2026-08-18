package com.sportconnect.notification.api.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class NotificationResponse {

    private Long id;
    private String type;
    private String entityType;
    private String entityId;
    private List<UUID> actorIds;
    private Integer actorCount;
    private Boolean isRead;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    /** NTF-4: {@code actorIds} resolved to display names, batch-fetched, same order. */
    private List<NotificationActorSummary> actors;

    /**
     * NTF-4: human-readable title of the entity this notification points at — for today's
     * SESSION-only scope, the session's {@code title}. {@code null} for any {@code entityType}
     * this module doesn't yet resolve (forward-compatible with post/group/friend types once
     * their own outbox wiring ships).
     */
    private String entityTitle;
}
