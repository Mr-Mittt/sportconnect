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
public class GroupInfoResponse {
    private Long groupId;
    private String groupName;
    private String rules;
    private String schedule;
    private LocalDateTime updatedAt;
}
