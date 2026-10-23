package com.sportconnect.user.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/** Answer to {@code POST /api/users/me/email-verification} (A33): the mail was sent, or the email was already verified. */
@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class EmailVerificationResponse {

    /** True when Keycloak already holds the email as verified: nothing was sent and the profile now says so. */
    private boolean alreadyVerified;

    /** Seconds before another mail can be requested; 0 when {@link #alreadyVerified}. */
    private long resendAfterSeconds;
}
