package com.sportconnect.session.controller;

import com.sportconnect.common.auth.SecurityUtils;
import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.session.api.dto.GroupMemberStatisticsResponse;
import com.sportconnect.session.api.dto.GroupStatisticsResponse;
import com.sportconnect.session.api.dto.PlayerStatisticsResponse;
import com.sportconnect.session.api.dto.StatsGamesPageResponse;
import com.sportconnect.session.api.service.SessionStatisticsService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * SESSION-73: the statistics the engine of SESSION-53 counts, read back. A player's own statistics and games history, and a
 * group's member statistics. The paths sit under {@code /api} because the group endpoints belong to the group's session
 * namespace while the personal ones are {@code /api/stats}.
 */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
@Tag(name = "Statistics", description = "A player's and a group's statistics, counted from completed sessions.")
public class StatisticsController {

    private final SessionStatisticsService statisticsService;

    @Operation(summary = "My statistics in a sport",
            description = "Totals for all, ranking and normal games, results per pair and per partner (one page: page from 0, size 1 to 50), and per region and country "
                    + "of the venues, with the columns the sport's record.scoreboard.columns names; nothing is shown while the sport's statistics are off. A player with no counted game gets zeros and "
                    + "asOf null. Statistics appear up to 24 hours after a session ends.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Statistics returned"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "SPORT_NOT_FOUND")
    })
    @GetMapping("/stats/me")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<PlayerStatisticsResponse>> getMyStatistics(
            @RequestParam Long sportId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication authentication) {
        PlayerStatisticsResponse response = statisticsService.getMyStatistics(
                SecurityUtils.extractUserId(authentication), sportId, page, size);
        return ResponseEntity.ok(ApiResponse.success("Statistics retrieved successfully", response));
    }

    @Operation(summary = "My counted games in a sport, newest first",
            description = "A page of the latest 500 counted games. Send the previous page's nextCursor as cursor. A game whose "
                    + "record is gone is skipped, so a page can hold fewer than size games.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Games returned"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "size outside 1 to 50"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "SPORT_NOT_FOUND")
    })
    @GetMapping("/stats/me/games")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<StatsGamesPageResponse>> getMyGames(
            @RequestParam Long sportId,
            @RequestParam(required = false) Long cursor,
            @RequestParam(defaultValue = "20") int size,
            Authentication authentication) {
        StatsGamesPageResponse response = statisticsService.getMyGames(
                SecurityUtils.extractUserId(authentication), sportId, cursor, size);
        return ResponseEntity.ok(ApiResponse.success("Games retrieved successfully", response));
    }

    @Operation(summary = "A group's member statistics in a sport",
            description = "One row per current, active member with a counted game: the totals over all the group's games, most "
                    + "games first, paged (size 1 to 50, default 20). Members only.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Statistics returned"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not a member of the group, or no such group (SESSION_GROUP_MEMBER_REQUIRED)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "SPORT_NOT_FOUND"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "The group has no sport (SESSION_SPORT_REQUIRED), or a bad page or size")
    })
    @GetMapping("/sessions/group/{groupId}/stats")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupStatisticsResponse>> getGroupStatistics(
            @PathVariable Long groupId,
            @PageableDefault(size = 20) Pageable pageable,
            Authentication authentication) {
        GroupStatisticsResponse response = statisticsService.getGroupStatistics(
                groupId, SecurityUtils.extractUserId(authentication), pageable);
        return ResponseEntity.ok(ApiResponse.success("Group statistics retrieved successfully", response));
    }

    @Operation(summary = "One member's statistics in a group",
            description = "The member's totals over all the group's games and their pair results. Any member of the group may "
                    + "read it; the member may have left the group or been deactivated and is still shown. A member with no "
                    + "counted game gets zeros.")
    @ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "200", description = "Statistics returned"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "401", description = "Not authenticated"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "403", description = "Not a member of the group, or no such group (SESSION_GROUP_MEMBER_REQUIRED)"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "404", description = "SPORT_NOT_FOUND"),
            @io.swagger.v3.oas.annotations.responses.ApiResponse(responseCode = "400", description = "The group has no sport (SESSION_SPORT_REQUIRED), or a bad page or size")
    })
    @GetMapping("/sessions/group/{groupId}/stats/members/{userId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupMemberStatisticsResponse>> getGroupMemberStatistics(
            @PathVariable Long groupId,
            @PathVariable UUID userId,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            Authentication authentication) {
        GroupMemberStatisticsResponse response = statisticsService.getGroupMemberStatistics(
                groupId, SecurityUtils.extractUserId(authentication), userId, page, size);
        return ResponseEntity.ok(ApiResponse.success("Member statistics retrieved successfully", response));
    }
}
