package com.sportconnect.user.controller;

import com.sportconnect.common.auth.SecurityUtils;
import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.user.api.dto.UpdateUserPreferenceRequest;
import com.sportconnect.user.api.dto.UserPreferenceResponse;
import com.sportconnect.user.api.service.UserPreferenceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/users/me/preferences")
@RequiredArgsConstructor
@Tag(name = "User Preferences", description = "The caller's own notification/display preferences.")
public class UserPreferenceController {

    private final UserPreferenceService userPreferenceService;

    @Operation(summary = "Get the caller's preferences", description = "Auto-creates defaults on first access — never 404s for an authenticated user.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Preferences (defaults if never set)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<UserPreferenceResponse>> getPreferences(Authentication authentication) {
        UUID userId = SecurityUtils.extractUserId(authentication);
        UserPreferenceResponse response = userPreferenceService.getPreferences(userId);
        return ResponseEntity.ok(ApiResponse.success("Preferences retrieved successfully", response));
    }

    @Operation(summary = "Update the caller's preferences")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Preferences updated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @PutMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<UserPreferenceResponse>> updatePreferences(
            @Valid @RequestBody UpdateUserPreferenceRequest request,
            Authentication authentication) {
        UUID userId = SecurityUtils.extractUserId(authentication);
        UserPreferenceResponse response = userPreferenceService.updatePreferences(userId, request);
        return ResponseEntity.ok(ApiResponse.success("Preferences updated successfully", response));
    }
}
