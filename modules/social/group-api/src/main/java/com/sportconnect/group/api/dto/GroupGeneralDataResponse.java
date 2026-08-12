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
public class GroupGeneralDataResponse {
    private Long groupId;
    private String groupName;
    private Boolean isPrivate;
    private String description;
    private String avatarUrl;
    private String coverUrl;
    private String rules;
    private String schedule;
    private LocalDateTime updatedAt;
}
