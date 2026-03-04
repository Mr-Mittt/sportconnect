package com.sportconnect.group.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateGroupSettingsRequest {
    private Boolean allowMemberPosts;
    private Boolean requirePostApproval;
    private Boolean allowMemberInvites;
    private Integer maxMembers;
}
