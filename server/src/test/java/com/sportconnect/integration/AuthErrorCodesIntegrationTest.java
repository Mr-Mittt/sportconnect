package com.sportconnect.integration;

import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A8, trimmed by A28 — the auth error codes that remain, through the real request pipeline: the refresh endpoint's
 * 401s and {@code GlobalExceptionHandler}'s exception-to-status-and-code copy. A Spock spec proves each site throws the
 * right coded exception; only this proves the code and status actually reach the HTTP response body.
 *
 * <p>The register, login, verify-email and reset-password codes went with those endpoints (A28): registration, password
 * sign-in, reset and verification are Keycloak's pages now. The Keycloak sign-in codes are in
 * {@link KeycloakCallbackIntegrationTest}.
 */
class AuthErrorCodesIntegrationTest extends BaseIT {

    @Test
    void refresh_withoutCookie_is401_withRefreshTokenMissing() throws Exception {
        mockMvc.perform(post("/api/auth/refresh").with(anonymous()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("REFRESH_TOKEN_MISSING"));
    }

    @Test
    void refresh_unknownToken_is401_withRefreshTokenExpiredOrRevoked() throws Exception {
        // A26: Keycloak does not distinguish "never issued" from "expired" (both invalid_grant), so neither do we;
        // REFRESH_TOKEN_INVALID is no longer returned.
        mockMvc.perform(post("/api/auth/refresh").with(anonymous()).cookie(new Cookie("refreshToken", "not-a-real-token")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Refresh token expired or revoked"))
                .andExpect(jsonPath("$.errorCode").value("REFRESH_TOKEN_EXPIRED_OR_REVOKED"));
    }

    @Test
    void refresh_endedSession_is401_withRefreshTokenExpiredOrRevoked() throws Exception {
        String token = TestKeycloak.startSession(TestKeycloak.Identity.of(UUID.randomUUID()).email("ended@example.com"));
        TestKeycloak.expireSession(token);

        mockMvc.perform(post("/api/auth/refresh").with(anonymous()).cookie(new Cookie("refreshToken", token)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("REFRESH_TOKEN_EXPIRED_OR_REVOKED"));
    }

    @Test
    void removedLegacyEndpoints_areNoLongerPublic() throws Exception {
        for (String path : new String[] {"/api/auth/register", "/api/auth/login", "/api/auth/forgot-password",
                "/api/auth/reset-password", "/api/auth/reset-password/validate", "/api/auth/verify-email",
                "/api/auth/oauth-token"}) {
            mockMvc.perform(post(path).with(anonymous()).contentType("application/json").content("{}"))
                    .andExpect(status().isUnauthorized());
        }
    }
}
