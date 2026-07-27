package com.sportconnect.user.controller;

import com.sportconnect.user.service.InternalUserSyncService;
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
public class InternalUserSyncController {

    private final InternalUserSyncService internalUserSyncService;

    @GetMapping("/friendships")
    public InternalUserSyncService.FriendshipPage friendships(
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "500") int limit) {
        return internalUserSyncService.listFriendships(cursor, limit);
    }

    @GetMapping("/users")
    public InternalUserSyncService.UserPage users(
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "500") int limit) {
        return internalUserSyncService.listUsers(cursor, limit);
    }
}
