package com.sportconnect.session.record;

import com.sportconnect.common.auth.SecurityUtils;
import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.session.api.dto.RecordChangeSetRequest;
import com.sportconnect.session.api.dto.RecordChangeSetResponse;
import com.sportconnect.session.api.dto.SessionRecordDto;
import com.sportconnect.session.api.service.SessionRecordService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * SESSION-50: the results (games) recorded in a session. Same auth convention as
 * {@code SessionController}: {@code @PreAuthorize("hasRole('USER')")} plus
 * {@code SecurityUtils.extractUserId(authentication)}.
 */
@RestController
@RequestMapping("/api/sessions/{sessionId}/records")
@RequiredArgsConstructor
@Tag(name = "Session records", description = "Results (games) recorded in a session.")
public class SessionRecordController {

    private final SessionRecordService sessionRecordService;

    @Operation(summary = "List a session's result records",
            description = "Oldest first. A group session's records are open to its group members, a "
                    + "standalone session's to its JOINED participants.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Records returned"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "SESSION_RECORD_NOT_ALLOWED"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "SESSION_NOT_FOUND")
    })
    @GetMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<List<SessionRecordDto>>> getRecords(
            @PathVariable Long sessionId, Authentication authentication) {
        List<SessionRecordDto> records = sessionRecordService.getRecords(
                sessionId, SecurityUtils.extractUserId(authentication));
        return ResponseEntity.ok(ApiResponse.success("Records retrieved successfully", records));
    }

    @Operation(summary = "Apply a change set to a session's result records",
            description = "Adds, updates and deletes in one transaction (at most 50 operations, 64 KB). "
                    + "Only while the session is ONGOING or COMPLETED and no later than 24 hours after it "
                    + "ended. Concurrency never errors: the later request wins, an update of a deleted "
                    + "record restores it under a new id, deleting a gone record does nothing. A bad "
                    + "record is refused alone (status REJECTED with its errorCode) and the valid ones are stored; "
                    + "a malformed request is refused whole.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Applied; per-operation results (a REJECTED one carries errorCode and errorParams) and the fresh records"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "SESSION_RECORD_INVALID (malformed request: a missing or repeated ref or id, over 50 operations)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "SESSION_RECORD_NOT_ALLOWED"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "SESSION_NOT_FOUND"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "SESSION_RECORD_NOT_LOGGABLE or SESSION_RECORD_WINDOW_CLOSED"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "413", description = "SESSION_RECORD_TOO_LARGE (request over 64 KB)")
    })
    @PostMapping("/changes")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<RecordChangeSetResponse>> applyChanges(
            @PathVariable Long sessionId, Authentication authentication,
            @RequestBody RecordChangeSetRequest request) {
        RecordChangeSetResponse response = sessionRecordService.applyChanges(
                sessionId, SecurityUtils.extractUserId(authentication), request);
        return ResponseEntity.ok(ApiResponse.success("Records updated successfully", response));
    }
}
