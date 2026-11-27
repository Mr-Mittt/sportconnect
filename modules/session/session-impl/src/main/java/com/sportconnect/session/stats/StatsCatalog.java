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
        COUNTED, SUMMED, FORMULA,
        /** SESSION-82: counted once per session (never per game), by the sport's own rule for what makes a session count. */
        SESSIONS
    }

    /**
     * One supported stat.
     *
     * @param formula the two-operand formula of a {@link Kind#FORMULA} stat ({@link StatsFormulas}); {@code null} otherwise
     * @param singleOnly SESSION-82: the stat applies to a single player only; a pair or team entry never holds it and a rule for
     *                   a pair board cannot name it
     */
    public record Stat(String key, Kind kind, String formula, boolean singleOnly) {

        /** A stat that applies to every kind of subject (a single player, a pair, a team). */
        public Stat(String key, Kind kind, String formula) {
            this(key, kind, formula, false);
        }

        /** The stat's fixed id (the position of its value in a stored counters string), see {@link #idOf}. */
        public int id() {
            return idOf(key);
        }

        /** Whether this stat is kept in the counters (the others are computed from those that are). */
        public boolean stored() {
            return kind != Kind.FORMULA;
        }
    }

    private static final Map<String, Map<String, Stat>> BY_TYPE = Map.of("COMPETITIVE", competitive());

    /**
     * The id of every stat key (SESSION-81, owner 2026-11-25): <b>explicit, global and append-only</b>. A stored counters string
     * keeps the value of the stat with id {@code n} in its {@code n}-th slot ({@code "7,4,3"} is 7 games, 4 wins, 3 losses), so
     * an id is never changed, reused or renumbered, and a new stat takes the next free number. It is independent of the order
     * the client lists the columns in. The client's {@code record-ui-v1.json} carries the same ids ({@code COMPETITIVE.scoreboard.statIds})
     * and {@code StatsCatalogSpec} fails when the two differ. Stored stats come first so the slots after the last stored one are
     * cut; the formulas (never stored) took 6 to 8, and {@code sessions} (SESSION-82, stored, singles only) is 9, so the slots 6 to 8 stay empty before it.
     */
    private static final Map<String, Integer> IDS = Map.of(
            "games", 1, "wins", 2, "losses", 3, "scoreFor", 4, "scoreAgainst", 5,
            "winRate", 6, "winDiff", 7, "scoreDiff", 8, "sessions", 9);

    private static final Map<Integer, String> KEYS_BY_ID = IDS.entrySet().stream()
            .collect(java.util.stream.Collectors.toUnmodifiableMap(Map.Entry::getValue, Map.Entry::getKey));

    /** The id of a stat key (every catalog key has one). */
    public static int idOf(String key) {
        Integer id = IDS.get(key);
        if (id == null) {
            throw new IllegalArgumentException("No stat id for " + key);
        }
        return id;
    }

    /** The stat key of an id, or {@code null} for an id no stat has (a value written by a newer version is skipped, not an error). */
    public static String keyOfId(int id) {
        return KEYS_BY_ID.get(id);
    }

    /** The key of a stat id whose stat is <b>stored</b> (a formula is never in a counters string), or {@code null}. */
    public static String keyOfStoredId(int id) {
        String key = KEYS_BY_ID.get(id);
        if (key == null) {
            return null;
        }
        for (Map<String, Stat> catalog : BY_TYPE.values()) {
            Stat stat = catalog.get(key);
            if (stat != null) {
                return stat.stored() ? key : null;
            }
        }
        return null;
    }

    /** Every id by stat key, for the contract test against the client's copy. */
    public static Map<String, Integer> ids() {
        return IDS;
    }

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
        add(stats, new Stat("sessions", Kind.SESSIONS, null, true));
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
