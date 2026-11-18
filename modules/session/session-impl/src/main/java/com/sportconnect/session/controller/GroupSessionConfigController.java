package com.sportconnect.session.controller;

import com.sportconnect.common.auth.SecurityUtils;
import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.session.api.dto.GroupSessionRecurrenceRequest;
import com.sportconnect.session.api.dto.GroupSessionRecurrenceResponse;
import com.sportconnect.session.api.dto.GroupSessionSettingsResponse;
import com.sportconnect.session.api.dto.UpdateGroupSessionSettingsRequest;
import com.sportconnect.session.api.service.GroupSessionConfigService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
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
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * SESSION-GROUP-4 — a group's regular-session settings and recurrence configurations. Read: any member of the group. Write: the
 * group's owner and admins. A group that does not exist or is no longer active is 404 {@code GROUP_NOT_FOUND} first.
 */
@RestController
@RequestMapping("/api/sessions/group/{groupId}")
@RequiredArgsConstructor
@Tag(name = "Group session settings", description = "How a group's regular sessions are generated: on/off, weekly or monthly, and the recurrence configurations.")
public class GroupSessionConfigController {

    private final GroupSessionConfigService configService;

    @Operation(summary = "A group's regular-session settings", description = "SESSION-GROUP-4: enabled and mode. A group that never saved any is off and WEEKLY. Any member of the group.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "The settings"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not a member of the group (SESSION_GROUP_MEMBER_REQUIRED)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found or inactive (GROUP_NOT_FOUND)")
    })
    @GetMapping("/settings")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupSessionSettingsResponse>> getSettings(@PathVariable Long groupId, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success("Settings retrieved successfully",
                configService.getSettings(groupId, SecurityUtils.extractUserId(authentication))));
    }

    @Operation(summary = "Change a group's regular-session settings", description = "SESSION-GROUP-4: owner or admin; partial (a non-null field is applied). A change is announced to the members with a group post; switching the mode changes no configuration, it only changes which are active.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "The settings after the change"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not an owner or admin (SESSION_GROUP_ADMIN_REQUIRED, SESSION_GROUP_MEMBER_REQUIRED)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found or inactive (GROUP_NOT_FOUND)")
    })
    @PutMapping("/settings")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupSessionSettingsResponse>> updateSettings(
            @PathVariable Long groupId,
            Authentication authentication,
            @Valid @RequestBody UpdateGroupSessionSettingsRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Settings updated successfully",
                configService.updateSettings(groupId, SecurityUtils.extractUserId(authentication), request)));
    }

    @Operation(summary = "A group's recurrence configurations", description = "SESSION-GROUP-4: every configuration, both modes, ordered by mode, day and start time. Any member of the group.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "The configurations (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not a member of the group (SESSION_GROUP_MEMBER_REQUIRED)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found or inactive (GROUP_NOT_FOUND)")
    })
    @GetMapping("/recurrences")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<List<GroupSessionRecurrenceResponse>>> getRecurrences(
            @PathVariable Long groupId, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success("Recurrences retrieved successfully",
                configService.getRecurrences(groupId, SecurityUtils.extractUserId(authentication))));
    }

    @Operation(summary = "Add a recurrence configuration", description = "SESSION-GROUP-4: owner or admin. A new configuration takes the group's current mode. dayKey and startTime are required; a missing location, duration or fixed-fee amount saves it as a draft. At most 5 per group, mode and day.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "201", description = "Created"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "SESSION_RECURRENCE_DAY_INVALID, SESSION_RECURRENCE_START_REQUIRED, GROUP_RECURRENCE_LOCATION_SPORT_MISMATCH, SESSION_AUDIENCE_REQUIRED, SESSION_AUDIENCE_NOT_MEMBER, SESSION_SPORT_REQUIRED"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not an owner or admin (SESSION_GROUP_ADMIN_REQUIRED, SESSION_GROUP_MEMBER_REQUIRED)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group not found or inactive (GROUP_NOT_FOUND)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "Already 5 on that day (SESSION_RECURRENCE_DAY_LIMIT)")
    })
    @PostMapping("/recurrences")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupSessionRecurrenceResponse>> createRecurrence(
            @PathVariable Long groupId,
            Authentication authentication,
            @Valid @RequestBody GroupSessionRecurrenceRequest request) {
        GroupSessionRecurrenceResponse response = configService.createRecurrence(
                groupId, SecurityUtils.extractUserId(authentication), request);
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success("Recurrence created successfully", response));
    }

    @Operation(summary = "Replace a recurrence configuration", description = "SESSION-GROUP-4: owner or admin. Full replace of the configuration's fields; its mode never changes. Editing affects only sessions generated later.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Updated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "As on create"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not an owner or admin"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group (GROUP_NOT_FOUND) or configuration (SESSION_RECURRENCE_NOT_FOUND) not found"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "409", description = "Already 5 on the target day (SESSION_RECURRENCE_DAY_LIMIT)")
    })
    @PutMapping("/recurrences/{recurrenceId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupSessionRecurrenceResponse>> updateRecurrence(
            @PathVariable Long groupId,
            @PathVariable Long recurrenceId,
            Authentication authentication,
            @Valid @RequestBody GroupSessionRecurrenceRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Recurrence updated successfully",
                configService.updateRecurrence(groupId, recurrenceId, SecurityUtils.extractUserId(authentication), request)));
    }

    @Operation(summary = "Delete a recurrence configuration", description = "SESSION-GROUP-4: owner or admin. Hard delete. Sessions already generated from it are not touched (cancelling them is SESSION-GROUP-6).")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Deleted"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not an owner or admin"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Group (GROUP_NOT_FOUND) or configuration (SESSION_RECURRENCE_NOT_FOUND) not found")
    })
    @DeleteMapping("/recurrences/{recurrenceId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> deleteRecurrence(
            @PathVariable Long groupId,
            @PathVariable Long recurrenceId,
            Authentication authentication) {
        configService.deleteRecurrence(groupId, recurrenceId, SecurityUtils.extractUserId(authentication));
        return ResponseEntity.ok(ApiResponse.success("Recurrence deleted successfully", null));
    }
}
