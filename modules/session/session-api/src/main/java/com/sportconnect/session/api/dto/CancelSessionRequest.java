package com.sportconnect.session.api.dto;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CancelSessionRequest {

    @Size(max = 500, message = "reason must not exceed 500 characters")
    private String reason;
}
