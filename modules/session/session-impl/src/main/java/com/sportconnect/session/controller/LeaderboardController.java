package com.sportconnect.session.controller;

import com.sportconnect.common.auth.SecurityUtils;
import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.session.api.dto.LeaderboardRefreshResponse;
import com.sportconnect.session.api.dto.LeaderboardResponse;
import com.sportconnect.session.api.dto.RankingRuleRequest;
import com.sportconnect.session.api.dto.RankingRuleResponse;
import com.sportconnect.session.api.service.LeaderboardService;
import com.sportconnect.session.api.service.RankingRuleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
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

import java.util.List;

/**
 * SESSION-54 slice B: the leaderboards. A group's board (members only), a group's own sort list (owner or admin) and the manual
 * refresh; the region and country boards (any signed-in user). The boards are built by the ranking job (slice A); nothing here
 * changes a player's statistics.
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Tag(name = "Leaderboards", description = "Ranked boards of a group, a region and a country, built nightly from the counted games.")
public class LeaderboardController {

    private final LeaderboardService leaderboardService;
    private final RankingRuleService ruleService;

    @Operation(summary = "A group's leaderboard",
            description = "One page of the group's board in the group's sport. kind SINGLE (a member) or PARTNER (a pair); size 1 to 50 (default 20); "
                    + "send the previous page's nextCursor as cursor. Rank and previous rank come from the board; deactivated players and "
                    + "members who left are not shown. me is the caller's own best place. Members only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Board returned (empty when never built)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "SESSION_GROUP_MEMBER_REQUIRED"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "SPORT_NOT_FOUND (also while the sport's statistics are off)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "SESSION_SPORT_REQUIRED, SESSION_RANKING_KIND_INVALID, or a bad size or cursor")
    })
    @GetMapping("/sessions/group/{groupId}/leaderboard")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<LeaderboardResponse>> getGroupBoard(
            @PathVariable Long groupId,
            @RequestParam(defaultValue = "SINGLE") String kind,
            @RequestParam(required = false) Integer cursor,
            @RequestParam(defaultValue = "20") int size,
            Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success("Leaderboard retrieved successfully",
                leaderboardService.getGroupBoard(groupId, SecurityUtils.extractUserId(authentication), kind, cursor, size)));
    }

    @Operation(summary = "A region's leaderboard",
            description = "One page of the region's board for a sport. Built from ranking games at venues in that region. Any signed-in user.")
    @GetMapping("/leaderboards/regions/{regionId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<LeaderboardResponse>> getRegionBoard(
            @PathVariable Long regionId,
            @RequestParam Long sportId,
            @RequestParam(defaultValue = "SINGLE") String kind,
            @RequestParam(required = false) Integer cursor,
            @RequestParam(defaultValue = "20") int size,
            Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success("Leaderboard retrieved successfully",
                leaderboardService.getRegionBoard(regionId, sportId, SecurityUtils.extractUserId(authentication), kind, cursor, size)));
    }

    @Operation(summary = "A country's leaderboard",
            description = "One page of the country's board for a sport (its pair board is merged from the best entries of its regions). Any signed-in user.")
    @GetMapping("/leaderboards/countries/{countryId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<LeaderboardResponse>> getCountryBoard(
            @PathVariable Long countryId,
            @RequestParam Long sportId,
            @RequestParam(defaultValue = "SINGLE") String kind,
            @RequestParam(required = false) Integer cursor,
            @RequestParam(defaultValue = "20") int size,
            Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success("Leaderboard retrieved successfully",
                leaderboardService.getCountryBoard(countryId, sportId, SecurityUtils.extractUserId(authentication), kind, cursor, size)));
    }

    @Operation(summary = "Refresh a group's leaderboard now",
            description = "Group owner or admin. Builds the group's board from its members' rows now, at most once an hour: the board must have been built "
                    + "at least an hour ago (the nightly build counts), else 429 SESSION_RANKING_COOLDOWN with retryAfterSeconds. 409 "
                    + "SESSION_RANKING_IN_PROGRESS while it is being built, 409 SESSION_GROUP_STATISTICS_OFF while the group's switch is off.")
    @PostMapping("/sessions/group/{groupId}/leaderboard/refresh")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<LeaderboardRefreshResponse>> refresh(@PathVariable Long groupId, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success("Leaderboard refreshed",
                leaderboardService.refreshGroupBoard(groupId, SecurityUtils.extractUserId(authentication))));
    }

    @Operation(summary = "A group's own ranking rules",
            description = "The rules this group set for itself (any member). A kind with none follows the sport's rule.")
    @GetMapping("/sessions/group/{groupId}/leaderboard/rules")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<List<RankingRuleResponse>>> getGroupRules(@PathVariable Long groupId, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success("Ranking rules retrieved",
                ruleService.listGroupRules(SecurityUtils.extractUserId(authentication), groupId)));
    }

    @Operation(summary = "Set the group's own sort list",
            description = "Group owner or admin. Body: kind SINGLE or PARTNER, sort (up to four keys with a direction each) and optional require "
                    + "(preconditions to be listed); scopeType and scopeId are ignored, the rule is for this group and its sport. The board rebuilds soon.")
    @PutMapping("/sessions/group/{groupId}/leaderboard/rules")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<RankingRuleResponse>> putGroupRule(@PathVariable Long groupId,
                                                                          @RequestBody RankingRuleRequest request,
                                                                          Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success("Ranking rule saved",
                ruleService.saveGroupRule(SecurityUtils.extractUserId(authentication), groupId, request)));
    }

    @Operation(summary = "Remove the group's own sort list of a kind", description = "Group owner or admin; the board follows the sport's rule again.")
    @DeleteMapping("/sessions/group/{groupId}/leaderboard/rules")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> deleteGroupRule(@PathVariable Long groupId, @RequestParam String kind,
                                                             Authentication authentication) {
        ruleService.deleteGroupRule(SecurityUtils.extractUserId(authentication), groupId, kind);
        return ResponseEntity.ok(ApiResponse.success("Ranking rule removed", null));
    }
}
