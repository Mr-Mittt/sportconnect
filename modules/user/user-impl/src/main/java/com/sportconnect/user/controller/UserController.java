package com.sportconnect.user.controller;

import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.user.api.dto.ChangeEmailRequest;
import com.sportconnect.user.api.dto.ChangePasswordRequest;
import com.sportconnect.user.api.dto.ConfirmationCodeRequest;
import com.sportconnect.user.api.dto.ConfirmationCodeResponse;
import com.sportconnect.user.api.dto.EmailVerificationResponse;
import com.sportconnect.user.api.dto.DeactivateAccountRequest;
import com.sportconnect.user.api.dto.NewEmailCodeRequest;
import com.sportconnect.user.api.dto.UpdateProfileRequest;
import com.sportconnect.user.api.dto.UserInfoResponse;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.dto.UserSearchResponse;
import com.sportconnect.user.api.service.UserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/users")
@RequiredArgsConstructor
@Tag(name = "Users", description = "User lookup, profile updates, and account management.")
public class UserController {

    private final UserService userService;

    @Operation(summary = "Search users by keyword")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Search results (paginated)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Keyword shorter than 2 characters"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/search")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<UserSearchResponse>>> searchUsers(
            @RequestParam("q") String keyword,
            @AuthenticationPrincipal String callerIdStr,
            @PageableDefault(size = 20) Pageable pageable) {
        Page<UserSearchResponse> response = userService.searchUsers(UUID.fromString(callerIdStr), keyword, pageable);
        return ResponseEntity.ok(ApiResponse.success("Search results retrieved successfully", response));
    }

    @Operation(summary = "Get the caller's own full profile", description = "Full UserResponse, including PII fields — the only lookup endpoint that returns them. Derives the target from the JWT principal, so there is no id/ownership check to get wrong.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Caller's profile"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/me")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<UserResponse>> getMe(@AuthenticationPrincipal String callerIdStr) {
        UserResponse response = userService.getUserById(UUID.fromString(callerIdStr));
        return ResponseEntity.ok(ApiResponse.success("User retrieved successfully", response));
    }

    @Operation(summary = "Get a user by id", description = "U11: returns the safe PII-free subset (UserInfoResponse), same as the email/username siblings — use GET /api/users/me for the caller's own full profile. U15: includes activeSportIds (the ids of sports this user has an active profile for).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "User found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "User not found")
    })
    @GetMapping("/{userId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<UserInfoResponse>> getUserById(@PathVariable UUID userId) {
        UserResponse response = userService.getUserById(userId);
        return ResponseEntity.ok(ApiResponse.success("User retrieved successfully", userService.toPublicUserInfo(response)));
    }

    @Operation(summary = "Get a user by email", description = "U11: returns the safe PII-free subset (UserInfoResponse) — see GET /api/users/{userId}.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "User found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "User not found")
    })
    @GetMapping("/email/{email}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<UserInfoResponse>> getUserByEmail(@PathVariable String email) {
        UserResponse response = userService.getUserByEmail(email);
        return ResponseEntity.ok(ApiResponse.success("User retrieved successfully", userService.toPublicUserInfo(response)));
    }

    @Operation(summary = "Get a user by username", description = "U11: returns the safe PII-free subset (UserInfoResponse) — see GET /api/users/{userId}.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "User found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "User not found")
    })
    @GetMapping("/username/{username}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<UserInfoResponse>> getUserByUsername(@PathVariable String username) {
        UserResponse response = userService.getUserByUsername(username);
        return ResponseEntity.ok(ApiResponse.success("User retrieved successfully", userService.toPublicUserInfo(response)));
    }

    @Operation(summary = "Update a user's profile", description = "Ownership-gated — the caller must be updating their own profile. Country and region are set with countryId/regionId (U16): with countryId present, regionId replaces the region (absent clears it); a lone regionId is checked against the stored country. The old free-text country field was removed and is silently ignored.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Profile updated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed (height/weight/shoe-size ranges), or an invalid countryId/regionId selection: unknown or inactive country/region, a region outside the country, or a region with no country (U16)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not the profile owner"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "User not found")
    })
    @PutMapping("/{userId}/profile")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<UserResponse>> updateProfile(
            @PathVariable UUID userId,
            @AuthenticationPrincipal String callerIdStr,
            @Valid @RequestBody UpdateProfileRequest request) {
        UserResponse response = userService.updateProfile(userId, UUID.fromString(callerIdStr), request);
        return ResponseEntity.ok(ApiResponse.success("Profile updated successfully", response));
    }

    @Operation(summary = "Change the caller's password", description = "U24. Confirms the caller with exactly one proof (currentPassword, checked by Keycloak, or verificationCode, emailed by POST /me/confirmation-code with purpose CHANGE_PASSWORD), then sets the new password in Keycloak.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Password changed"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, neither/both proofs (CONFIRMATION_REQUIRED), CURRENT_PASSWORD_INCORRECT, VERIFICATION_CODE_INVALID / _EXPIRED / _ATTEMPTS_EXCEEDED, or NEW_PASSWORD_REJECTED"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Account not found or deactivated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "429", description = "Too many wrong passwords (PASSWORD_ATTEMPTS_EXCEEDED)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "503", description = "Keycloak or the code store is unavailable")
    })
    @PutMapping("/me/password")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            @AuthenticationPrincipal String callerIdStr,
            @Valid @RequestBody ChangePasswordRequest request) {
        userService.changePassword(UUID.fromString(callerIdStr), request.getCurrentPassword(), request.getVerificationCode(), request.getNewPassword());
        return ResponseEntity.ok(ApiResponse.success("Password changed successfully", null));
    }

    @Operation(summary = "Deactivate the caller's own account", description = "U22, U24. Confirms the caller with exactly one proof (currentPassword, checked by Keycloak, or verificationCode, emailed by POST /me/confirmation-code with purpose DEACTIVATE), then soft-deletes the account (isActive=false); the A25 gate refuses the caller from the next request. The account can be brought back by signing in again (A26 re-activation).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Account deactivated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Neither/both proofs (CONFIRMATION_REQUIRED), CURRENT_PASSWORD_INCORRECT, or VERIFICATION_CODE_INVALID / _EXPIRED / _ATTEMPTS_EXCEEDED"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Account not found or already deactivated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "429", description = "Too many wrong passwords (PASSWORD_ATTEMPTS_EXCEEDED)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "503", description = "Keycloak or the code store is unavailable")
    })
    @PostMapping("/me/deactivate")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> deactivateOwnAccount(
            @AuthenticationPrincipal String callerIdStr,
            @Valid @RequestBody DeactivateAccountRequest request) {
        userService.deactivateOwnAccount(UUID.fromString(callerIdStr), request.getCurrentPassword(), request.getVerificationCode());
        return ResponseEntity.ok(ApiResponse.success("Account deactivated successfully", null));
    }

    @Operation(summary = "Email the caller a confirmation code", description = "U24. Emails a one-time code (6 digits, valid 15 minutes) that confirms the given purpose in place of the current password. Another code can be requested after 60 seconds.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Code emailed; the body says how long to wait and how long it lasts"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, or the account has no email (VERIFICATION_EMAIL_UNAVAILABLE)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Account not found or deactivated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "429", description = "A code was sent less than 60 seconds ago (VERIFICATION_RESEND_TOO_SOON, errorParams.seconds)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "503", description = "The code store is unavailable")
    })
    @PostMapping("/me/confirmation-code")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<ConfirmationCodeResponse>> sendConfirmationCode(
            @AuthenticationPrincipal String callerIdStr,
            @Valid @RequestBody ConfirmationCodeRequest request) {
        ConfirmationCodeResponse response = userService.sendConfirmationCode(UUID.fromString(callerIdStr), request.getPurpose());
        return ResponseEntity.ok(ApiResponse.success("Confirmation code sent", response));
    }

    @Operation(summary = "Email the caller a verification link", description = "A33. Verifying the email is optional (an unverified account works as normal). Asks Keycloak to email its verification link; if the email is already verified nothing is sent and alreadyVerified is true. At most one mail per 60 seconds.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Mail requested, or already verified"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "The account has no email (VERIFICATION_EMAIL_UNAVAILABLE)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Account not found or deactivated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "429", description = "A mail was requested less than 60 seconds ago (VERIFICATION_RESEND_TOO_SOON)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "503", description = "Keycloak or the cooldown store is unavailable")
    })
    @PostMapping("/me/email-verification")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<EmailVerificationResponse>> sendEmailVerification(
            @AuthenticationPrincipal String callerIdStr) {
        EmailVerificationResponse response = userService.sendEmailVerification(UUID.fromString(callerIdStr));
        return ResponseEntity.ok(ApiResponse.success(response.isAlreadyVerified() ? "Email already verified" : "Verification email requested", response));
    }

    @Operation(summary = "Email a code to the new address of an email change", description = "U26, step 1. Checks that newEmail is free (the A35 rule: dots, +tag and googlemail.com of a Gmail address count as the same mailbox) and emails a 6-digit code, valid 15 minutes and for that exact address only, to it. Nothing is changed. At most one code per 60 seconds and 10 per day.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Code sent"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not an email address, or the same address as the account's (NEW_EMAIL_SAME_AS_CURRENT)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Account not found or deactivated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "Another account holds the address (EMAIL_ALREADY_REGISTERED)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "429", description = "A code was sent less than 60 seconds ago (VERIFICATION_RESEND_TOO_SOON) or the daily limit is reached (NEW_EMAIL_CODE_LIMIT_REACHED); errorParams.seconds"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "503", description = "Keycloak or the code store is unavailable")
    })
    @PostMapping("/me/email-change-code")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<ConfirmationCodeResponse>> sendNewEmailCode(
            @AuthenticationPrincipal String callerIdStr,
            @Valid @RequestBody NewEmailCodeRequest request) {
        ConfirmationCodeResponse response = userService.sendNewEmailCode(UUID.fromString(callerIdStr), request.getNewEmail());
        return ResponseEntity.ok(ApiResponse.success("Confirmation code sent", response));
    }

    @Operation(summary = "Change the caller's email", description = "U26, step 2. Confirms the caller with exactly one proof (currentPassword, or verificationCode emailed to the CURRENT address by POST /me/confirmation-code with purpose CHANGE_EMAIL) and the new mailbox with newEmailCode (from POST /me/email-change-code). Then the account holds the new address as verified, is unlinked from Google (Google avatar removed), signs in with the new address only, and every pending code is dropped.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Email changed"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, NEW_EMAIL_SAME_AS_CURRENT, neither/both proofs (CONFIRMATION_REQUIRED), CURRENT_PASSWORD_INCORRECT, or VERIFICATION_CODE_INVALID / _EXPIRED / _ATTEMPTS_EXCEEDED (for either code)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Account not found or deactivated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "Another account holds the address (EMAIL_ALREADY_REGISTERED)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "429", description = "Too many wrong passwords (PASSWORD_ATTEMPTS_EXCEEDED)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "503", description = "Keycloak or the code store is unavailable")
    })
    @PutMapping("/me/email")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> changeEmail(
            @AuthenticationPrincipal String callerIdStr,
            @Valid @RequestBody ChangeEmailRequest request) {
        userService.changeEmail(UUID.fromString(callerIdStr), request);
        return ResponseEntity.ok(ApiResponse.success("Email changed successfully", null));
    }

    @Operation(summary = "Delete a user", description = "Admin-only. Soft delete (isActive=false).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "User deleted"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not an admin"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "User not found")
    })
    @DeleteMapping("/{userId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deleteUser(@PathVariable UUID userId) {
        userService.deleteUser(userId);
        return ResponseEntity.ok(ApiResponse.success("User deleted successfully", null));
    }

    @Operation(summary = "Check whether an email is already registered", description = "U11: no longer public — unused by the client today (registration surfaces a duplicate-email error from POST /api/auth/register itself instead of a live pre-check). Re-open with permitAll in SecurityConfig if a real pre-registration availability check ever consumes this.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "true if the email is taken"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/check/email")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Boolean>> checkEmailExists(@RequestParam String email) {
        boolean exists = userService.existsByEmail(email);
        return ResponseEntity.ok(ApiResponse.success("Email check completed", exists));
    }

    @Operation(summary = "Check whether a username is already taken", description = "U11: no longer public — same reasoning as GET /api/users/check/email.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "true if the username is taken"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/check/username")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Boolean>> checkUsernameExists(@RequestParam String username) {
        boolean exists = userService.existsByUsername(username);
        return ResponseEntity.ok(ApiResponse.success("Username check completed", exists));
    }
}
