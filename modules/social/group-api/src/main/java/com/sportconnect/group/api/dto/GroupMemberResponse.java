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
public class GroupMemberResponse {
    private Long id;
    private Long groupId;
    private UUID userId;
    private String userFullName;
    private String userAvatarUrl;
    private Integer roleId;
    private String roleName;
    private Integer roleLevel;
    private LocalDateTime joinedAt;
}
