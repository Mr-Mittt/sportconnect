package com.sportconnect.session.ranking;

import com.sportconnect.session.stats.StatisticsSchema;
import com.sportconnect.session.stats.SportRankingRule;
import com.sportconnect.session.stats.SportRankingRuleRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Optional;

/**
 * SESSION-54: which sort rule a board uses. A board takes the <b>most specific rule that exists</b>: a group's own, then its
 * country's (every region board and the country board of that country share it), then the sport's default. <b>A group has no
 * country yet</b> (owner, 2026-11-26: "we will handle group country later"), so a group board uses its own rule or the sport's
 * default. A sport with no rule for a kind has no board of that kind (there is no default order).
 */
@Service
@RequiredArgsConstructor
public class RankingRules {

    public static final String SINGLE = "SINGLE";
    public static final String PARTNER = "PARTNER";

    /** A rule as a board uses it: the order, the preconditions to be listed, and the version of the row it came from. */
    public record Resolved(SortList sort, RequireList require, int version) {

        /**
         * SESSION-84: this rule as a group board with this view of the stats uses it: the keys and conditions on stats the view cannot value
         * are ignored, and a rule left with no sort key at all builds no board (empty).
         */
        public Optional<Resolved> retainedFor(StatisticsSchema view) {
            SortList kept = sort.retaining(view::computes);
            return kept.isEmpty() ? Optional.empty() : Optional.of(new Resolved(kept, require.retaining(view::computes), version));
        }
    }

    private final SportRankingRuleRepository repository;

    /**
     * @param countryId the country of a region or country board, or {@code null} (always {@code null} for a group board)
     * @param groupId   the group of a group board, or {@code null}
     * @return the rule, or empty when the sport has none for this kind, or its stored sort list cannot be read
     */
    public Optional<Resolved> resolve(Long sportId, String kind, Long countryId, Long groupId) {
        Optional<SportRankingRule> rule = Optional.empty();
        if (groupId != null) {
            rule = repository.findById(new SportRankingRule.Key(sportId, SportRankingRule.GROUP, groupId, kind));
        }
        if (rule.isEmpty() && countryId != null) {
            rule = repository.findById(new SportRankingRule.Key(sportId, SportRankingRule.COUNTRY, countryId, kind));
        }
        if (rule.isEmpty()) {
            rule = repository.findById(new SportRankingRule.Key(sportId, SportRankingRule.SPORT, 0L, kind));
        }
        return rule.map(row -> new Resolved(SortList.fromStored(row.getSort()), RequireList.fromStored(row.getConditions()),
                row.getVersion())).filter(resolved -> !resolved.sort().isEmpty());
    }
}
