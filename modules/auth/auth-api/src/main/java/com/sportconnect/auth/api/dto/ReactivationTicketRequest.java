package com.sportconnect.auth.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/** A26: the body of {@code POST /api/auth/reactivate} and {@code /reactivate/cancel}: the ticket from {@code ACCOUNT_DEACTIVATED}. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ReactivationTicketRequest {

    @NotBlank
    @Size(max = 256)
    private String ticket;
}
