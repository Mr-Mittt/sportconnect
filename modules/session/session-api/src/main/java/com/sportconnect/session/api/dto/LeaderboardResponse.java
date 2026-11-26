package com.sportconnect.session.api.dto;

import java.time.Instant;
import java.util.List;

/**
 * SESSION-54 slice B: a page of a board ({@code GET /api/sessions/group/{groupId}/leaderboard} and
 * {@code GET /api/leaderboards/regions|countries/{id}}).
 *
 * @param sort       the board's own sort list as it was built ({@code [{"key":"wins","dir":"DESC"}]}), which names what {@code values} are
 * @param total      how many entries the board holds (before anyone is dropped at read time)
 * @param entries    one page, best first; a deactivated player, or one who left the group, is not shown
 * @param me         the caller's own place (the best one among the pairs they are in), {@code null} when they are not on the board
 * @param nextCursor send it back as {@code cursor} for the next page, {@code null} on the last page
 * @param rankedAt   when the board was last built, {@code null} when it has never been built (then there are no entries)
 */
public record LeaderboardResponse(Long sportId, String scopeType, Long scopeId, String kind, List<Object> sort, int total,
                                  List<LeaderboardEntryDto> entries, LeaderboardEntryDto me, Integer nextCursor,
                                  Instant rankedAt) {
}
