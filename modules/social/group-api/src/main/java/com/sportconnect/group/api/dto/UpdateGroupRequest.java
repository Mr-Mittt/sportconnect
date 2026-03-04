package com.sportconnect.group.api.dto;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateGroupRequest {
    
    @Size(min = 3, max = 100, message = "Group name must be between 3 and 100 characters")
    private String groupName;
    
    @Size(max = 5000, message = "Description cannot exceed 5000 characters")
    private String description;
    
    private String avatarUrl;
    private String coverUrl;
    private Boolean isPrivate;
}
