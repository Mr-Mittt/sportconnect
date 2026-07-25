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
public class RejectInvitationRequest {

    @Size(max = 500, message = "Reason cannot exceed 500 characters")
    private String reason;
}
