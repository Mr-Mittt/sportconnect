package com.sportconnect.session.stats;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * SESSION-53: the working copy of one {@link GroupMemberStats} row. {@code stats} is {@code {counters, groupings: {<by>:
 * {<key>: counters}}}} over all the games of the group's sessions (ranking or not), {@code history} the pointers of
 * {@link StatsHistory}. The shapes are documented in {@code documentation/md/STATISTICS_JSONB_REFERENCE.md}.
 */
public final class GroupStatsDoc {

    private StatsCounters counters;
    private final Map<String, Map<String, StatsCounters>> groupings;
    private List<Object> history;

    private GroupStatsDoc(StatsCounters counters, Map<String, Map<String, StatsCounters>> groupings, List<Object> history) {
        this.counters = counters;
        this.groupings = groupings;
        this.history = history;
    }

    public static GroupStatsDoc read(MemberStatsRow row) {
        Map<String, Object> stats = row.getStats() == null ? Map.of() : row.getStats();
        List<Object> history = row.getHistory() == null ? new ArrayList<>() : new ArrayList<>(row.getHistory());
        return new GroupStatsDoc(StatsCounters.decode(stats.get("counters")),
                StatsGroupings.read(stats.get("groupings"), StatsCounters::decode), history);
    }

    public void writeTo(MemberStatsRow row) {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("counters", counters.encode());
        Map<String, Object> grouped = StatsGroupings.write(groupings, StatsCounters::encode);
        if (!grouped.isEmpty()) {
            stats.put("groupings", grouped);      // a member with no grouping carries no empty node
        }
        row.setStats(stats);
        row.setHistory(new ArrayList<>(history));
        row.setUpdatedAt(java.time.Instant.now());
    }

    public StatsCounters counters() {
        return counters;
    }

    /** SESSION-73: every group the member has counters for, {@code by} dimension then key, for reading only. */
    public Map<String, Map<String, StatsCounters>> groupings() {
        return java.util.Collections.unmodifiableMap(groupings);
    }

    /** The counters of one group, {@code by} a partner or a team (created empty the first time). */
    public StatsCounters group(String by, String key) {
        return StatsGroupings.group(groupings, by, key, StatsCounters::new);
    }

    /**
     * SESSION-55: takes a session's contribution back out of this row, for a season that drops a linked session. {@code contribution} is
     * what the same games add to a blank row (the counters are sums and counts, so the subtraction is exact); a partner or team entry that
     * the subtraction empties is removed, and the history loses the pointers of {@code recordIds}.
     */
    public void subtract(GroupStatsDoc contribution, java.util.Set<Long> recordIds) {
        counters = counters.minus(contribution.counters);
        contribution.groupings.forEach((by, keys) -> {
            Map<String, StatsCounters> mine = groupings.get(by);
            if (mine == null) {
                return;
            }
            keys.forEach((key, gone) -> {
                StatsCounters existing = mine.get(key);
                if (existing != null) {
                    StatsCounters left = existing.minus(gone);
                    if (left.isZero()) {
                        mine.remove(key);
                    } else {
                        mine.put(key, left);
                    }
                }
            });
            if (mine.isEmpty()) {
                groupings.remove(by);
            }
        });
        history = StatsHistory.removeAll(history, recordIds);
    }

    public boolean hasPointer(long recordId) {
        return StatsHistory.contains(history, recordId);
    }

    public void addPointer(long recordId, boolean ranking) {
        history = StatsHistory.prepend(history, recordId, ranking);
    }
}
