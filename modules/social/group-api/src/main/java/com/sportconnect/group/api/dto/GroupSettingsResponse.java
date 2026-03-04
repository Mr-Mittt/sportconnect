package com.sportconnect.group.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GroupSettingsResponse {
    private Long id;
    private Long groupId;
    private Boolean allowMemberPosts;
    private Boolean requirePostApproval;
    private Boolean allowMemberInvites;
    private Integer maxMembers;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
