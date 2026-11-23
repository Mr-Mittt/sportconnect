package com.sportconnect.session.record;

import java.util.List;
import java.util.UUID;

/**
 * What a {@link RecordTypeReader} makes of one record: the only thing the ranking code (SESSION-72) and the statistics
 * engine (SESSION-53) see, so neither knows the shape of a record type.
 *
 * @param valid               the record is well formed for its sport (teams, player counts, ids, score consistency)
 * @param invalidReason       why not, a stable upper-case token; {@code null} when valid
 * @param rankable            valid and the score is complete with the first team strictly ahead (a ranking game needs a result)
 * @param notRankableReason   why not, a stable token ({@code NO_SCORE}, {@code FIRST_TEAM_NOT_AHEAD}, the invalid reason,
 *                            {@code RANKING_NOT_AVAILABLE}); {@code null} when rankable
 * @param players             every player named in the record, in team order, no duplicates; empty when invalid
 */
public record RecordFacts(boolean valid, String invalidReason, boolean rankable, String notRankableReason,
                          List<UUID> players) {

    public static RecordFacts invalid(String reason) {
        return new RecordFacts(false, reason, false, reason, List.of());
    }

    /** A valid record with no result yet: a planned game. */
    public boolean isPlanned() {
        return valid && !rankable && "NO_SCORE".equals(notRankableReason);
    }
}
