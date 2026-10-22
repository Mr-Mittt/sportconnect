package com.sportconnect.auth.controller;

import com.sportconnect.auth.api.dto.AuthResponse;
import com.sportconnect.auth.api.dto.CallbackRequest;
import com.sportconnect.auth.api.dto.ForgotPasswordRequest;
import com.sportconnect.auth.api.dto.LoginRequest;
import com.sportconnect.auth.api.dto.ReactivationTicketRequest;
import com.sportconnect.auth.api.dto.RegisterRequest;
import com.sportconnect.auth.api.dto.ResetPasswordRequest;
import com.sportconnect.auth.api.dto.ValidateResetTokenRequest;
import com.sportconnect.auth.api.dto.VerifyEmailRequest;
import com.sportconnect.auth.api.service.AuthService;
import com.sportconnect.auth.config.CookieProperties;
import com.sportconnect.auth.config.JwtProperties;
import com.sportconnect.auth.service.EmailVerificationService;
import com.sportconnect.auth.service.PasswordResetService;
import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.common.exception.UnauthorizedException;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CookieValue;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;


@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Tag(name = "Auth", description = "Registration, login, token refresh, logout, and password/email verification.")
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
    @Operation(summary = "Register a new user", security = {},
            description = "Registers a new user and logs them in immediately. Sets the refresh token as an httpOnly cookie rather than returning it in the body.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Registered and logged in"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "Email already registered (errorCode EMAIL_ALREADY_REGISTERED)")
    })
    @PostMapping("/register")
    public ResponseEntity<ApiResponse<AuthResponse>> register(@Valid @RequestBody RegisterRequest request) {
        AuthResponse response = authService.register(request);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, buildRefreshCookie(response).toString())
                .body(ApiResponse.success("User registered successfully", response));
    }

    /** Same refresh-token-cookie contract as {@link #register}. */
    @Operation(summary = "Log in", security = {},
            description = "Same refresh-token-cookie contract as register.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Login successful"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Invalid email or password (errorCode INVALID_CREDENTIALS), or correct credentials for a deactivated account (errorCode ACCOUNT_DEACTIVATED, no tokens issued -- see /reactivate)")
    })
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(@Valid @RequestBody LoginRequest request) {
        AuthResponse response = authService.login(request);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, buildRefreshCookie(response).toString())
                .body(ApiResponse.success("Login successful", response));
    }

    /**
     * A26: completes the sign-in the client started at Keycloak (Authorization Code + PKCE). Public: the caller has no
     * token yet. Same cookie contract as before (A2): the refresh token goes only into the httpOnly cookie. A deactivated
     * password user gets {@code 401 ACCOUNT_DEACTIVATED} with a {@code reactivationTicket} and no cookie.
     */
    @Operation(summary = "Complete a Keycloak sign-in", security = {},
            description = "Exchanges the authorization code and PKCE verifier with Keycloak, creates the user on first sign-in, and returns the access token with the refresh token in an httpOnly cookie. A deactivated account that signed in with a social provider is re-activated; one that signed in with a password gets ACCOUNT_DEACTIVATED and a reactivationTicket (errorParams) instead.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Signed in"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, or the identity has no email and no usable phone (IDENTIFIER_REQUIRED)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Code or verifier refused (AUTH_CODE_INVALID), or a deactivated password account (ACCOUNT_DEACTIVATED, errorParams.reactivationTicket)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "PHONE_ALREADY_USED or EMAIL_ALREADY_REGISTERED at first sign-in"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "503", description = "Keycloak or the ticket store is not answering")
    })
    @PostMapping("/callback")
    public ResponseEntity<ApiResponse<AuthResponse>> callback(@Valid @RequestBody CallbackRequest request) {
        AuthResponse response = authService.callback(request.getCode(), request.getCodeVerifier());
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, buildRefreshCookie(response).toString())
                .body(ApiResponse.success("Login successful", response));
    }

    /**
     * A26: the user's confirmation after the sign-in answered {@code ACCOUNT_DEACTIVATED}. The ticket stands in for the
     * credentials (the Keycloak session is already open and parked); same cookie contract as {@link #callback}.
     */
    @Operation(summary = "Re-activate a deactivated account with a ticket", security = {},
            description = "Takes the reactivationTicket from an ACCOUNT_DEACTIVATED answer. Re-activates the account and releases the parked session (same cookie contract as callback). A ticket works once and lives a few minutes.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Account active and signed in"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Unknown, expired or used ticket (REACTIVATION_TICKET_INVALID)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "503", description = "Keycloak or the ticket store is not answering")
    })
    @PostMapping("/reactivate")
    public ResponseEntity<ApiResponse<AuthResponse>> reactivate(@Valid @RequestBody ReactivationTicketRequest request) {
        AuthResponse response = authService.reactivate(request.getTicket());
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, buildRefreshCookie(response).toString())
                .body(ApiResponse.success("Account re-activated", response));
    }

    /**
     * A26: the user declined. Always 200, so a caller cannot tell whether a ticket existed.
     */
    @Operation(summary = "Decline re-activation", security = {},
            description = "Drops the ticket and ends the parked Keycloak session. Always answers 200, whether or not the ticket existed.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Done"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed")
    })
    @PostMapping("/reactivate/cancel")
    public ResponseEntity<ApiResponse<Void>> cancelReactivation(@Valid @RequestBody ReactivationTicketRequest request) {
        authService.cancelReactivation(request.getTicket());
        return ResponseEntity.ok(ApiResponse.success("Re-activation cancelled", null));
    }

    /**
     * Reads the refresh token from the httpOnly cookie (never the request body — see the module's
     * A2 ticket for the clean-break rationale) and rotates it: the response carries a fresh
     * refresh-token cookie, and the old token is rotated out by Keycloak (A26: the cookie holds Keycloak's refresh token,
     * and {@link AuthService} applies the per-request gate to the new access token).
     * Missing cookie → 401, not 400 (reused {@link UnauthorizedException} instead of letting
     * Spring's default {@code MissingRequestCookieException} handling produce a 400).
     */
    @Operation(summary = "Rotate the refresh token", security = {},
            description = "Reads the refresh token from the httpOnly cookie (never the request body) and rotates it: the response carries a fresh refresh-token cookie, and the old token is revoked server-side.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Token refreshed"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Refresh token cookie missing, expired, or revoked")
    })
    @PostMapping("/refresh")
    public ResponseEntity<ApiResponse<AuthResponse>> refreshToken(
            @CookieValue(value = REFRESH_COOKIE_NAME, required = false) String refreshToken) {
        if (refreshToken == null) {
            throw new UnauthorizedException("REFRESH_TOKEN_MISSING", "Refresh token missing", null);
        }
        AuthResponse response = authService.refreshToken(refreshToken);
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, buildRefreshCookie(response).toString())
                .body(ApiResponse.success("Token refreshed successfully", response));
    }

    /**
     * A26: ends the Keycloak SSO session the refresh-token cookie belongs to, then clears the cookie. Public and driven by
     * the cookie, not by a Bearer token: the 5-minute access token is often already expired when the user clicks "log
     * out", and the cookie ({@code SameSite=Strict}, {@code Path=/api/auth}) cannot be sent by another site, so this cannot
     * be used to log someone out from outside. No cookie, or a session Keycloak already dropped, is still a 200.
     * When Keycloak is unreachable the answer is 503 and the cookie is kept, so the logout can be retried instead of
     * leaving a live session the user believes is over.
     */
    @Operation(summary = "Log out", security = {},
            description = "Ends the Keycloak session the refresh-token cookie belongs to and clears the cookie. Idempotent: no cookie, or an already ended session, is a 200. 503 when Keycloak cannot be reached (the cookie is kept so the call can be retried).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Logged out"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "503", description = "Keycloak is not answering; the session may still be alive")
    })
    @PostMapping("/logout")
    public ResponseEntity<ApiResponse<Void>> logout(
            @CookieValue(value = REFRESH_COOKIE_NAME, required = false) String refreshToken) {
        if (refreshToken != null && !refreshToken.isBlank()) {
            authService.endSession(refreshToken);
        }
        return ResponseEntity.ok()
                .header(HttpHeaders.SET_COOKIE, clearRefreshCookie().toString())
                .body(ApiResponse.success("Logout successful", null));
    }

    /**
     * Builds the {@code Set-Cookie} header value carrying the refresh token. {@code Secure} is
     * profile-conditional ({@link CookieProperties}) since it's false in local dev (plain HTTP);
     * {@code Path} scopes it to {@code /api/auth} so it's never sent on unrelated requests. {@code Max-Age} is
     * the refresh token's own lifetime (A26: Keycloak's {@code refresh_expires_in}) when the response carries it.
     */
    private ResponseCookie buildRefreshCookie(AuthResponse response) {
        long maxAgeSeconds = response.getRefreshTokenMaxAgeSeconds() != null
                ? response.getRefreshTokenMaxAgeSeconds()
                : jwtProperties.getRefreshExpiration() / 1000;
        return ResponseCookie.from(REFRESH_COOKIE_NAME, response.getRefreshToken())
                .httpOnly(true)
                .secure(cookieProperties.isSecure())
                .sameSite("Strict")
                .path("/api/auth")
                .maxAge(maxAgeSeconds)
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

    @Operation(summary = "Verify an email address", security = {},
            description = "Consumes the token sent in the verification email.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Email verified"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, already verified, or token expired"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Invalid verification token")
    })
    @PostMapping("/verify-email")
    public ResponseEntity<ApiResponse<Void>> verifyEmail(@Valid @RequestBody VerifyEmailRequest request) {
        emailVerificationService.verifyEmail(request.getToken());
        return ResponseEntity.ok(ApiResponse.success("Email verified successfully", null));
    }

    @Operation(summary = "Request a password reset email", security = {},
            description = "Emails a one-hour reset link when an account (active or deactivated) has this email. The answer is identical whether or not it does, so it cannot be used to discover which emails are registered.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Always returned, regardless of whether the email exists"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed")
    })
    @PostMapping("/forgot-password")
    public ResponseEntity<ApiResponse<Void>> forgotPassword(@Valid @RequestBody ForgotPasswordRequest request) {
        passwordResetService.requestReset(request.getEmail());
        return ResponseEntity.ok(ApiResponse.success("If the email exists, a password reset link has been sent", null));
    }

    @Operation(summary = "Reset a password", security = {},
            description = "Consumes the token sent in the reset-password email.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Password reset"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, token already used, or token expired"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Invalid reset token")
    })
    @PostMapping("/reset-password")
    public ResponseEntity<ApiResponse<Void>> resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
        passwordResetService.completeReset(request.getToken(), request.getNewPassword());
        return ResponseEntity.ok(ApiResponse.success("Password reset successfully", null));
    }

    @Operation(summary = "Check that a password-reset link can still be used", security = {},
            description = "Does not consume the token. Every unusable token (unknown, already used, expired) gets the same 404 RESET_TOKEN_INVALID, so this cannot be used to learn why a token failed.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "The token can be used"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "The token cannot be used (unknown, used or expired)")
    })
    @PostMapping("/reset-password/validate")
    public ResponseEntity<ApiResponse<Void>> validateResetToken(@Valid @RequestBody ValidateResetTokenRequest request) {
        passwordResetService.checkToken(request.getToken());
        return ResponseEntity.ok(ApiResponse.success("Reset token is valid", null));
    }
}
