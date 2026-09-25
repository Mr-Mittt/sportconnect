package com.sportconnect.reference.controller;

import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.reference.api.dto.CountryResponse;
import com.sportconnect.reference.api.dto.LanguageResponse;
import com.sportconnect.reference.api.dto.RegionResponse;
import com.sportconnect.reference.api.dto.ResolveGeoRequest;
import com.sportconnect.reference.api.dto.ResolvedGeoResponse;
import com.sportconnect.reference.api.service.ReferenceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Public, read-only reference data. Public because the sign-up form needs the dropdowns before an
 * account exists; read-only and identity-free, so no caller check applies (see
 * {@code SecurityConfig}: {@code GET /api/reference/**} and {@code POST /api/reference/resolve} are
 * {@code permitAll}). {@code resolve} is a {@code POST} only because it carries a body — it changes nothing.
 */
@RestController
@RequestMapping("/api/reference")
@RequiredArgsConstructor
@Tag(name = "Reference", description = "Languages, countries and regions (public, read-only).")
public class ReferenceController {

    private final ReferenceService referenceService;

    @Operation(summary = "List active languages", security = {})
    @GetMapping("/languages")
    public ResponseEntity<ApiResponse<List<LanguageResponse>>> getLanguages() {
        return ResponseEntity.ok(ApiResponse.success("Languages retrieved successfully",
                referenceService.getActiveLanguages()));
    }

    @Operation(summary = "List active countries", security = {})
    @GetMapping("/countries")
    public ResponseEntity<ApiResponse<List<CountryResponse>>> getCountries() {
        return ResponseEntity.ok(ApiResponse.success("Countries retrieved successfully",
                referenceService.getActiveCountries()));
    }

    @Operation(summary = "Match browser signals to reference rows", security = {},
            description = "Public. Matches coordinates, a timezone and/or browser locales to an active language, country "
                    + "and region — offline, never by IP address. Country priority: coordinates > timezone > locale "
                    + "region; `source` says which won. Every part of the response may be null, and an unresolved "
                    + "request is a 200 with all-null, not an error.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Resolved (possibly all-null)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400",
                    description = "More than 10 locales, a locale over 35 characters, a coordinate out of range, or only one of latitude/longitude")
    })
    @PostMapping("/resolve")
    public ResponseEntity<ApiResponse<ResolvedGeoResponse>> resolve(@Valid @RequestBody ResolveGeoRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Geo resolved successfully", referenceService.resolve(request)));
    }

    @Operation(summary = "List a country's active regions", security = {},
            description = "An active country with no seeded regions returns an empty list.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Regions retrieved"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Unknown or inactive country")
    })
    @GetMapping("/countries/{countryId}/regions")
    public ResponseEntity<ApiResponse<List<RegionResponse>>> getRegions(@PathVariable Long countryId) {
        return ResponseEntity.ok(ApiResponse.success("Regions retrieved successfully",
                referenceService.getActiveRegions(countryId)));
    }
}
