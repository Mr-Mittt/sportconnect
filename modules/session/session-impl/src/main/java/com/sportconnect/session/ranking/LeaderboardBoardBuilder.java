package com.sportconnect.session.ranking;

import com.sportconnect.common.exception.ResourceNotFoundException;
import com.sportconnect.group.api.service.GroupMemberNumberService;
import com.sportconnect.session.stats.GroupMemberStats;
import com.sportconnect.session.stats.GroupMemberStatsRepository;
import com.sportconnect.session.stats.GroupStatsDoc;
import com.sportconnect.session.stats.LeaderboardEntry;
import com.sportconnect.session.stats.LeaderboardEntryRepository;
import com.sportconnect.session.stats.PlayerStatsDoc;
import com.sportconnect.session.stats.StatBoardChangeRepository;
import com.sportconnect.session.stats.StatBoardRun;
import com.sportconnect.session.stats.StatBoardRunRepository;
import com.sportconnect.session.stats.StatisticsSchema;
import com.sportconnect.session.stats.UserSportStats;
import com.sportconnect.session.stats.UserSportStatsRepository;
import com.sportconnect.sport.api.service.SportService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * SESSION-54: works out what one board looks like now. <b>Reads only</b> (no transaction, so no blob piles up in a persistence
 * context); {@link LeaderboardWriter} publishes the result in one short transaction.
 *
 * <p><b>Incremental</b> (a region, or a country's single board whose rule is unchanged): load the board's trees, take the
 * players with a change row up to a cutoff (the board's highest change id at this moment), read their blobs in chunks (one query
 * per chunk, never one per player), and put each player's entries on the trees by their current counters; a subject whose
 * numbers changed is looked up in the tree's subject index and moved. <b>Full</b> (a board with no tree yet, a changed rule, a
 * rule flag, and every group board, whose rows are few): rebuild the trees from scratch, a region or country from one pass over
 * the sport's players ({@link BoardScanner}), a group from its members' rows. The <b>previous rank</b> of every subject is its
 * rank in the tree as it was before this run, also across a rule change. The country's {@code PARTNER} board is never built
 * from players: it is the merge of its region boards ({@link CountryMerge}), capped at {@code slotsPerRegion} entries for each
 * region board.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class LeaderboardBoardBuilder {

    /** What one board needs: its sport's schema, the rules of its two kinds, the trees it has, and whether it must be rebuilt whole. */
    public record BoardPlan(StatBoardRun run, StatisticsSchema schema, Optional<RankingRules.Resolved> singleRule,
                            Optional<RankingRules.Resolved> pairRule, LeaderboardEntry existingSingle,
                            LeaderboardEntry existingPair, boolean full) {

        public boolean isGroup() {
            return "GROUP".equals(run.getScopeType());
        }

        public boolean isCountry() {
            return "COUNTRY".equals(run.getScopeType());
        }

        /** Empty trees for the kinds this board builds from players: a country's {@code PARTNER} tree is merged from its regions, not built here. */
        public BoardSet emptySet() {
            BoardTree single = singleRule.map(rule -> new BoardTree(rule.sort())).orElse(null);
            BoardTree pair = !isCountry() ? pairRule.map(rule -> new BoardTree(rule.sort())).orElse(null) : null;
            return new BoardSet(schema, single, singleRule.map(RankingRules.Resolved::require).orElse(RequireList.none()), pair,
                    pairRule.map(RankingRules.Resolved::require).orElse(RequireList.none()));
        }
    }

    /** One tree to publish. */
    public record Result(String kind, BoardTree tree, Map<String, Integer> previous, int cap, RankingRules.Resolved rule) {
    }

    /**
     * What a build came to.
     *
     * @param results       the trees to write
     * @param deleteKinds   kinds the board has a tree for but no rule any more: their rows are removed
     * @param cutoff        the change id the run read up to ({@code null}: no change rows)
     * @param anotherPass   true when a region tree the country merge needed was built with another rule: the board stays dirty
     */
    public record Computation(List<Result> results, List<String> deleteKinds, Long cutoff, boolean anotherPass) {
    }

    private final StatBoardRunRepository runs;
    private final StatBoardChangeRepository changes;
    private final LeaderboardEntryRepository entries;
    private final UserSportStatsRepository userStats;
    private final GroupMemberStatsRepository groupStats;
    private final RankingRules rules;
    private final SportService sportService;
    private final GroupMemberNumberService memberNumbers;
    private final BoardScanner scanner;

    /** How many entries of the country's pair board there can be for each region board it is merged from (owner: 1,000). */
    @Value("${app.stats.ranking.country-slots-per-region:1000}")
    private int slotsPerRegion = 1000;

    @Value("${app.stats.ranking.chunk-size:500}")
    private int chunkSize = 500;

    /** Reads what the board needs; never writes. */
    public BoardPlan plan(StatBoardRun run) {
        Long sportId = run.getSportId();
        StatisticsSchema schema = schemaOf(sportId);
        boolean group = "GROUP".equals(run.getScopeType());
        Long groupId = group ? run.getScopeId() : null;
        Long ruleCountry = group ? null : "COUNTRY".equals(run.getScopeType()) ? run.getScopeId() : run.getCountryId();
        Optional<RankingRules.Resolved> single = schema.collects()
                ? rules.resolve(sportId, RankingRules.SINGLE, ruleCountry, groupId) : Optional.empty();
        Optional<RankingRules.Resolved> pair = schema.collects() && schema.groupsByPartner()
                ? rules.resolve(sportId, RankingRules.PARTNER, ruleCountry, groupId) : Optional.empty();
        LeaderboardEntry existingSingle = entries.findById(key(run, RankingRules.SINGLE)).orElse(null);
        LeaderboardEntry existingPair = entries.findById(key(run, RankingRules.PARTNER)).orElse(null);
        boolean country = "COUNTRY".equals(run.getScopeType());
        boolean full = Boolean.TRUE.equals(run.getFullRebuild())
                || differs(existingSingle, single)
                || (!country && differs(existingPair, pair));
        return new BoardPlan(run, schema, single, pair, existingSingle, existingPair, full);
    }

    /** A kind with a rule needs a rebuild when it has no tree, or its tree was built with another sort list or other preconditions. */
    private boolean differs(LeaderboardEntry existing, Optional<RankingRules.Resolved> rule) {
        if (rule.isEmpty()) {
            return false;
        }
        if (existing == null) {
            return true;
        }
        BoardTree tree = BoardTree.fromJson(existing.getTree());
        Object stored = existing.getTree() == null ? null : existing.getTree().get("require");
        return !tree.sort().equals(rule.get().sort()) || !RequireList.fromStored(stored).equals(rule.get().require());
    }

    /**
     * Builds the board's trees.
     *
     * @param prebuilt when the board needs a full rebuild, the set a shared pass of {@link BoardScanner} already filled for it
     *                 ({@code null}: the board scans for itself)
     */
    public Computation compute(BoardPlan plan, BoardSet prebuilt) {
        StatBoardRun run = plan.run();
        Long cutoff = changes.maxId(run.getSportId(), run.getScopeType(), run.getScopeId());
        List<Result> results = new ArrayList<>();
        List<String> deleteKinds = new ArrayList<>();
        if (plan.singleRule().isEmpty() && plan.existingSingle() != null) {
            deleteKinds.add(RankingRules.SINGLE);
        }
        if (plan.pairRule().isEmpty() && plan.existingPair() != null) {
            deleteKinds.add(RankingRules.PARTNER);
        }
        boolean anotherPass = false;
        if (plan.singleRule().isEmpty() && plan.pairRule().isEmpty()) {
            // no rule for any kind: there is nothing to build, so the players are not read; the change rows are still consumed
            return new Computation(results, deleteKinds, cutoff, false);
        }

        if (plan.isGroup()) {
            BoardSet set = fromGroup(plan);
            addResults(results, plan, set, previousOf(plan.existingSingle()), previousOf(plan.existingPair()));
        } else if (plan.full()) {
            BoardSet set = prebuilt != null ? prebuilt : scanOwn(plan);
            addResults(results, plan, set, previousOf(plan.existingSingle()), previousOf(plan.existingPair()));
        } else {
            BoardTree single = plan.singleRule().isPresent() ? BoardTree.fromJson(plan.existingSingle().getTree()) : null;
            BoardTree pair = !plan.isCountry() && plan.pairRule().isPresent() ? BoardTree.fromJson(plan.existingPair().getTree()) : null;
            Map<String, Integer> previousSingle = single == null ? Map.of() : single.ranks();
            Map<String, Integer> previousPair = pair == null ? Map.of() : pair.ranks();
            BoardSet set = new BoardSet(plan.schema(), single, plan.singleRule().map(RankingRules.Resolved::require).orElse(RequireList.none()),
                    pair, plan.pairRule().map(RankingRules.Resolved::require).orElse(RequireList.none()));
            applyChanged(plan, set, cutoff);
            addResults(results, plan, set, previousSingle, previousPair);
        }

        if (plan.isCountry() && plan.pairRule().isPresent()) {
            anotherPass = addCountryPair(results, plan);
        }
        return new Computation(results, deleteKinds, cutoff, anotherPass);
    }

    private void addResults(List<Result> results, BoardPlan plan, BoardSet set, Map<String, Integer> previousSingle,
                            Map<String, Integer> previousPair) {
        if (set.single() != null && plan.singleRule().isPresent()) {
            results.add(new Result(RankingRules.SINGLE, set.single(), previousSingle, 0, plan.singleRule().get()));
        }
        if (set.pair() != null && plan.pairRule().isPresent()) {
            results.add(new Result(RankingRules.PARTNER, set.pair(), previousPair, 0, plan.pairRule().get()));
        }
    }

    /** The players who changed since the last run, read in chunks, put on the trees by their current counters. */
    private void applyChanged(BoardPlan plan, BoardSet set, Long cutoff) {
        if (cutoff == null) {
            return;
        }
        StatBoardRun run = plan.run();
        List<UUID> users = changes.findUserIdsUpTo(run.getSportId(), run.getScopeType(), run.getScopeId(), cutoff);
        SubjectNames names = SubjectNames.userIds();
        for (int from = 0; from < users.size(); from += chunkSize) {
            List<UUID> chunk = users.subList(from, Math.min(users.size(), from + chunkSize));
            for (UserSportStats row : userStats.findAllOf(run.getSportId(), chunk)) {
                PlayerStatsDoc doc = PlayerStatsDoc.read(row);
                set.apply(names, row.getUserId(), plan.isCountry() ? PlayerEntries.ofCountry(doc, run.getScopeId())
                        : PlayerEntries.ofRegion(doc, run.getScopeId()));
            }
        }
    }

    /** A board that must be rebuilt whole and has no shared pass: it scans the sport's players for itself. */
    private BoardSet scanOwn(BoardPlan plan) {
        StatBoardRun run = plan.run();
        BoardSet set = plan.emptySet();
        BoardScanner.Target target = new BoardScanner.Target(plan.isCountry() ? "COUNTRY" : "REGION", run.getScopeId());
        Long country = plan.isCountry() ? run.getScopeId() : run.getCountryId();
        scanner.scan(run.getSportId(), country, Map.of(target, set));
        return set;
    }

    /** A group board is always built whole: the group's member rows are few. */
    private BoardSet fromGroup(BoardPlan plan) {
        StatBoardRun run = plan.run();
        BoardSet set = plan.emptySet();
        List<GroupMemberStats> rows = groupStats.findByGroupIdAndSportId(run.getScopeId(), run.getSportId());
        if (rows.isEmpty()) {
            return set;
        }
        Map<UUID, Integer> numbers = memberNumbers.getMemberNumbers(run.getScopeId(),
                rows.stream().map(GroupMemberStats::getUserId).collect(Collectors.toList()));
        SubjectNames names = SubjectNames.memberNumbers(numbers);
        for (GroupMemberStats row : rows) {
            set.apply(names, row.getUserId(), PlayerEntries.ofGroup(GroupStatsDoc.read(row)));
        }
        return set;
    }

    /**
     * The country's pair board: its region boards merged, each pair at its best region only, capped at
     * {@code slotsPerRegion} for each region board merged. A region tree built with another sort list than the country's rule is
     * left out and the country stays dirty (the region is rebuilt, then the country again).
     *
     * @return whether a region tree was left out
     */
    private boolean addCountryPair(List<Result> results, BoardPlan plan) {
        StatBoardRun run = plan.run();
        RankingRules.Resolved rule = plan.pairRule().get();
        List<Long> regionIds = runs.findOfCountry(run.getSportId(), run.getScopeId()).stream()
                .filter(board -> "REGION".equals(board.getScopeType())).map(StatBoardRun::getScopeId).sorted().toList();
        List<BoardTree> trees = new ArrayList<>();
        boolean left = false;
        if (!regionIds.isEmpty()) {
            for (LeaderboardEntry entry : entries.findBoards(run.getSportId(), "REGION", RankingRules.PARTNER, regionIds)) {
                BoardTree tree = BoardTree.fromJson(entry.getTree());
                if (!tree.sort().equals(rule.sort())) {
                    left = true;
                } else if (tree.size() > 0) {
                    trees.add(tree);
                }
            }
        }
        BoardTree merged = CountryMerge.mergeRegions(rule.sort(), trees);
        results.add(new Result(RankingRules.PARTNER, merged, previousOf(plan.existingPair()),
                slotsPerRegion * Math.max(1, trees.size()), rule));
        return left;
    }

    private Map<String, Integer> previousOf(LeaderboardEntry existing) {
        return existing == null ? Map.of() : BoardTree.fromJson(existing.getTree()).ranks();
    }

    private StatisticsSchema schemaOf(Long sportId) {
        try {
            return StatisticsSchema.of(sportService.getResultSchema(sportId));
        } catch (ResourceNotFoundException e) {
            return StatisticsSchema.of(Map.of());
        }
    }

    private static LeaderboardEntry.Key key(StatBoardRun run, String kind) {
        return new LeaderboardEntry.Key(run.getSportId(), run.getScopeType(), run.getScopeId(), kind);
    }
}
