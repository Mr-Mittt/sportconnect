package com.sportconnect.group.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class GroupSearchResponse {
    private Long id;
    private Long sportId;
    private String groupName;
    private String description;
    private String avatarUrl;
    private Integer memberCount;
    private String createdByFullName;
    private Boolean isMember;
}
