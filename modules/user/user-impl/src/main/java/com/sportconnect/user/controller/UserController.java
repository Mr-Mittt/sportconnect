package com.sportconnect.user.controller;

import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.user.api.dto.ChangePasswordRequest;
import com.sportconnect.user.api.dto.UpdateProfileRequest;
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

    @Operation(summary = "Get a user by id", security = {})
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "User found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "User not found")
    })
    @GetMapping("/{userId}")
    public ResponseEntity<ApiResponse<UserResponse>> getUserById(@PathVariable UUID userId) {
        UserResponse response = userService.getUserById(userId);
        return ResponseEntity.ok(ApiResponse.success("User retrieved successfully", response));
    }

    @Operation(summary = "Get a user by email", security = {})
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "User found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "User not found")
    })
    @GetMapping("/email/{email}")
    public ResponseEntity<ApiResponse<UserResponse>> getUserByEmail(@PathVariable String email) {
        UserResponse response = userService.getUserByEmail(email);
        return ResponseEntity.ok(ApiResponse.success("User retrieved successfully", response));
    }

    @Operation(summary = "Get a user by username", security = {})
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "User found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "User not found")
    })
    @GetMapping("/username/{username}")
    public ResponseEntity<ApiResponse<UserResponse>> getUserByUsername(@PathVariable String username) {
        UserResponse response = userService.getUserByUsername(username);
        return ResponseEntity.ok(ApiResponse.success("User retrieved successfully", response));
    }

    @Operation(summary = "Update a user's profile", description = "Ownership-gated — the caller must be updating their own profile.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Profile updated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed (including height/weight/shoe-size range checks)"),
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

    @Operation(summary = "Change the caller's password")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Password changed"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, or current password is incorrect"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @PutMapping("/me/password")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            @AuthenticationPrincipal String callerIdStr,
            @Valid @RequestBody ChangePasswordRequest request) {
        userService.changePassword(UUID.fromString(callerIdStr), request.getCurrentPassword(), request.getNewPassword());
        return ResponseEntity.ok(ApiResponse.success("Password changed successfully", null));
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

    @Operation(summary = "Check whether an email is already registered", security = {})
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "true if the email is taken")
    })
    @GetMapping("/check/email")
    public ResponseEntity<ApiResponse<Boolean>> checkEmailExists(@RequestParam String email) {
        boolean exists = userService.existsByEmail(email);
        return ResponseEntity.ok(ApiResponse.success("Email check completed", exists));
    }

    @Operation(summary = "Check whether a username is already taken", security = {})
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "true if the username is taken")
    })
    @GetMapping("/check/username")
    public ResponseEntity<ApiResponse<Boolean>> checkUsernameExists(@RequestParam String username) {
        boolean exists = userService.existsByUsername(username);
        return ResponseEntity.ok(ApiResponse.success("Username check completed", exists));
    }
}
