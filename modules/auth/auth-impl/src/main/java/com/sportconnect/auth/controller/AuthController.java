package com.sportconnect.auth.controller;

import com.sportconnect.auth.api.dto.AuthResponse;
import com.sportconnect.auth.api.dto.ForgotPasswordRequest;
import com.sportconnect.auth.api.dto.LoginRequest;
import com.sportconnect.auth.api.dto.RegisterRequest;
import com.sportconnect.auth.api.dto.ResetPasswordRequest;
import com.sportconnect.auth.api.dto.VerifyEmailRequest;
import com.sportconnect.auth.api.service.AuthService;
import com.sportconnect.auth.config.CookieProperties;
import com.sportconnect.auth.config.JwtProperties;
import com.sportconnect.auth.service.EmailVerificationService;
import com.sportconnect.auth.service.PasswordResetService;
import com.sportconnect.common.auth.SecurityUtils;
import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.common.exception.UnauthorizedException;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private static final String REFRESH_COOKIE_NAME = "refreshToken";

    private final AuthService authService;
    private final EmailVerificationService emailVerificationService;
    private final PasswordResetService passwordResetService;
    private final CookieProperties cookieProperties;
    private final JwtProperties jwtProperties;

    /**
     * Registers a new user and logs them in immediately. Sets the refresh token as an httpOnly
     * cookie (see {@link #buildRefreshCookie}) rather than returning it in the body — the
     * response's {@code data.refreshToken} is always absent (see {@link AuthResponse}).
     */
    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse>> register(@Valid @RequestBody RegisterRequest request) {
        AuthResponse response = authService.register(request);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, buildRefreshCookie(response.getRefreshToken()).toString())
                .body(ApiResponse.success("User registered successfully", response));
    }

    /** Same refresh-token-cookie contract as {@link #register}. */
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(@Valid @RequestBody LoginRequest request) {
        AuthResponse response = authService.login(request);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, buildRefreshCookie(response.getRefreshToken()).toString())
                .body(ApiResponse.success("Login successful", response));
    }

    /**
     * Reads the refresh token from the httpOnly cookie (never the request body — see the module's
     * A2 ticket for the clean-break rationale) and rotates it: the response carries a fresh
     * refresh-token cookie, and the old token is revoked server-side by {@link AuthService}.
     * Missing cookie → 401, not 400 (reused {@link UnauthorizedException} instead of letting
     * Spring's default {@code MissingRequestCookieException} handling produce a 400).
     */
    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<AuthResponse>> refreshToken(
            @CookieValue(value = REFRESH_COOKIE_NAME, required = false) String refreshToken) {
        if (refreshToken == null) {
            throw new UnauthorizedException("Refresh token missing");
        }
        AuthResponse response = authService.refreshToken(refreshToken);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, buildRefreshCookie(response.getRefreshToken()).toString())
                .body(ApiResponse.success("Token refreshed successfully", response));
    }

    /**
     * Derives the caller from the authenticated principal (never a client-supplied id — see the
     * module's A3 ticket, which closed a prior authorization gap where any caller could revoke
     * any other user's session) and revokes all of their refresh tokens. Requires authentication:
     * {@code SecurityConfig} authorizes {@code POST /api/auth/logout} ahead of the broader
     * {@code /api/auth/**} permit.
     */
    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(Authentication authentication) {
        authService.logout(SecurityUtils.extractUserId(authentication));
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, clearRefreshCookie().toString())
                .body(ApiResponse.success("Logout successful", null));
    }

    /**
     * Builds the {@code Set-Cookie} header value carrying the refresh token. {@code Secure} is
     * profile-conditional ({@link CookieProperties}) since it's false in local dev (plain HTTP);
     * {@code Path} scopes it to {@code /api/auth} so it's never sent on unrelated requests.
     */
    private ResponseCookie buildRefreshCookie(String refreshToken) {
        return ResponseCookie.from(REFRESH_COOKIE_NAME, refreshToken)
                .httpOnly(true)
                .secure(cookieProperties.isSecure())
                .sameSite("Strict")
                .path("/api/auth")
                .maxAge(jwtProperties.getRefreshExpiration() / 1000)
                .build();
    }

    /** Same attributes as {@link #buildRefreshCookie}, minus the value, with Max-Age=0 to clear it. */
    private ResponseCookie clearRefreshCookie() {
        return ResponseCookie.from(REFRESH_COOKIE_NAME, "")
                .httpOnly(true)
                .secure(cookieProperties.isSecure())
                .sameSite("Strict")
                .path("/api/auth")
                .maxAge(0)
                .build();
    }

    @PostMapping("/verify-email")
    public ResponseEntity<ApiResponse<Void>> verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        emailVerificationService.verifyEmail(request.getToken());
        return ResponseEntity.ok(ApiResponse.success("Email verified successfully", null));
    }

    @PostMapping("/forgot-password")
    public ResponseEntity<ApiResponse<Void>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        // Note: This endpoint needs user module integration to find user by email
        // For now, it's a placeholder that will be completed when user module is integrated
        return ResponseEntity.ok(ApiResponse.success("If the email exists, a password reset link has been sent", null));
    }

    @PostMapping("/reset-password")
    public ResponseEntity<ApiResponse<Void>> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        UUID userId = passwordResetService.validateAndUseToken(request.getToken());
        passwordResetService.resetPassword(userId, request.getNewPassword());
        return ResponseEntity.ok(ApiResponse.success("Password reset successfully", null));
    }
}
