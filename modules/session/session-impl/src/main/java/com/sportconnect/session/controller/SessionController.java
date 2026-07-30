package com.sportconnect.session.controller;

import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.session.api.dto.CancelSessionRequest;
import com.sportconnect.session.api.dto.CreateSessionRequest;
import com.sportconnect.session.api.dto.SessionParticipantResponse;
import com.sportconnect.session.api.dto.SessionResponse;
import com.sportconnect.session.api.dto.UpdateSessionRequest;
import com.sportconnect.session.api.service.SessionService;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/sessions")
@RequiredArgsConstructor
@Tag(name = "Sessions", description = "Scheduled sports activities — group-recurring or standalone.")
public class SessionController {

    private final SessionService sessionService;

    @Operation(summary = "Create a session", description = "groupId omitted → standalone (any user). groupId set → owner/admin of that group only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Session created"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, not permitted, or locationId's sport doesn't match"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @PostMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<SessionResponse>> createSession(
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody CreateSessionRequest request) {
        UUID userId = UUID.fromString(userIdStr);
        SessionResponse response = sessionService.createSession(userId, request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Session created successfully", response));
    }

    @Operation(summary = "Get a session by id")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Session found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Session not found")
    })
    @GetMapping("/{sessionId}")
    public ResponseEntity<ApiResponse<SessionResponse>> getSession(@PathVariable Long sessionId) {
        SessionResponse response = sessionService.getSession(sessionId);
        return ResponseEntity.ok(ApiResponse.success("Session retrieved successfully", response));
    }

    @Operation(summary = "List a group's sessions", description = "Private-group visibility is enforced the same way as GET /api/groups/{groupId}.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Sessions (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not visible to the caller")
    })
    @GetMapping("/group/{groupId}")
    public ResponseEntity<ApiResponse<Page<SessionResponse>>> getGroupSessions(
            @PathVariable Long groupId,
            @AuthenticationPrincipal String userIdStr,
            Pageable pageable) {
        UUID userId = UUID.fromString(userIdStr);
        Page<SessionResponse> response = sessionService.getGroupSessions(groupId, userId, pageable);
        return ResponseEntity.ok(ApiResponse.success("Sessions retrieved successfully", response));
    }

    @Operation(summary = "List the caller's standalone sessions")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Sessions (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/mine")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<SessionResponse>>> getMySessions(
            @AuthenticationPrincipal String userIdStr,
            Pageable pageable) {
        UUID userId = UUID.fromString(userIdStr);
        Page<SessionResponse> response = sessionService.getSessionsCreatedByUser(userId, pageable);
        return ResponseEntity.ok(ApiResponse.success("Sessions retrieved successfully", response));
    }

    @Operation(summary = "Update a session", description = "Standalone → creator only. Group-linked → owner/admin only. Partial update.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Session updated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Validation failed, not permitted, or locationId's sport doesn't match"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Session not found")
    })
    @PutMapping("/{sessionId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<SessionResponse>> updateSession(
            @PathVariable Long sessionId,
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody UpdateSessionRequest request) {
        UUID userId = UUID.fromString(userIdStr);
        SessionResponse response = sessionService.updateSession(sessionId, userId, request);
        return ResponseEntity.ok(ApiResponse.success("Session updated successfully", response));
    }

    @Operation(summary = "Cancel a session", description = "Same gating as update. Soft action — the row is kept with status=CANCELLED. Rejected if already completed or cancelled.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Session cancelled"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not permitted, or already completed/cancelled"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Session not found")
    })
    @PostMapping("/{sessionId}/cancel")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<SessionResponse>> cancelSession(
            @PathVariable Long sessionId,
            @AuthenticationPrincipal String userIdStr,
            @Valid @RequestBody(required = false) CancelSessionRequest request) {
        UUID userId = UUID.fromString(userIdStr);
        SessionResponse response = sessionService.cancelSession(sessionId, userId, request);
        return ResponseEntity.ok(ApiResponse.success("Session cancelled successfully", response));
    }

    @Operation(summary = "Join a session", description = "Group-linked sessions require group membership; standalone is open.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Joined"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not a group member"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Session not found")
    })
    @PostMapping("/{sessionId}/join")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> joinSession(
            @PathVariable Long sessionId,
            @AuthenticationPrincipal String userIdStr) {
        UUID userId = UUID.fromString(userIdStr);
        sessionService.joinSession(sessionId, userId);
        return ResponseEntity.ok(ApiResponse.success("Joined session successfully", null));
    }

    @Operation(summary = "Leave a session")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Left"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not currently joined"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @DeleteMapping("/{sessionId}/leave")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> leaveSession(
            @PathVariable Long sessionId,
            @AuthenticationPrincipal String userIdStr) {
        UUID userId = UUID.fromString(userIdStr);
        sessionService.leaveSession(sessionId, userId);
        return ResponseEntity.ok(ApiResponse.success("Left session successfully", null));
    }

    @Operation(summary = "List a session's joined participants")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Participants (possibly empty)")
    })
    @GetMapping("/{sessionId}/participants")
    public ResponseEntity<ApiResponse<Page<SessionParticipantResponse>>> getSessionParticipants(
            @PathVariable Long sessionId,
            Pageable pageable) {
        Page<SessionParticipantResponse> response = sessionService.getSessionParticipants(sessionId, pageable);
        return ResponseEntity.ok(ApiResponse.success("Participants retrieved successfully", response));
    }
}
