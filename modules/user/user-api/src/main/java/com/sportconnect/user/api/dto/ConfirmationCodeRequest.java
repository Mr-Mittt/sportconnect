package com.sportconnect.user.api.dto;

import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

/** Body of {@code POST /api/users/me/confirmation-code} (U24): what the emailed code will confirm. */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConfirmationCodeRequest {

    @NotNull(message = "Purpose is required")
    private ConfirmationPurpose purpose;
}
