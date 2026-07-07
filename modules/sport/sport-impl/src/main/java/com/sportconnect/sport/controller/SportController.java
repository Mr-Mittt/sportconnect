package com.sportconnect.sport.controller;

import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.sport.api.dto.CreateSportRequest;
import com.sportconnect.sport.api.dto.CreateUserSportProfileRequest;
import com.sportconnect.sport.api.dto.SportResponse;
import com.sportconnect.sport.api.dto.UpdateSportRequest;
import com.sportconnect.sport.api.dto.UserSportProfileResponse;
import com.sportconnect.sport.api.service.SportService;
import com.sportconnect.sport.api.service.UserSportProfileService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
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
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/sports")
@RequiredArgsConstructor
public class SportController {

    private final SportService sportService;
    private final UserSportProfileService profileService;

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<SportResponse>> createSport(@Valid @RequestBody CreateSportRequest request) {
        SportResponse response = sportService.createSport(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Sport created successfully", response));
    }

    @GetMapping("/{sportId}")
    public ResponseEntity<ApiResponse<SportResponse>> getSportById(@PathVariable Long sportId) {
        SportResponse response = sportService.getSportById(sportId);
        return ResponseEntity.ok(ApiResponse.success("Sport retrieved successfully", response));
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<SportResponse>>> getAllActiveSports() {
        List<SportResponse> response = sportService.getAllActiveSports();
        return ResponseEntity.ok(ApiResponse.success("Sports retrieved successfully", response));
    }

    @GetMapping("/all")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<List<SportResponse>>> getAllSports() {
        List<SportResponse> response = sportService.getAllSports();
        return ResponseEntity.ok(ApiResponse.success("All sports retrieved successfully", response));
    }

    @GetMapping("/category/{category}")
    public ResponseEntity<ApiResponse<List<SportResponse>>> getSportsByCategory(@PathVariable String category) {
        List<SportResponse> response = sportService.getSportsByCategory(category);
        return ResponseEntity.ok(ApiResponse.success("Sports retrieved successfully", response));
    }

    @PutMapping("/{sportId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<SportResponse>> updateSport(
            @PathVariable Long sportId,
            @Valid @RequestBody UpdateSportRequest request) {
        SportResponse response = sportService.updateSport(sportId, request);
        return ResponseEntity.ok(ApiResponse.success("Sport updated successfully", response));
    }

    @DeleteMapping("/{sportId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deleteSport(@PathVariable Long sportId) {
        sportService.deleteSport(sportId);
        return ResponseEntity.ok(ApiResponse.success("Sport deleted successfully", null));
    }

    // User Sport Profile endpoints
    @PostMapping("/profiles")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<UserSportProfileResponse>> createProfile(
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody CreateUserSportProfileRequest request) {
        UUID userId = UUID.fromString(userIdStr);
        UserSportProfileResponse response = profileService.createProfile(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Sport profile created successfully", response));
    }

    @GetMapping("/profiles/{profileId}")
    public ResponseEntity<ApiResponse<UserSportProfileResponse>> getProfileById(@PathVariable Long profileId) {
        UserSportProfileResponse response = profileService.getProfileById(profileId);
        return ResponseEntity.ok(ApiResponse.success("Profile retrieved successfully", response));
    }

    @GetMapping("/profiles/user/{userId}")
    public ResponseEntity<ApiResponse<List<UserSportProfileResponse>>> getUserProfiles(@PathVariable UUID userId) {
        List<UserSportProfileResponse> response = profileService.getUserProfiles(userId);
        return ResponseEntity.ok(ApiResponse.success("User profiles retrieved successfully", response));
    }

    @GetMapping("/profiles/user/{userId}/sport/{sportId}")
    public ResponseEntity<ApiResponse<UserSportProfileResponse>> getUserProfileForSport(
            @PathVariable UUID userId,
            @PathVariable Long sportId) {
        UserSportProfileResponse response = profileService.getUserProfileForSport(userId, sportId);
        return ResponseEntity.ok(ApiResponse.success("Profile retrieved successfully", response));
    }

    @PutMapping("/profiles/{profileId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<UserSportProfileResponse>> updateProfile(
            @PathVariable Long profileId,
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody CreateUserSportProfileRequest request) {
        UUID callerId = UUID.fromString(userIdStr);
        UserSportProfileResponse response = profileService.updateProfile(profileId, callerId, request);
        return ResponseEntity.ok(ApiResponse.success("Profile updated successfully", response));
    }

    @DeleteMapping("/profiles/{profileId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> deleteProfile(
            @PathVariable Long profileId,
            @AuthenticationPrincipal String userIdStr) {
        UUID callerId = UUID.fromString(userIdStr);
        profileService.deleteProfile(profileId, callerId);
        return ResponseEntity.ok(ApiResponse.success("Profile deleted successfully", null));
    }
}
