package com.sportconnect.session.stats;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * SESSION-55: a member's statistics row, whichever table keeps it: a group's ({@link GroupMemberStats}) or a season's
 * ({@link SeasonMemberStats}). Both hold the same two documents ({@code stats}: counters and groupings; {@code history}: the pointers), read
 * and written by {@link GroupStatsDoc}, so a season counts into the same shapes a group does.
 */
public interface MemberStatsRow {

    UUID getUserId();

    Map<String, Object> getStats();

    void setStats(Map<String, Object> stats);

    List<Object> getHistory();

    void setHistory(List<Object> history);

    Instant getUpdatedAt();

    void setUpdatedAt(Instant updatedAt);
}
