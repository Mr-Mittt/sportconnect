package com.sportconnect.group.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.UUID;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GroupResponse {
    private Long id;
    private String groupName;
    private String description;
    private String avatarUrl;
    private String coverUrl;
    private Boolean isPrivate;
    private Boolean isActive;
    private UUID createdBy;
    private String createdByFullName;
    private Integer memberCount;
    private String currentUserRole;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
