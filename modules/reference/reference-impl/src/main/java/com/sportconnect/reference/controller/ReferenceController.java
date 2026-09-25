package com.sportconnect.reference.controller;

import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.reference.api.dto.CountryResponse;
import com.sportconnect.reference.api.dto.LanguageResponse;
import com.sportconnect.reference.api.dto.RegionResponse;
import com.sportconnect.reference.api.service.ReferenceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Public, read-only reference data. Public because the sign-up form needs the dropdowns before an
 * account exists; read-only and identity-free, so no caller check applies (see
 * {@code SecurityConfig}: {@code GET /api/reference/**} is {@code permitAll}).
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
