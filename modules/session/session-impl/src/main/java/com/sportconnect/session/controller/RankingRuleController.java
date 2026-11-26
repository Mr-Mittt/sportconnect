package com.sportconnect.session.controller;

import com.sportconnect.common.auth.SecurityUtils;
import com.sportconnect.common.dto.ApiResponse;
import com.sportconnect.session.api.dto.RankingRuleRequest;
import com.sportconnect.session.api.dto.RankingRuleResponse;
import com.sportconnect.session.api.service.RankingRuleService;
import io.swagger.v3.oas.annotations.Operation;
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

/** SESSION-54 — admin: the server-only ranking rules of the leaderboards, and an on-demand ranking run. ADMIN only. */
@RestController
@RequestMapping("/api/admin/sessions/ranking")
@RequiredArgsConstructor
@Tag(name = "Ranking rules", description = "Admin: how a sport's leaderboards are ordered, and running the ranking now.")
public class RankingRuleController {

    private final RankingRuleService ruleService;

    @Operation(summary = "Set a ranking rule", description = "SESSION-54: creates or replaces the sort list of a board kind for a sport "
            + "(scopeType SPORT) or a country's boards (scopeType COUNTRY with scopeId). Marks the covered boards for a full rebuild. ADMIN only.")
    @PutMapping("/rules/{sportId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<RankingRuleResponse>> save(Authentication authentication, @PathVariable Long sportId,
                                                                 @RequestBody RankingRuleRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Ranking rule saved",
                ruleService.save(SecurityUtils.extractUserId(authentication), sportId, request)));
    }

    @Operation(summary = "List the ranking rules of a sport", description = "SESSION-54: every rule of the sport, the default first. ADMIN only.")
    @GetMapping("/rules/{sportId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<List<RankingRuleResponse>>> list(@PathVariable Long sportId) {
        return ResponseEntity.ok(ApiResponse.success("Ranking rules", ruleService.list(sportId)));
    }

    @Operation(summary = "Remove a ranking rule", description = "SESSION-54: the boards it covered fall back to a broader rule or lose that "
            + "kind of board, and are rebuilt. ADMIN only.")
    @DeleteMapping("/rules/{sportId}")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> delete(@PathVariable Long sportId, @RequestParam(defaultValue = "SPORT") String scopeType,
                                                    @RequestParam(required = false) Long scopeId, @RequestParam String kind) {
        ruleService.delete(sportId, scopeType, scopeId, kind);
        return ResponseEntity.ok(ApiResponse.success("Ranking rule removed", null));
    }

    @Operation(summary = "Rebuild a sport's boards", description = "SESSION-54: marks every board of the sport for a full rebuild from the "
            + "players' statistics and asks the ranking worker to run now. ADMIN only.")
    @PostMapping("/{sportId}/rebuild")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> rebuild(@PathVariable Long sportId) {
        ruleService.rebuild(sportId);
        return ResponseEntity.ok(ApiResponse.success("Rebuild requested", null));
    }

    @Operation(summary = "Run the ranking now", description = "SESSION-54: the nightly pass on demand (every dirty board). ADMIN only.")
    @PostMapping("/run")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<Void>> run() {
        ruleService.runNow();
        return ResponseEntity.ok(ApiResponse.success("Ranking run requested", null));
    }
}
