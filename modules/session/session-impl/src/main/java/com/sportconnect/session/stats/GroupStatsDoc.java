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

    private final StatsCounters counters;
    private final Map<String, Map<String, StatsCounters>> groupings;
    private List<Object> history;

    private GroupStatsDoc(StatsCounters counters, Map<String, Map<String, StatsCounters>> groupings, List<Object> history) {
        this.counters = counters;
        this.groupings = groupings;
        this.history = history;
    }

    public static GroupStatsDoc read(GroupMemberStats row) {
        Map<String, Object> stats = row.getStats() == null ? Map.of() : row.getStats();
        List<Object> history = row.getHistory() == null ? new ArrayList<>() : new ArrayList<>(row.getHistory());
        return new GroupStatsDoc(StatsCounters.fromMap(stats.get("counters")),
                StatsGroupings.read(stats.get("groupings"), StatsCounters::fromMap), history);
    }

    public void writeTo(GroupMemberStats row) {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("counters", counters.toMap());
        stats.put("groupings", StatsGroupings.write(groupings, StatsCounters::toMap));
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

    public boolean hasPointer(long recordId) {
        return StatsHistory.contains(history, recordId);
    }

    public void addPointer(long recordId, long sessionId, boolean ranking) {
        history = StatsHistory.prepend(history, recordId, sessionId, ranking);
    }
}
