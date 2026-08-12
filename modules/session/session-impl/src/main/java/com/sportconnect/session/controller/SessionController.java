package com.sportconnect.session.controller;

import com.sportconnect.common.auth.SecurityUtils;
import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.session.api.dto.CancelSessionRequest;
import com.sportconnect.session.api.dto.CreateSessionRequest;
import com.sportconnect.session.api.dto.ParticipantStatus;
import com.sportconnect.session.api.dto.RejectParticipantRequest;
import com.sportconnect.session.api.dto.SessionParticipantResponse;
import com.sportconnect.session.api.dto.SessionResponse;
import com.sportconnect.session.api.dto.SessionStatus;
import com.sportconnect.session.api.dto.UpdateSessionRequest;
import com.sportconnect.session.api.service.SessionService;
import com.sportconnect.social.post.api.dto.CommentResponse;
import com.sportconnect.social.post.api.dto.CreateCommentRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
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
            Authentication authentication,
            @Valid @RequestBody CreateSessionRequest request) {
        SessionResponse response = sessionService.createSession(SecurityUtils.extractUserId(authentication), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Session created successfully", response));
    }

    @Operation(summary = "Get a session by id", description = "Includes the caller's own participation status (SESSION-9), if any.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Session found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Session not found")
    })
    @GetMapping("/{sessionId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<SessionResponse>> getSession(
            @PathVariable Long sessionId,
            Authentication authentication) {
        SessionResponse response = sessionService.getSession(sessionId, SecurityUtils.extractUserId(authentication));
        return ResponseEntity.ok(ApiResponse.success("Session retrieved successfully", response));
    }

    @Operation(summary = "List a group's sessions", description = "Private-group visibility is enforced the same way as GET /api/groups/{groupId}.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Sessions (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not visible to the caller")
    })
    @GetMapping("/group/{groupId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<SessionResponse>>> getGroupSessions(
            @PathVariable Long groupId,
            Authentication authentication,
            Pageable pageable) {
        Page<SessionResponse> response = sessionService.getGroupSessions(
                groupId, SecurityUtils.extractUserId(authentication), pageable);
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
            Authentication authentication,
            Pageable pageable) {
        Page<SessionResponse> response = sessionService.getSessionsCreatedByUser(
                SecurityUtils.extractUserId(authentication), pageable);
        return ResponseEntity.ok(ApiResponse.success("Sessions retrieved successfully", response));
    }

    @Operation(summary = "Discover joinable standalone sessions", description = "SCHEDULED, standalone sessions gated to sports the caller holds an active profile for, excluding sessions the caller created or currently has joined. Optional sportId narrows to one sport.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Sessions (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/discover")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<SessionResponse>>> discoverSessions(
            Authentication authentication,
            @RequestParam(required = false) Long sportId,
            @PageableDefault(sort = "scheduledStart", direction = Sort.Direction.ASC) Pageable pageable) {
        Page<SessionResponse> response = sessionService.discoverSessions(
                SecurityUtils.extractUserId(authentication), sportId, pageable);
        return ResponseEntity.ok(ApiResponse.success("Sessions retrieved successfully", response));
    }

    @Operation(summary = "List the caller's joined sessions", description = "Standalone or group-linked sessions the caller currently has a JOINED participant row for. Optional status narrows to one (e.g. ONGOING, COMPLETED); omitted returns every status in one page.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Sessions (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/joined")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<SessionResponse>>> getJoinedSessions(
            Authentication authentication,
            @RequestParam(required = false) SessionStatus status,
            Pageable pageable) {
        Page<SessionResponse> response = sessionService.getJoinedSessions(
                SecurityUtils.extractUserId(authentication), status, pageable);
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
            Authentication authentication,
            @Valid @RequestBody UpdateSessionRequest request) {
        SessionResponse response = sessionService.updateSession(
                sessionId, SecurityUtils.extractUserId(authentication), request);
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
            Authentication authentication,
            @Valid @RequestBody(required = false) CancelSessionRequest request) {
        SessionResponse response = sessionService.cancelSession(
                sessionId, SecurityUtils.extractUserId(authentication), request);
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
            Authentication authentication) {
        sessionService.joinSession(sessionId, SecurityUtils.extractUserId(authentication));
        return ResponseEntity.ok(ApiResponse.success("Joined session successfully", null));
    }

    @Operation(summary = "Leave a session", description = "Also doubles as declining an INVITED row or cancelling the caller's own REQUESTED row (SESSION-9) — same endpoint, just a different button label client-side depending on the caller's current status.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Left / declined / cancelled"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not currently a participant (no row, or already LEFT)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @DeleteMapping("/{sessionId}/leave")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> leaveSession(
            @PathVariable Long sessionId,
            Authentication authentication) {
        sessionService.leaveSession(sessionId, SecurityUtils.extractUserId(authentication));
        return ResponseEntity.ok(ApiResponse.success("Left session successfully", null));
    }

    @Operation(summary = "List a session's participants", description = "status omitted defaults to JOINED and stays public. Any other status (e.g. REQUESTED, the approval queue) requires creator/owner-admin gating.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Participants (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not permitted to view a non-JOINED status")
    })
    @GetMapping("/{sessionId}/participants")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<SessionParticipantResponse>>> getSessionParticipants(
            @PathVariable Long sessionId,
            Authentication authentication,
            @RequestParam(required = false) ParticipantStatus status,
            Pageable pageable) {
        Page<SessionParticipantResponse> response = sessionService.getSessionParticipants(
                sessionId, SecurityUtils.extractUserId(authentication), status, pageable);
        return ResponseEntity.ok(ApiResponse.success("Participants retrieved successfully", response));
    }

    @Operation(summary = "Approve a REQUESTED participant", description = "Same gating as cancelSession/updateSession. Rejected if the session is CANCELLED or the user has no REQUESTED row.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Approved"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not permitted, session cancelled, or no pending request for this user")
    })
    @PostMapping("/{sessionId}/participants/{userId}/approve")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> approveParticipant(
            @PathVariable Long sessionId,
            @PathVariable UUID userId,
            Authentication authentication) {
        sessionService.approveParticipant(sessionId, SecurityUtils.extractUserId(authentication), userId);
        return ResponseEntity.ok(ApiResponse.success("Participant approved successfully", null));
    }

    @Operation(summary = "Reject a REQUESTED participant", description = "Same gating/exceptions as approve. Optional reason persisted on the participant row.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Rejected"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not permitted, session cancelled, or no pending request for this user")
    })
    @PostMapping("/{sessionId}/participants/{userId}/reject")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> rejectParticipant(
            @PathVariable Long sessionId,
            @PathVariable UUID userId,
            Authentication authentication,
            @Valid @RequestBody(required = false) RejectParticipantRequest request) {
        sessionService.rejectParticipant(sessionId, SecurityUtils.extractUserId(authentication), userId, request);
        return ResponseEntity.ok(ApiResponse.success("Participant rejected successfully", null));
    }

    @Operation(summary = "List a session's comments", description = "SESSION-10/A17 — participant (JOINED/REQUESTED/INVITED) or, for a group-linked session, a group member. The underlying post is invisible via /api/posts/** — this is the only way to read a session's comment thread.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Comments (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not a participant or group member"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Session not found")
    })
    @GetMapping("/{sessionId}/comments")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<CommentResponse>>> getSessionComments(
            @PathVariable Long sessionId,
            Authentication authentication,
            Pageable pageable) {
        Page<CommentResponse> response = sessionService.getSessionComments(
                sessionId, SecurityUtils.extractUserId(authentication), pageable);
        return ResponseEntity.ok(ApiResponse.success("Comments retrieved successfully", response));
    }

    @Operation(summary = "Comment on a session", description = "Same gating as getSessionComments.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Comment created"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not a participant or group member"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Session not found")
    })
    @PostMapping("/{sessionId}/comments")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<CommentResponse>> createSessionComment(
            @PathVariable Long sessionId,
            Authentication authentication,
            @Valid @RequestBody CreateCommentRequest request) {
        CommentResponse response = sessionService.createSessionComment(
                sessionId, SecurityUtils.extractUserId(authentication), request);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ApiResponse.success("Comment created successfully", response));
    }

    @Operation(summary = "Like a session comment", description = "Same gating as getSessionComments.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Liked"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not a participant or group member"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Session or comment not found")
    })
    @PostMapping("/{sessionId}/comments/{commentId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> likeSessionComment(
            @PathVariable Long sessionId,
            @PathVariable Long commentId,
            Authentication authentication) {
        sessionService.likeSessionComment(sessionId, commentId, SecurityUtils.extractUserId(authentication));
        return ResponseEntity.ok(ApiResponse.success("Comment liked successfully", null));
    }

    @Operation(summary = "Unlike a session comment", description = "Same gating as getSessionComments.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Unliked"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not a participant or group member"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Session or comment not found")
    })
    @DeleteMapping("/{sessionId}/comments/{commentId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> unlikeSessionComment(
            @PathVariable Long sessionId,
            @PathVariable Long commentId,
            Authentication authentication) {
        sessionService.unlikeSessionComment(sessionId, commentId, SecurityUtils.extractUserId(authentication));
        return ResponseEntity.ok(ApiResponse.success("Comment unliked successfully", null));
    }

    @Operation(summary = "Like a session", description = "Likes the session's own SESSION_POST anchor — same gating as getSessionComments (participant, or group member for a group-linked session). The underlying post is invisible via /api/posts/{postId}/like — this is the only way to like a session.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Liked"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Already liked"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not a participant or group member"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Session not found")
    })
    @PostMapping("/{sessionId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> likeSession(
            @PathVariable Long sessionId,
            Authentication authentication) {
        sessionService.likeSession(sessionId, SecurityUtils.extractUserId(authentication));
        return ResponseEntity.ok(ApiResponse.success("Session liked successfully", null));
    }

    @Operation(summary = "Unlike a session", description = "Same gating as likeSession.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Unliked"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "Not currently liked"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not a participant or group member"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Session not found")
    })
    @DeleteMapping("/{sessionId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> unlikeSession(
            @PathVariable Long sessionId,
            Authentication authentication) {
        sessionService.unlikeSession(sessionId, SecurityUtils.extractUserId(authentication));
        return ResponseEntity.ok(ApiResponse.success("Session unliked successfully", null));
    }
}
