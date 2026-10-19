package com.sportconnect.user.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Answer to {@code POST /api/users/me/confirmation-code} (U24): the code was emailed; the client counts these down. */
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ConfirmationCodeResponse {

    /** Seconds before another code can be requested. */
    private long resendAfterSeconds;

    /** Seconds the emailed code stays valid. */
    private long expiresInSeconds;
}
