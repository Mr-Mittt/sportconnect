package com.sportconnect.sport.controller;

import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.common.exception.ForbiddenException;
import com.sportconnect.sport.api.dto.CreateSportRequest;
import com.sportconnect.sport.api.dto.CreateUserSportProfileRequest;
import com.sportconnect.sport.api.dto.ResolvedSportAttributeSchema;
import com.sportconnect.sport.api.dto.SportAttributeSchema;
import com.sportconnect.sport.api.dto.SportResponse;
import com.sportconnect.sport.api.dto.UpdateSportRequest;
import com.sportconnect.sport.api.dto.UserSportProfileResponse;
import com.sportconnect.sport.api.service.SportService;
import com.sportconnect.sport.api.service.UserSportProfileService;
import com.sportconnect.sport.service.SportAttributeSchemaLabelResolver;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

@RestController
@RequestMapping("/api/sports")
@RequiredArgsConstructor
@Tag(name = "Sports", description = "Sport catalog (admin-managed) and per-user sport profiles.")
public class SportController {

    private final SportService sportService;
    private final UserSportProfileService profileService;
    private final SportAttributeSchemaLabelResolver labelResolver;

    @Operation(summary = "Create a sport", description = "Admin-only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Sport created"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, or a sport with this name already exists"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not an admin")
    })
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<SportResponse>> createSport(@Valid @RequestBody CreateSportRequest request) {
        SportResponse response = sportService.createSport(request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Sport created successfully", response));
    }

    @Operation(summary = "Get a sport by id", security = {})
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Sport found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Sport not found")
    })
    @GetMapping("/{sportId}")
    public ResponseEntity<ApiResponse<SportResponse>> requireActiveSportById(@PathVariable Long sportId) {
        SportResponse response = sportService.requireActiveSportById(sportId);
        return ResponseEntity.ok(ApiResponse.success("Sport retrieved successfully", response));
    }

    @Operation(summary = "List active sports", security = {})
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Active sports")
    })
    @GetMapping
    public ResponseEntity<ApiResponse<List<SportResponse>>> getAllActiveSports() {
        List<SportResponse> response = sportService.getAllActiveSports();
        return ResponseEntity.ok(ApiResponse.success("Sports retrieved successfully", response));
    }

    @Operation(summary = "List all sports, including inactive", description = "Admin-only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "All sports"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not an admin")
    })
    @GetMapping("/all")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<List<SportResponse>>> getAllSports() {
        List<SportResponse> response = sportService.getAllSports();
        return ResponseEntity.ok(ApiResponse.success("All sports retrieved successfully", response));
    }

    @Operation(summary = "List active sports in a category", security = {})
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Sports in the category")
    })
    @GetMapping("/category/{category}")
    public ResponseEntity<ApiResponse<List<SportResponse>>> getSportsByCategory(@PathVariable String category) {
        List<SportResponse> response = sportService.getSportsByCategory(category);
        return ResponseEntity.ok(ApiResponse.success("Sports retrieved successfully", response));
    }

    @Operation(summary = "Update a sport", description = "Admin-only. Partial update — only non-null fields are applied.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Sport updated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not an admin"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Sport not found")
    })
    @PutMapping("/{sportId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<SportResponse>> updateSport(
            @PathVariable Long sportId,
            @Valid @RequestBody UpdateSportRequest request) {
        SportResponse response = sportService.updateSport(sportId, request);
        return ResponseEntity.ok(ApiResponse.success("Sport updated successfully", response));
    }

    @Operation(summary = "Delete a sport", description = "Admin-only. Soft delete (isActive=false).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Sport deleted"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not an admin"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Sport not found")
    })
    @DeleteMapping("/{sportId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> deleteSport(@PathVariable Long sportId) {
        sportService.deleteSport(sportId);
        return ResponseEntity.ok(ApiResponse.success("Sport deleted successfully", null));
    }

    // Per-sport attribute schema (A9)
    @Operation(summary = "Get a sport's attribute schema",
            description = "The attribute definition tree used to render per-sport profile fields. "
                    + "Labels are resolved to a single string per node for the caller's Accept-Language "
                    + "(A13) — see GET /api/sports/all/{sportId}/attribute-schema for the raw, "
                    + "every-locale document. Returns null data when the sport offers no attributes.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Schema returned"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Sport not found or not active")
    })
    @GetMapping("/{sportId}/attribute-schema")
    // Deliberately the one non-public GET in this controller. /api/sports/** is blanket-permitAll in
    // SecurityConfig (an untickered default dating to the initial commit, whose only recorded
    // rationale is letting unregistered users load the sport list at signup), so without this
    // annotation the endpoint would answer anonymous callers. isAuthenticated() rather than
    // hasRole('USER') because the admin editor (client ADMIN-2) reads this too, and nothing in the
    // codebase grants ADMIN, so an admin-only account may not also hold USER.
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<ApiResponse<ResolvedSportAttributeSchema>> getAttributeSchema(
            @PathVariable Long sportId, Locale locale) {
        // A13: resolution happens here, on the way out of this GET only — never inside
        // SportService.getAttributeSchema, which UserSportProfileServiceImpl also calls on every
        // profile write to filter submitted attributes, a path that never touches labels. `locale`
        // is resolved by Spring's default LocaleResolver (AcceptHeaderLocaleResolver) from the
        // request's Accept-Language header — no manual header parsing needed.
        SportAttributeSchema schema = sportService.getAttributeSchema(sportId);
        ResolvedSportAttributeSchema resolved = labelResolver.resolve(schema, locale);
        return ResponseEntity.ok(ApiResponse.success("Attribute schema retrieved successfully", resolved));
    }

    @Operation(summary = "Get a sport's attribute schema, including for an inactive sport",
            description = "Admin-only. The admin counterpart of "
                    + "GET /api/sports/{sportId}/attribute-schema, which is active-only. "
                    + "Labels are raw here — every locale's Map<locale, text>, unresolved — so the "
                    + "editor (client ADMIN-2) can show and edit them all (A13). "
                    + "Returns null data when the sport offers no attributes.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Schema returned"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not an admin"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Sport not found")
    })
    // A11. Path mirrors this controller's existing convention for "the admin view that includes
    // deactivated rows": GET /api/sports is active-only, GET /api/sports/all is the admin twin. So
    // this reads as "within the full catalogue, that sport's schema". A second endpoint rather than
    // widening the existing GET, because that one must stay active-only — it is what keeps a
    // deactivated sport invisible to member-facing reads (A6/A7), and the member renderer
    // (client SPORT-2) reads it.
    @GetMapping("/all/{sportId}/attribute-schema")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<SportAttributeSchema>> getAttributeSchemaForAdmin(@PathVariable Long sportId) {
        SportAttributeSchema schema = sportService.getAttributeSchemaForAdmin(sportId);
        return ResponseEntity.ok(ApiResponse.success("Attribute schema retrieved successfully", schema));
    }

    @Operation(summary = "Replace a sport's attribute schema",
            description = "Admin-only. Replaces the whole document; there is no partial update. "
                    + "An invalid document is rejected in full and never half-applies.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Schema replaced"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Schema document is invalid"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not an admin"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Sport not found")
    })
    @PutMapping("/{sportId}/attribute-schema")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<SportAttributeSchema>> replaceAttributeSchema(
            @PathVariable Long sportId,
            @RequestBody(required = false) SportAttributeSchema schema) {
        SportAttributeSchema saved = sportService.replaceAttributeSchema(sportId, schema);
        return ResponseEntity.ok(ApiResponse.success("Attribute schema updated successfully", saved));
    }

    // User Sport Profile endpoints
    @Operation(summary = "Create a sport profile for the caller",
            description = "One profile per sport. A20: pass isResume=true to purely reactivate a "
                    + "previously deleted profile for this sport (stored data kept, request body "
                    + "otherwise ignored).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Profile created or resumed"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, already has a profile for this sport, or isResume=true with no deactivated profile to resume"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Sport not found")
    })
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

    @Operation(summary = "Get the caller's own sport profile by id",
            description = "A21: owner-only — the profile's userId must match the authenticated "
                    + "principal. 404 (missing / soft-deleted / dead-sport) is resolved before the "
                    + "ownership check, so a non-owner cannot probe which ids exist.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Profile found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not the profile owner"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Profile not found")
    })
    @GetMapping("/profiles/{profileId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<UserSportProfileResponse>> getProfileById(
            @AuthenticationPrincipal String callerIdStr,
            @PathVariable Long profileId) {
        UserSportProfileResponse response = profileService.getProfileById(profileId);
        if (!UUID.fromString(callerIdStr).equals(response.getUserId())) {
            throw new ForbiddenException("You can only view your own sport profile");
        }
        return ResponseEntity.ok(ApiResponse.success("Profile retrieved successfully", response));
    }

    @Operation(summary = "List the caller's own sport profiles",
            description = "A20: owner-only — the path {userId} must match the authenticated principal. "
                    + "Pass ?includeInactive=true to also get soft-deleted profiles (for the "
                    + "resume-a-deactivated-profile flow); each row carries isActive.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Profiles (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Requested another user's profile list")
    })
    @GetMapping("/profiles/user/{userId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<List<UserSportProfileResponse>>> getUserProfiles(
            @AuthenticationPrincipal String callerIdStr,
            @PathVariable UUID userId,
            @RequestParam(defaultValue = "false") boolean includeInactive) {
        if (!UUID.fromString(callerIdStr).equals(userId)) {
            throw new ForbiddenException("You can only list your own sport profiles");
        }
        List<UserSportProfileResponse> response = profileService.getUserProfiles(userId, includeInactive);
        return ResponseEntity.ok(ApiResponse.success("User profiles retrieved successfully", response));
    }

    @Operation(summary = "Get a user's profile for a specific sport", security = {})
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Profile found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "User has no profile for this sport, or the sport doesn't exist")
    })
    @GetMapping("/profiles/user/{userId}/sport/{sportId}")
    public ResponseEntity<ApiResponse<UserSportProfileResponse>> getUserProfileForSport(
            @PathVariable UUID userId,
            @PathVariable Long sportId) {
        UserSportProfileResponse response = profileService.getUserProfileForSport(userId, sportId);
        return ResponseEntity.ok(ApiResponse.success("Profile retrieved successfully", response));
    }

    @Operation(summary = "Update the caller's sport profile", description = "Ownership-gated — the caller must own the profile. Attribute merge is shallow (top-level keys only).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Profile updated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, or attributes exceed the 4KB size limit"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not the profile owner"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Profile not found")
    })
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

    @Operation(summary = "Delete the caller's sport profile", description = "Ownership-gated — the caller must own the profile.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Profile deleted"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not the profile owner"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Profile not found")
    })
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
