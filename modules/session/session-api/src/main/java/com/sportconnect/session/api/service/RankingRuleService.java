package com.sportconnect.session.api.service;

import com.sportconnect.session.api.dto.RankingRuleRequest;
import com.sportconnect.session.api.dto.RankingRuleResponse;

import java.util.List;
import java.util.UUID;

/**
 * SESSION-54 — the server-only ranking rules of the leaderboards (admin only; the controller gates the role). A rule is data:
 * an ordered list of sort keys that names catalog stats, never a class. A change makes the sport's boards (or the country's)
 * rebuild whole at the next ranking run.
 */
public interface RankingRuleService {

    /**
     * Creates or replaces the rule of a sport, scope and kind, and marks the boards it covers for a full rebuild.
     *
     * @throws com.sportconnect.common.exception.ResourceNotFoundException the sport does not exist
     * @throws com.sportconnect.common.exception.BadRequestException       a coded 400 ({@code SESSION_RANKING_SORT_INVALID},
     *                                                                     {@code SESSION_RANKING_KIND_INVALID},
     *                                                                     {@code SESSION_RANKING_SCOPE_INVALID},
     *                                                                     {@code SESSION_RANKING_MIN_GAMES_INVALID})
     * @throws com.sportconnect.common.exception.ConflictException         409 {@code SESSION_RANKING_STATISTICS_NOT_CONFIGURED}: the
     *                                                                     sport's result schema collects nothing
     */
    RankingRuleResponse save(UUID adminId, Long sportId, RankingRuleRequest request);

    /** Every rule of the sport, the sport default first. */
    List<RankingRuleResponse> list(Long sportId);

    /** Removes a rule (the boards it covered fall back to a broader rule, or lose that kind of board) and marks them for a rebuild. */
    void delete(Long sportId, String scopeType, Long scopeId, String kind);

    /** Marks every board of the sport for a full rebuild and asks the ranking worker to run now. */
    void rebuild(Long sportId);

    /** Asks the ranking worker to rank every dirty board now (the nightly pass, on demand). */
    void runNow();
}
