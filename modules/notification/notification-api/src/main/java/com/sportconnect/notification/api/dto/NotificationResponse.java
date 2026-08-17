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
}
