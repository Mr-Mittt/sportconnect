package com.sportconnect.auth.api.dto;

import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** Body of {@code POST /api/auth/reset-password/validate} (A21): the token from the reset link. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ValidateResetTokenRequest {

    @NotBlank(message = "Token is required")
    private String token;
}
