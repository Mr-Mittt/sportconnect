package com.sportconnect.session.ranking;

import com.sportconnect.session.stats.StatisticsSchema;
import com.sportconnect.session.stats.StatsCounters;

import java.util.UUID;

/**
 * SESSION-54: the trees of one board's two kinds, {@code SINGLE} and {@code PARTNER} (either is {@code null} when the sport has
 * no rule for it), and the one rule for putting a player on them. A subject is on a tree only while its counters meet the rule's
 * <b>preconditions</b> ({@link RequireList}); when they stop meeting them it is removed (a rebuilt tree simply never gets it).
 * Applying a player's entries is idempotent: the same counters give the same tuple, so a pair reached from both partners' blobs,
 * or a player rebuilt twice, changes nothing the second time.
 */
public final class BoardSet {

    private final BoardTree single;
    private final BoardTree pair;
    private final RequireList singleRequire;
    private final RequireList pairRequire;
    private final StatisticsSchema schema;

    /**
     * @param single        the {@code SINGLE} tree, or {@code null}
     * @param pair          the {@code PARTNER} tree, or {@code null}
     * @param singleRequire what a player must meet to be listed
     * @param pairRequire   what a pair must meet to be listed
     */
    public BoardSet(StatisticsSchema schema, BoardTree single, RequireList singleRequire, BoardTree pair, RequireList pairRequire) {
        this.schema = schema;
        this.single = single;
        this.pair = pair;
        this.singleRequire = singleRequire;
        this.pairRequire = pairRequire;
    }

    public BoardTree single() {
        return single;
    }

    public BoardTree pair() {
        return pair;
    }

    /** Puts one player's entries on the trees, or takes them off when the player no longer qualifies. */
    public void apply(SubjectNames names, UUID user, PlayerEntries entries) {
        if (single != null) {
            String subject = names.single(user);
            if (subject != null) {
                if (entries.single() != null && qualifies(entries.single(), singleRequire)) {
                    single.put(subject, tupleOf(single, entries.single()));
                } else {
                    single.remove(subject);
                }
            }
        }
        if (pair != null) {
            entries.partners().forEach((partnerKey, counters) -> {
                String subject = names.pair(user, partnerKey);
                if (subject == null) {
                    return;
                }
                if (qualifies(counters, pairRequire)) {
                    pair.put(subject, tupleOf(pair, counters));
                } else {
                    pair.remove(subject);
                }
            });
        }
    }

    private boolean qualifies(StatsCounters counters, RequireList require) {
        return !counters.isEmpty() && require.test(counters, schema);
    }

    private SortTuple tupleOf(BoardTree tree, StatsCounters counters) {
        return SortTuple.of(tree.sort().valuesOf(counters, schema));
    }
}
