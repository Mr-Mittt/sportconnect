package com.sportconnect.session.record;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What a {@link RecordTypeReader} makes of one record: the only thing the ranking code (SESSION-72) and the statistics
 * engine (SESSION-53) see, so neither knows the shape of a record type.
 *
 * <p>Two questions are answered separately (owner, 2026-11-25):
 * <ul>
 *   <li><b>Countable</b>: can the statistics count this game? It must be valid and have an outcome: the team with the higher
 *       score in the ranking slot wins; equal scores are a draw only when the sport allows draws ({@code record.data.allowDraws}),
 *       else the game is not countable ({@code SCORES_EQUAL}); a game with <b>no score at all</b> is a win for the first team
 *       (the contract's position rule), so a planned game counts too.</li>
 *   <li><b>Rankable</b>: can it be a ranking game? It must be countable <em>and</em> have a score in the ranking slot
 *       (a ranking game needs a result, {@code NO_SCORE} otherwise) <em>and</em> the same number of players on both sides
 *       ({@code TEAM_SIZES_DIFFER}). Which team is named first does not matter.</li>
 * </ul>
 *
 * @param valid               the record is well formed for its sport (teams, player counts, ids, score consistency)
 * @param invalidReason       why not, a stable upper-case token; {@code null} when valid
 * @param rankable            valid, the ranking slot is scored, the sides have the same size, and the game has an outcome
 * @param notRankableReason   why not, a stable token ({@code NO_SCORE}, {@code TEAM_SIZES_DIFFER}, {@code SCORES_EQUAL}, the
 *                            invalid reason, {@code RANKING_NOT_AVAILABLE}); {@code null} when rankable
 * @param countable           valid and the game has an outcome the statistics can count (see above)
 * @param notCountableReason  why not ({@code SCORES_EQUAL} or the invalid reason); {@code null} when countable
 * @param players             every player named in the record, in team order, no duplicates; empty when invalid
 * @param teams               the players of each team, in record order; empty when invalid
 * @param participants        SESSION-53: one entry per player with the outcome and the numbers the game gives that player,
 *                            filled only when the game is {@code countable}; empty otherwise
 */
public record RecordFacts(boolean valid, String invalidReason, boolean rankable, String notRankableReason,
                          boolean countable, String notCountableReason,
                          List<UUID> players, List<List<UUID>> teams, List<Participant> participants) {

    /** How a game ended for one player. {@code NONE} is a record with no result (never produced for a countable game). */
    public enum Outcome {
        WIN, LOSS, DRAW, NONE
    }

    /**
     * One player in a counted game.
     *
     * @param team    the index of the player's team in the record
     * @param metrics the numbers this game gives the player, by metric key (the COMPETITIVE reader gives
     *                {@code scoreFor} and {@code scoreAgainst} when a score was filled, none otherwise); the schema decides
     *                which of them are kept
     */
    public record Participant(UUID userId, int team, Outcome outcome, Map<String, Double> metrics) {
    }

    /**
     * A record whose ranking and counting answers are the same (SESSION-72 callers and tests that only look at the players and
     * at {@code rankable}): countable exactly when rankable, for the same reason.
     */
    public RecordFacts(boolean valid, String invalidReason, boolean rankable, String notRankableReason,
                       List<UUID> players, List<List<UUID>> teams, List<Participant> participants) {
        this(valid, invalidReason, rankable, notRankableReason, rankable, notRankableReason, players, teams, participants);
    }

    /** A record with players but no teams or participants (SESSION-72 callers and tests that only look at the players). */
    public RecordFacts(boolean valid, String invalidReason, boolean rankable, String notRankableReason, List<UUID> players) {
        this(valid, invalidReason, rankable, notRankableReason, players, List.of(), List.of());
    }

    public static RecordFacts invalid(String reason) {
        return new RecordFacts(false, reason, false, reason, false, reason, List.of(), List.of(), List.of());
    }

    /** A valid record with no score in the ranking slot yet: a planned game (it may be proposed, it cannot be confirmed). */
    public boolean isPlanned() {
        return valid && !rankable && "NO_SCORE".equals(notRankableReason);
    }
}
