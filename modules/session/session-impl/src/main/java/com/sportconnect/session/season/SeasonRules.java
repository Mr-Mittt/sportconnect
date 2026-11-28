package com.sportconnect.session.season;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.session.ranking.RankingRules;
import com.sportconnect.session.ranking.RequireList;
import com.sportconnect.session.ranking.SortList;
import com.sportconnect.session.stats.StatisticsSchema;
import com.sportconnect.session.stats.StatsConfigs;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * SESSION-55: a season's own stat list and ranking rule. At creation they are <b>copied from the group's effective ones</b> (a
 * pre-fill, never a live link: later changes of the group do not reach the season) unless the owner sent his own, which are checked
 * like the group's own. Both are stored in the season row in the same shapes the group uses ({@code {columns, config}} and the
 * sort and require lists per kind), so the engine and the board builder read them through the same classes
 * ({@link StatisticsSchema#forGroup}, {@link SortList}, {@link RequireList}).
 */
@Component
@RequiredArgsConstructor
class SeasonRules {

    private final RankingRules rankingRules;

    /** The season's stat list when none is sent: the group's effective one ({@code columns}, {@code config}; the {@code off} map is display only). */
    Map<String, Object> defaultStatsConfig(StatisticsSchema sport, Map<String, Object> groupConfig) {
        return withoutOff(StatsConfigs.effective(sport, groupConfig));
    }

    /** A sent stat list, checked strictly against the sport (as the group's own is) and stored in its full effective form. */
    Map<String, Object> statsConfigOf(Map<String, Object> sent, StatisticsSchema sport) {
        Map<String, Object> parsed = StatsConfigs.parse(sent, sport);
        return withoutOff(StatsConfigs.effective(sport, parsed.isEmpty() ? null : parsed));
    }

    /**
     * The rule the season starts with when none is sent: what the group's board uses today (the group's own rule, else the sport's), read
     * through the season's stat list (a key on a stat the list cannot value is dropped, as a group board drops it). A kind with no rule,
     * or none left, is absent: it builds no board.
     */
    Map<String, Object> defaultRankingRule(Long sportId, Long groupId, StatisticsSchema sport, StatisticsSchema view) {
        Map<String, Object> rule = new LinkedHashMap<>();
        for (String kind : kindsOf(sport)) {
            rankingRules.resolve(sportId, kind, null, groupId)
                    .flatMap(resolved -> resolved.retainedFor(view))
                    .ifPresent(resolved -> rule.put(kind, entry(resolved.sort(), resolved.require())));
        }
        return rule;
    }

    /**
     * A sent rule, checked like a group's own: only the kinds the sport has, every key and condition on a stat the season's list can
     * value and that applies to the kind. An empty or missing sort list drops the kind. Stored in canonical form.
     */
    Map<String, Object> rankingRuleOf(Map<String, Object> sent, StatisticsSchema sport, StatisticsSchema view) {
        Map<String, Object> rule = new LinkedHashMap<>();
        for (Map.Entry<String, Object> kindEntry : sent.entrySet()) {
            String kind = kindEntry.getKey();
            if (!kindsOf(sport).contains(kind)) {
                throw new BadRequestException("SESSION_RANKING_KIND_INVALID", "This kind of board is not available: " + kind,
                        Map.of("reason", RankingRules.PARTNER.equals(kind) ? "SPORT_NOT_GROUPED_BY_PARTNER" : "UNKNOWN"));
            }
            if (!(kindEntry.getValue() instanceof Map<?, ?> node)) {
                throw new BadRequestException("SESSION_RANKING_SORT_INVALID", "A rule is an object with a sort list and a require list",
                        Map.of("reason", "NOT_AN_OBJECT"));
            }
            SortList sort = SortList.parse(node.get("sort"), sport.catalog());
            RankingRules.requireCollected(sort.operands(), view, kind, "SESSION_RANKING_SORT_INVALID");
            RequireList require = RequireList.parse(node.get("require"), sport.catalog());
            RankingRules.requireCollected(require.operands(), view, kind, "SESSION_RANKING_REQUIRE_INVALID");
            if (!sort.isEmpty()) {
                rule.put(kind, entry(sort, require));
            }
        }
        return rule;
    }

    private static List<String> kindsOf(StatisticsSchema sport) {
        List<String> kinds = new ArrayList<>();
        kinds.add(RankingRules.SINGLE);
        if (sport.groupsByPartner()) {
            kinds.add(RankingRules.PARTNER);
        }
        return kinds;
    }

    private static Map<String, Object> entry(SortList sort, RequireList require) {
        Map<String, Object> entry = new LinkedHashMap<>();
        entry.put("sort", new ArrayList<>(sort.toJson()));
        entry.put("require", new ArrayList<>(require.toJson()));
        return entry;
    }

    private static Map<String, Object> withoutOff(Map<String, Object> effective) {
        Map<String, Object> config = new LinkedHashMap<>();
        config.put("columns", effective.get("columns"));
        config.put("config", effective.get("config"));
        return config;
    }
}
