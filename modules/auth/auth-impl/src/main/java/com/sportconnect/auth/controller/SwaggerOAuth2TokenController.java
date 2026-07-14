package com.sportconnect.auth.controller;

import com.sportconnect.auth.api.dto.AuthResponse;
import com.sportconnect.auth.api.dto.LoginRequest;
import com.sportconnect.auth.api.service.AuthService;
import io.swagger.v3.oas.annotations.Hidden;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Adapter endpoint letting Swagger UI's OAuth2 "password" flow Authorize dialog accept a plain
 * email + password and come away with a working bearer token — the real client never needs to
 * know OAuth2 exists here; this exists purely so a developer exploring the API docs can type
 * credentials into one dialog instead of calling {@code /api/auth/login} manually and pasting the
 * access token in by hand.
 *
 * <p>Swagger UI POSTs {@code grant_type=password&username=<email>&password=<password>} as
 * {@code application/x-www-form-urlencoded} to whatever URL {@link
 * com.sportconnect.config.OpenApiConfig} registers as this security scheme's token URL, and
 * expects the standard OAuth2 token response shape back ({@link OAuth2TokenResponse}). This
 * controller is purely that translation layer — it delegates to the exact same {@link
 * AuthService#login} the real {@code /api/auth/login} endpoint uses, so credential validation,
 * account-active checks, etc. all behave identically. {@code grant_type} is accepted but not
 * validated (this endpoint has exactly one caller — Swagger UI's own dialog — so there's nothing
 * to defend against).
 *
 * <p>{@code @Hidden} keeps this out of the rendered endpoint list in Swagger UI — it's plumbing
 * for the Authorize button, not an endpoint a client dev would ever call directly via
 * "Try it out". Already covered by {@code SecurityConfig}'s existing {@code /api/auth/**}
 * permitAll rule — no security config change needed.
 */
@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Hidden
public class SwaggerOAuth2TokenController {

    private final AuthService authService;

    @PostMapping(value = "/oauth-token", consumes = MediaType.APPLICATION_FORM_URLENCODED_VALUE)
    public OAuth2TokenResponse issueToken(
            @RequestParam(value = "grant_type", required = false) String grantType,
            @RequestParam("username") String username,
            @RequestParam("password") String password) {
        LoginRequest loginRequest = LoginRequest.builder()
                .email(username)
                .password(password)
                .build();
        AuthResponse response = authService.login(loginRequest);
        // AuthResponse.expiresIn is milliseconds (app.jwt.expiration in application.yml) —
        // OAuth2's expires_in is defined in whole seconds (RFC 6749 §4.2.2).
        long expiresInSeconds = response.getExpiresIn() / 1000;
        return new OAuth2TokenResponse(response.getAccessToken(), "bearer", expiresInSeconds);
    }
}
