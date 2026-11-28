package com.sportconnect.session.season;

import com.sportconnect.common.auth.SecurityUtils;
import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.session.api.dto.CreateSeasonRequest;
import com.sportconnect.session.api.dto.GroupMemberStatisticsResponse;
import com.sportconnect.session.api.dto.GroupStatisticsResponse;
import com.sportconnect.session.api.dto.SeasonDefaultsResponse;
import com.sportconnect.session.api.dto.SeasonLinkedSessionResponse;
import com.sportconnect.session.api.dto.SeasonLinksRequest;
import com.sportconnect.session.api.dto.SeasonResponse;
import com.sportconnect.session.api.dto.SeasonStatus;
import com.sportconnect.session.api.dto.UpdateSeasonRequest;
import com.sportconnect.session.api.service.GroupSeasonService;
import com.sportconnect.social.post.api.dto.CommentResponse;
import com.sportconnect.social.post.api.dto.CreateCommentRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
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

import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

/**
 * SESSION-55 - a group's seasons. Read: any member of the group. Write: its owner and admins. A group that does not exist or is
 * no longer active is 404 {@code GROUP_NOT_FOUND} first. The season's thread (comments and likes) is gated like a session's, by the
 * season's group members.
 */
@RestController
@RequestMapping("/api/sessions/group/{groupId}/seasons")
@RequiredArgsConstructor
@Tag(name = "Group seasons", description = "A group's seasons: periods of up to 31 days with their own statistics and board.")
public class GroupSeasonController {

    private static final int MAX_PAGE_SIZE = 50;

    private final GroupSeasonService seasonService;

