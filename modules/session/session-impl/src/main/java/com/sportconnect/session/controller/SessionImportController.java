package com.sportconnect.session.controller;

import com.sportconnect.common.auth.SecurityUtils;
import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.session.api.dto.ImportApplyResponse;
import com.sportconnect.session.api.dto.ImportPreviewResponse;
import com.sportconnect.session.api.dto.ImportSessionsRequest;
import com.sportconnect.session.api.service.SessionImportService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** SESSION-70 — admin import of finished group sessions with their games: a preview and the apply, the same request. */
@RestController
@RequestMapping("/api/sessions/import")
@RequiredArgsConstructor
@Tag(name = "Session import", description = "Admin: load finished group sessions and their games, from names, in one batch.")
public class SessionImportController {

    private final SessionImportService importService;

    @Operation(summary = "Preview an import", description = "SESSION-70: matches every name against the group's active members and "
            + "reports each session with its games and the names left unresolved. Writes nothing. ADMIN only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "The preview"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "SESSION_IMPORT_INVALID, SESSION_IMPORT_HOST_NOT_MEMBER, SESSION_IMPORT_ALIAS_NOT_MEMBER, SESSION_IMPORT_NOT_FINISHED, SESSION_LOCATION_SPORT_MISMATCH"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not an admin"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "GROUP_NOT_FOUND")
    })
    @PostMapping("/preview")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<ImportPreviewResponse>> preview(Authentication authentication,
                                                                      @RequestBody ImportSessionsRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Import previewed",
                importService.preview(SecurityUtils.extractUserId(authentication), request)));
    }

    @Operation(summary = "Import finished sessions", description = "SESSION-70: creates each session COMPLETED with its participants and "
            + "game records, one transaction per session; a session already there (same group, title, start) is skipped. "
            + "Refused whole while a name is unresolved. Sends no notification. ADMIN only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Per-session results"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "As the preview"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not an admin"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "GROUP_NOT_FOUND"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "SESSION_IMPORT_UNRESOLVED_NAMES")
    })
    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<ImportApplyResponse>> apply(Authentication authentication,
                                                                  @RequestBody ImportSessionsRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Import applied",
                importService.apply(SecurityUtils.extractUserId(authentication), request)));
    }
}
