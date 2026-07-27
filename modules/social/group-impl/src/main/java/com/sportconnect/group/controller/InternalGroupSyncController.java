package com.sportconnect.group.controller;

import com.sportconnect.group.service.InternalGroupSyncService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Service-to-service only — gated by {@code InternalServiceAuthFilter}
 * (auth-impl's {@code SecurityConfig}, {@code /internal/**} filter chain), never the public
 * {@code /api/**} surface and never wrapped in this app's usual {@code ApiResponse<T>} envelope
 * (a deliberate deviation for this one non-public surface — see
 * services/chat/docs/SYNC_DESIGN.md). Backs services/chat's cold-start bootstrap pull.
 */
@RestController
@RequestMapping("/internal/sync")
@RequiredArgsConstructor
public class InternalGroupSyncController {

    private final InternalGroupSyncService internalGroupSyncService;

    @GetMapping("/group-members")
    public InternalGroupSyncService.Page groupMembers(
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "500") int limit) {
        return internalGroupSyncService.listGroupMembers(cursor, limit);
    }
}
