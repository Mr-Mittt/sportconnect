package com.sportconnect.session.record;

import java.util.List;
import java.util.Map;
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
 * @param teams               the players of each team, in record order; empty when invalid
 * @param participants        SESSION-53: one entry per player with the outcome and the numbers the game gives that player,
 *                            filled only when the record has a result the statistics can count (that is, when it is
 *                            {@code rankable}); empty otherwise
 */
public record RecordFacts(boolean valid, String invalidReason, boolean rankable, String notRankableReason,
                          List<UUID> players, List<List<UUID>> teams, List<Participant> participants) {

    /** How a game ended for one player. {@code DRAW} arrives with SESSION-59; {@code NONE} is a record with no result. */
    public enum Outcome {
        WIN, LOSS, DRAW, NONE
    }

    /**
     * One player in a counted game.
     *
     * @param team    the index of the player's team in the record
     * @param metrics the numbers this game gives the player, by metric key (the COMPETITIVE reader gives
     *                {@code scoreFor} and {@code scoreAgainst}); the schema decides which of them are kept
     */
    public record Participant(UUID userId, int team, Outcome outcome, Map<String, Double> metrics) {
    }

    /** A record with players but no teams or participants (SESSION-72 callers and tests that only look at the players). */
    public RecordFacts(boolean valid, String invalidReason, boolean rankable, String notRankableReason, List<UUID> players) {
        this(valid, invalidReason, rankable, notRankableReason, players, List.of(), List.of());
    }

    public static RecordFacts invalid(String reason) {
        return new RecordFacts(false, reason, false, reason, List.of(), List.of(), List.of());
    }

    /** A valid record with no result yet: a planned game. */
    public boolean isPlanned() {
        return valid && !rankable && "NO_SCORE".equals(notRankableReason);
    }
}
