package com.sportconnect.notification.controller;

import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.notification.api.dto.NotificationResponse;
import com.sportconnect.notification.api.service.NotificationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import java.util.UUID;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notifications")
@RequiredArgsConstructor
@Tag(name = "Notifications", description = "Per-recipient aggregated notifications.")
public class NotificationController {

    private final NotificationService notificationService;

    @Operation(summary = "List the caller's notifications", description = "Newest-active-first, paginated.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Notifications (possibly empty)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<NotificationResponse>>> getNotifications(
            @AuthenticationPrincipal String userIdStr,
            Pageable pageable) {
        Page<NotificationResponse> response = notificationService.getNotifications(
                UUID.fromString(userIdStr), pageable);
        return ResponseEntity.ok(ApiResponse.success("Notifications retrieved successfully", response));
    }

    @Operation(summary = "Unread notification count for the caller")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Unread count"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated")
    })
    @GetMapping("/unread-count")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Long>> getUnreadCount(@AuthenticationPrincipal String userIdStr) {
        long count = notificationService.getUnreadCount(UUID.fromString(userIdStr));
        return ResponseEntity.ok(ApiResponse.success("Unread count retrieved successfully", count));
    }

    @Operation(summary = "Mark one notification read", description = "Idempotent if already read.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Marked read"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not this caller's notification"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "Notification not found")
    })
    @PutMapping("/{notificationId}/read")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> markAsRead(
            @AuthenticationPrincipal String userIdStr,
            @PathVariable Long notificationId) {
        notificationService.markAsRead(UUID.fromString(userIdStr), notificationId);
        return ResponseEntity.ok(ApiResponse.success("Notification marked read", null));
    }
}
