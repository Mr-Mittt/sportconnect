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
    private String groupTypeName;
    private Integer maxMembers;
    private Boolean autoGenerateSessions;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