    @Operation(summary = "What the create-season form pre-fills", description = "SESSION-55: the group's effective stat list and ranking rule, its timezone, today in it. Owner or admin.")
    @GetMapping("/defaults")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<SeasonDefaultsResponse>> defaults(@PathVariable Long groupId, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success("Season defaults retrieved successfully",
                seasonService.getDefaults(groupId, SecurityUtils.extractUserId(authentication))));
    }

    @Operation(summary = "Create a season", description = "SESSION-55: owner or admin. At most 2 scheduled or ongoing per group, no overlap, starts today or later, at most 31 days.")
    @PostMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<SeasonResponse>> create(@PathVariable Long groupId, @Valid @RequestBody CreateSeasonRequest request,
                                                              Authentication authentication) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success("Season created successfully",
                seasonService.create(groupId, SecurityUtils.extractUserId(authentication), request)));
    }

    @Operation(summary = "The group's seasons", description = "SESSION-55: any member; newest start first; optional repeatable status filter.")
    @GetMapping
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<SeasonResponse>>> list(@PathVariable Long groupId,
                                                                  @RequestParam(required = false) List<SeasonStatus> status,
                                                                  @RequestParam(defaultValue = "0") int page,
                                                                  @RequestParam(defaultValue = "20") int size,
                                                                  Authentication authentication) {
        Set<SeasonStatus> statuses = status == null || status.isEmpty() ? EnumSet.noneOf(SeasonStatus.class) : EnumSet.copyOf(status);
        return ResponseEntity.ok(ApiResponse.success("Seasons retrieved successfully",
                seasonService.list(groupId, SecurityUtils.extractUserId(authentication), statuses,
                        PageRequest.of(Math.max(page, 0), Math.max(1, Math.min(size, MAX_PAGE_SIZE))))));
    }

    @Operation(summary = "One season", description = "SESSION-55: any member; includes the like state of the season's own post.")
    @GetMapping("/{seasonId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<SeasonResponse>> get(@PathVariable Long groupId, @PathVariable Long seasonId, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success("Season retrieved successfully",
                seasonService.get(groupId, seasonId, SecurityUtils.extractUserId(authentication))));
    }

    @Operation(summary = "Edit a season", description = "SESSION-55: owner or admin; only while SCHEDULED (409 SESSION_SEASON_NOT_EDITABLE); a null field keeps its value.")
    @PutMapping("/{seasonId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<SeasonResponse>> update(@PathVariable Long groupId, @PathVariable Long seasonId,
                                                              @Valid @RequestBody UpdateSeasonRequest request, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success("Season updated successfully",
                seasonService.update(groupId, seasonId, SecurityUtils.extractUserId(authentication), request)));
    }

    @Operation(summary = "Cancel a season", description = "SESSION-55: owner or admin; a scheduled or ongoing season; it stops counting and stays readable.")
    @PostMapping("/{seasonId}/cancel")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<SeasonResponse>> cancel(@PathVariable Long groupId, @PathVariable Long seasonId, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success("Season cancelled successfully",
                seasonService.cancel(groupId, seasonId, SecurityUtils.extractUserId(authentication))));
    }

    @Operation(summary = "Finalise a completed season at once", description = "SESSION-55: owner or admin; only a COMPLETED season. The sessions the engine has not counted yet are counted straight into the season, then it is frozen.")
    @PostMapping("/{seasonId}/finalise")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<SeasonResponse>> finalise(@PathVariable Long groupId, @PathVariable Long seasonId, Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success("Season finalised successfully",
                seasonService.finalise(groupId, seasonId, SecurityUtils.extractUserId(authentication))));
    }

    @Operation(summary = "The season's members' statistics", description = "SESSION-55: any member; the same shape as the group's statistics list, through the season's own stat list.")
    @GetMapping("/{seasonId}/stats")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupStatisticsResponse>> stats(@PathVariable Long groupId, @PathVariable Long seasonId,
                                                                      @RequestParam(defaultValue = "0") int page,
                                                                      @RequestParam(defaultValue = "20") int size,
                                                                      Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success("Season statistics retrieved successfully",
                seasonService.getStatistics(groupId, seasonId, SecurityUtils.extractUserId(authentication),
                        PageRequest.of(Math.max(page, 0), Math.max(1, Math.min(size, MAX_PAGE_SIZE))))));
    }

    @Operation(summary = "One member's statistics in a season", description = "SESSION-55: any member; the same shape as the group's member detail.")
    @GetMapping("/{seasonId}/stats/members/{userId}")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<GroupMemberStatisticsResponse>> memberStats(@PathVariable Long groupId, @PathVariable Long seasonId,
                                                                                  @PathVariable UUID userId,
                                                                                  @RequestParam(defaultValue = "0") int page,
                                                                                  @RequestParam(defaultValue = "20") int size,
                                                                                  Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success("Season member statistics retrieved successfully",
                seasonService.getMemberStatistics(groupId, seasonId, SecurityUtils.extractUserId(authentication), userId,
                        Math.max(page, 0), Math.max(1, Math.min(size, MAX_PAGE_SIZE)))));
    }

    @Operation(summary = "The sessions linked to a manual season", description = "SESSION-55: any member.")
    @GetMapping("/{seasonId}/sessions")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<List<SeasonLinkedSessionResponse>>> links(@PathVariable Long groupId, @PathVariable Long seasonId,
                                                                                Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success("Season sessions retrieved successfully",
                seasonService.getLinks(groupId, seasonId, SecurityUtils.extractUserId(authentication))));
    }

    @Operation(summary = "Link and unlink sessions of a manual season", description = "SESSION-55: owner or admin; only a MANUAL season that is ONGOING or COMPLETED; at most 20 ids per list.")
    @PutMapping("/{seasonId}/sessions")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<List<SeasonLinkedSessionResponse>>> updateLinks(@PathVariable Long groupId, @PathVariable Long seasonId,
                                                                                      @RequestBody SeasonLinksRequest request,
                                                                                      Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success("Season sessions updated successfully",
                seasonService.updateLinks(groupId, seasonId, SecurityUtils.extractUserId(authentication), request)));
    }

    // ---- the season's thread -----------------------------------------------------------------------------------------

    @Operation(summary = "The season's comments", description = "SESSION-55: members of the season's group.")
    @GetMapping("/{seasonId}/comments")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Page<CommentResponse>>> comments(@PathVariable Long groupId, @PathVariable Long seasonId,
                                                                       @RequestParam(defaultValue = "0") int page,
                                                                       @RequestParam(defaultValue = "20") int size,
                                                                       Authentication authentication) {
        return ResponseEntity.ok(ApiResponse.success("Comments retrieved successfully",
                seasonService.getComments(groupId, seasonId, SecurityUtils.extractUserId(authentication),
                        PageRequest.of(Math.max(page, 0), Math.max(1, Math.min(size, MAX_PAGE_SIZE))))));
    }

    @Operation(summary = "Comment on a season", description = "SESSION-55: members of the season's group.")
    @PostMapping("/{seasonId}/comments")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<CommentResponse>> comment(@PathVariable Long groupId, @PathVariable Long seasonId,
                                                                @Valid @RequestBody CreateCommentRequest request, Authentication authentication) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.success("Comment created successfully",
                seasonService.createComment(groupId, seasonId, SecurityUtils.extractUserId(authentication), request)));
    }

    @Operation(summary = "Like a comment of a season")
    @PostMapping("/{seasonId}/comments/{commentId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> likeComment(@PathVariable Long groupId, @PathVariable Long seasonId, @PathVariable Long commentId,
                                                         Authentication authentication) {
        seasonService.likeComment(groupId, seasonId, commentId, SecurityUtils.extractUserId(authentication));
        return ResponseEntity.ok(ApiResponse.success("Comment liked successfully", null));
    }

    @Operation(summary = "Unlike a comment of a season")
    @DeleteMapping("/{seasonId}/comments/{commentId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> unlikeComment(@PathVariable Long groupId, @PathVariable Long seasonId, @PathVariable Long commentId,
                                                           Authentication authentication) {
        seasonService.unlikeComment(groupId, seasonId, commentId, SecurityUtils.extractUserId(authentication));
        return ResponseEntity.ok(ApiResponse.success("Comment unliked successfully", null));
    }

    @Operation(summary = "Like a season", description = "SESSION-55: likes the season's own post.")
    @PostMapping("/{seasonId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> like(@PathVariable Long groupId, @PathVariable Long seasonId, Authentication authentication) {
        seasonService.like(groupId, seasonId, SecurityUtils.extractUserId(authentication));
        return ResponseEntity.ok(ApiResponse.success("Season liked successfully", null));
    }

    @Operation(summary = "Unlike a season")
    @DeleteMapping("/{seasonId}/like")
    @PreAuthorize("hasRole('USER')")
    public ResponseEntity<ApiResponse<Void>> unlike(@PathVariable Long groupId, @PathVariable Long seasonId, Authentication authentication) {
        seasonService.unlike(groupId, seasonId, SecurityUtils.extractUserId(authentication));
        return ResponseEntity.ok(ApiResponse.success("Season unliked successfully", null));
    }
}
