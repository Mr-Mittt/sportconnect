package com.sportconnect.session.stats;

import com.sportconnect.session.record.RecordFacts.Outcome;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * SESSION-53 rework (owner, 2026-11-25): the statistics a record type supports, the one list the server and the client
 * share. A sport picks from it in {@code record.scoreboard.columns}; the server collects exactly what those columns need and
 * nothing else, and a sport that lists nothing collects nothing. There is no custom metric and no default.
 *
 * <p>A stat is {@link Kind#COUNTED} (a count of the games, or of the games with one outcome), {@link Kind#SUMMED} (the sum of
 * a number the reader gives each player) or {@link Kind#FORMULA} (computed from two others when read, never stored). Only the
 * first two are stored; a formula column makes the server store its operands.
 *
 * <p>{@code COMPETITIVE} (two teams, a winner) is the only record type today; its keys are exactly those of
 * {@code COMPETITIVE.scoreboard.columns} in the client's {@code record-ui-v1.json}, in the same order, and a contract test
 * fails when the two drift. A metric type (running, swimming: SESSION-58) will have its own list.
 */
public final class StatsCatalog {

    /** How a stat gets its value. */
    public enum Kind {
        COUNTED, SUMMED, FORMULA
    }

    /**
     * One supported stat.
     *
     * @param formula the two-operand formula of a {@link Kind#FORMULA} stat ({@link StatsFormulas}); {@code null} otherwise
     */
    public record Stat(String key, Kind kind, String formula) {

        /** Whether this stat is kept in the counters (the others are computed from those that are). */
        public boolean stored() {
            return kind != Kind.FORMULA;
        }
    }

    private static final Map<String, Map<String, Stat>> BY_TYPE = Map.of("COMPETITIVE", competitive());

    private StatsCatalog() {
    }

    private static Map<String, Stat> competitive() {
        Map<String, Stat> stats = new LinkedHashMap<>();
        add(stats, new Stat("games", Kind.COUNTED, null));
        add(stats, new Stat("wins", Kind.COUNTED, null));
        add(stats, new Stat("losses", Kind.COUNTED, null));
        add(stats, new Stat("winRate", Kind.FORMULA, "wins/games"));
        add(stats, new Stat("winDiff", Kind.FORMULA, "wins-losses"));
        add(stats, new Stat("scoreFor", Kind.SUMMED, null));
        add(stats, new Stat("scoreAgainst", Kind.SUMMED, null));
        add(stats, new Stat("scoreDiff", Kind.FORMULA, "scoreFor-scoreAgainst"));
        return Collections.unmodifiableMap(stats);
    }

    private static void add(Map<String, Stat> stats, Stat stat) {
        stats.put(stat.key(), stat);
    }

    /** The stats a record type supports, in the order the client lists them; empty for a type with no catalog. */
    public static Map<String, Stat> forType(String recordType) {
        return recordType == null ? Map.of() : BY_TYPE.getOrDefault(recordType, Map.of());
    }

    /**
     * Whether a game with this outcome counts toward a counted stat: {@code games} counts every game, {@code wins} a win,
     * {@code losses} a loss. A draw (SESSION-59) is a game that is neither.
     */
    public static boolean counts(String key, Outcome outcome) {
        return switch (key) {
            case "games" -> true;
            case "wins" -> outcome == Outcome.WIN;
            case "losses" -> outcome == Outcome.LOSS;
            default -> false;
        };
    }

    /**
     * The stored stats these keys need: a stored stat is itself, a formula is its operands (and theirs, down to the stored
     * ones), in catalog order. A key the catalog does not know is ignored.
     */
    public static List<Stat> storedFor(Map<String, Stat> catalog, Iterable<String> keys) {
        Set<String> needed = new LinkedHashSet<>();
        for (String key : keys) {
            collect(catalog, key, needed, 0);
        }
        return catalog.values().stream().filter(stat -> stat.stored() && needed.contains(stat.key())).toList();
    }

    private static void collect(Map<String, Stat> catalog, String key, Set<String> into, int depth) {
        Stat stat = catalog.get(key);
        if (stat == null || depth > 3) {
            return;
        }
        if (stat.stored()) {
            into.add(key);
            return;
        }
        for (String operand : StatsFormulas.operands(stat.formula())) {
            collect(catalog, operand, into, depth + 1);
        }
    }
}
