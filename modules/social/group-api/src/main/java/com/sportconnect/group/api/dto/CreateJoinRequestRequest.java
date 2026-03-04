package com.sportconnect.group.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CreateJoinRequestRequest {
    
    @NotBlank(message = "Group name is required")
    private String groupName;
    
    @Size(max = 1000, message = "Message cannot exceed 1000 characters")
    private String message;
}
