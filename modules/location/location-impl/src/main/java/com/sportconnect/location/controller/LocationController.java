package com.sportconnect.location.controller;

import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.location.api.dto.CreateLocationRequest;
import com.sportconnect.location.api.dto.LocationResponse;
import com.sportconnect.location.api.dto.ResolveMapsUrlRequest;
import com.sportconnect.location.api.dto.ResolvedMapsUrlResponse;
import com.sportconnect.location.api.service.LocationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/locations")
@RequiredArgsConstructor
@Tag(name = "Locations", description = "Shared, sport-scoped venue directory used by sessions and group recurrence.")
public class LocationController {

    private final LocationService locationService;

    @Operation(summary = "Create a location", description = "Any authenticated user may add a venue.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Location created"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @PostMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<LocationResponse>> createLocation(
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody CreateLocationRequest request) {
        UUID userId = UUID.fromString(userIdStr);
        LocationResponse response = locationService.createLocation(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Location created successfully", response));
    }

    @Operation(summary = "Get a location by id")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Location found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Location not found")
    })
    @GetMapping("/{locationId}")
    public ResponseEntity<ApiResponse<LocationResponse>> getLocation(@PathVariable Long locationId) {
        LocationResponse response = locationService.getLocation(locationId);
        return ResponseEntity.ok(ApiResponse.success("Location retrieved successfully", response));
    }

    @Operation(summary = "Search locations for a sport", description = "Typeahead search, always scoped to a single sport.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Matching locations (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "sportId is required")
    })
    @GetMapping("/search")
    public ResponseEntity<ApiResponse<Page<LocationResponse>>> searchLocations(
            @RequestParam Long sportId,
            @RequestParam(required = false) String q,
            Pageable pageable) {
        Page<LocationResponse> response = locationService.searchLocations(sportId, q, pageable);
        return ResponseEntity.ok(ApiResponse.success("Locations retrieved successfully", response));
    }

    @Operation(summary = "Resolve a pasted Google Maps URL", description = "Parses (or resolves, for short links) coordinates from the URL. Does not persist anything.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Resolved (latitude/longitude may be null if not detected)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not a valid or supported Maps URL"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @PostMapping("/resolve-maps-url")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<ResolvedMapsUrlResponse>> resolveGoogleMapsUrl(
            @Valid @RequestBody ResolveMapsUrlRequest request) {
        ResolvedMapsUrlResponse response = locationService.resolveGoogleMapsUrl(request.getUrl());
        return ResponseEntity.ok(ApiResponse.success("URL resolved", response));
    }

    @Operation(summary = "Favorite a location", description = "Requires an active sport profile for the location's sport.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Favorited"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Already favorited, or no active profile for this sport"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Location not found")
    })
    @PostMapping("/{locationId}/favorite")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> favoriteLocation(
            @PathVariable Long locationId,
            @AuthenticationPrincipal String userIdStr) {
        locationService.favoriteLocation(UUID.fromString(userIdStr), locationId);
        return ResponseEntity.ok(ApiResponse.success("Location favorited successfully", null));
    }

    @Operation(summary = "Unfavorite a location")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Unfavorited"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not currently favorited"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @DeleteMapping("/{locationId}/favorite")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> unfavoriteLocation(
            @PathVariable Long locationId,
            @AuthenticationPrincipal String userIdStr) {
        locationService.unfavoriteLocation(UUID.fromString(userIdStr), locationId);
        return ResponseEntity.ok(ApiResponse.success("Location unfavorited successfully", null));
    }

    @Operation(summary = "List the caller's favorite locations for a sport")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Favorite locations (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "sportId is required"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/favorites")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<LocationResponse>>> getFavoriteLocations(
            @AuthenticationPrincipal String userIdStr,
            @RequestParam Long sportId,
            Pageable pageable) {
        Page<LocationResponse> response = locationService.getFavoriteLocations(
                UUID.fromString(userIdStr), sportId, pageable);
        return ResponseEntity.ok(ApiResponse.success("Favorite locations retrieved successfully", response));
    }
}
