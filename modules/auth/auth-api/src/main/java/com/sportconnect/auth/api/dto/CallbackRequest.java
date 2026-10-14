package com.sportconnect.auth.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * A26: what the client's {@code /auth/callback} page posts after Keycloak redirected back with a code. The PKCE verifier
 * is the secret the client generated before the redirect; Keycloak checks it against the challenge it was given.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CallbackRequest {

    @NotBlank
    @Size(max = 2048)
    private String code;

    @NotBlank
    @Size(min = 43, max = 128, message = "must be a 43 to 128 character PKCE verifier")
    private String codeVerifier;
}
