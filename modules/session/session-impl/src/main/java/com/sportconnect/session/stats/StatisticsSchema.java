package com.sportconnect.session.stats;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What a sport's result schema says about its statistics and its ranking (SESSION-53), read leniently from
 * {@code record.statistics} and {@code record.ranking}: an entry the server cannot use is dropped, never an error, so a
 * schema edit can never stop a session from being counted.
 *
 * <p>The core counters ({@code games}, {@code wins}, {@code losses}, {@code draws}) are always there. {@code metrics} are the
 * sport's own numbers, each with an {@link Aggregate}; a number the schema does not declare is not counted.
 * {@code derived} columns are formulas over those ({@link StatsFormulas}). {@code counters} are the core counters the sport
 * shows (default {@code games} and {@code wins}). {@code groupBy} lists the dimensions that get counters of their own beside
 * the totals: {@code PARTNER} (each teammate) and {@code TEAM} with a {@code size} (groups of that many players of one team:
 * badminton, 2, the pair; the only grouping that becomes a leaderboard entry).
 *
 * <p><b>Defaults.</b> A {@code COMPETITIVE} schema with no {@code record.statistics} block gets the badminton behaviour:
 * counters {@code games} and {@code wins}, metrics {@code scoreFor} and {@code scoreAgainst} (SUM), derived {@code winRate},
 * {@code winDiff} and {@code scoreDiff}, and <b>no groupings</b>: a sport asks for {@code PARTNER} or {@code TEAM} by
 * declaring {@code groupBy} (owner, 2026-11-24). A present block is taken as written (a missing part is empty; a missing {@code counters} is the default). The ranking
 * defaults, when {@code record.ranking} has no {@code sort}, are {@code winDiff}, {@code winRate}, {@code games} (all DESC);
 * {@code minGames} defaults to 0 for a single player and 5 for a combo. A sort has at most three keys (the leaderboard keeps
 * three sort values); more are dropped, as are keys no counter, metric or derived column defines.
 */
public final class StatisticsSchema {

    private static final List<String> CORE = List.of("games", "wins", "losses", "draws");
    private static final int MAX_SORT_KEYS = 3;

    /** One derived column. */
    public record Derived(String key, String formula) {
    }

    /** One sort key of the ranking: a key and whether bigger is better. */
    public record SortKey(String by, boolean descending) {
    }

    /** The dimensions a game's counters can be split by, besides the totals. */
    public static final String PARTNER = "PARTNER";
    public static final String TEAM = "TEAM";

    /** The core counters a sport shows when its schema does not say. */
    private static final List<String> DEFAULT_COUNTERS = List.of("games", "wins");

    /** One grouping: {@code PARTNER} (size 0: each other member of the player's team) or {@code TEAM} (groups of {@code size}). */
    public record Grouping(String by, int size) {
    }

    private final List<String> counters;
    private final Map<String, Aggregate> metrics;
    private final List<Derived> derived;
    private final List<Grouping> groupBy;
    private final List<SortKey> sort;
    private final int minGamesSingle;
    private final int minGamesCombo;

    private StatisticsSchema(List<String> counters, Map<String, Aggregate> metrics, List<Derived> derived,
                             List<Grouping> groupBy, List<SortKey> sort, int minGamesSingle, int minGamesCombo) {
        this.counters = counters;
        this.metrics = metrics;
        this.derived = derived;
        this.groupBy = groupBy;
        this.sort = sort;
        this.minGamesSingle = minGamesSingle;
        this.minGamesCombo = minGamesCombo;
    }

    /** Reads the sport's schema (never {@code null}; an empty map reads as the defaults). */
    public static StatisticsSchema of(Map<String, Object> schema) {
        Map<String, Object> record = map(schema, "record");
        Map<String, Object> statistics = map(record, "statistics");
        boolean declared = record.get("statistics") instanceof Map<?, ?>;

        Map<String, Aggregate> metrics = new LinkedHashMap<>();
        List<Derived> derived = new ArrayList<>();
        List<String> counters;
        List<Grouping> groupBy;
        if (declared) {
            counters = readCounters(statistics.get("counters"));
            readMetrics(statistics.get("metrics"), metrics);
            readDerived(statistics.get("derived"), derived);
            groupBy = readGroupBy(statistics.get("groupBy"));
        } else {
            counters = DEFAULT_COUNTERS;
            metrics.put("scoreFor", Aggregate.SUM);
            metrics.put("scoreAgainst", Aggregate.SUM);
            derived.add(new Derived("winRate", "wins/games"));
            derived.add(new Derived("winDiff", "wins-losses"));
            derived.add(new Derived("scoreDiff", "scoreFor-scoreAgainst"));
            groupBy = List.of();
        }

        Map<String, Object> ranking = map(record, "ranking");
        int minSingle = intOf(map(ranking, "minGames").get("single"), 0);
        int minCombo = intOf(map(ranking, "minGames").get("combo"), 5);
        StatisticsSchema partial = new StatisticsSchema(counters, metrics, derived, groupBy, List.of(), minSingle, minCombo);
        List<SortKey> sort = ranking.get("sort") instanceof List<?> list ? partial.readSort(list) : List.of(
                new SortKey("winDiff", true), new SortKey("winRate", true), new SortKey("games", true));
        return new StatisticsSchema(counters, metrics, derived, groupBy, partial.keepKnown(sort), minSingle, minCombo);
    }

    /** The core counters the sport shows (default {@code games}, {@code wins}); every core counter is stored regardless. */
    public List<String> counters() {
        return counters;
    }

    /** The groupings, in the order the schema lists them: at most one {@code PARTNER} and one {@code TEAM}. */
    public List<Grouping> groupBy() {
        return groupBy;
    }

    /** Whether each teammate gets counters of their own. */
    public boolean groupsByPartner() {
        return groupBy.stream().anyMatch(g -> g.by().equals(PARTNER));
    }

    /** The metrics the sport declares, with how each combines a game. */
    public Map<String, Aggregate> metrics() {
        return metrics;
    }

    public List<Derived> derived() {
        return derived;
    }

    /** The size of the player groups that get counters of their own, or 0 for none. */
    public int comboSize() {
        return groupBy.stream().filter(g -> g.by().equals(TEAM)).mapToInt(Grouping::size).findFirst().orElse(0);
    }

    /** The ranking's sort keys, at most three, in order. */
    public List<SortKey> sort() {
        return sort;
    }

    public int minGamesSingle() {
        return minGamesSingle;
    }

    public int minGamesCombo() {
        return minGamesCombo;
    }

    /**
     * The value of a key for these counters: a core counter, a metric, or a derived column (whose operands may be any of
     * those). {@code null} when the key is unknown or has no value yet (a division by zero, a metric no game has given).
     */
    public Double valueOf(String key, StatsCounters counters) {
        return valueOf(key, counters, 0);
    }

    private Double valueOf(String key, StatsCounters counters, int depth) {
        Double core = counters.core(key);
        if (core != null) {
            return core;
        }
        Double metric = counters.metric(key);
        if (metric != null) {
            return metric;
        }
        if (depth >= 3) {
            return null;
        }
        for (Derived column : derived) {
            if (column.key().equals(key)) {
                return StatsFormulas.evaluate(column.formula(), operand -> valueOf(operand, counters, depth + 1));
            }
        }
        return null;
    }

    private boolean defines(String key) {
        return CORE.contains(key) || metrics.containsKey(key) || derived.stream().anyMatch(d -> d.key().equals(key));
    }

    private List<SortKey> readSort(List<?> list) {
        List<SortKey> keys = new ArrayList<>();
        for (Object entry : list) {
            Map<String, Object> item = map(entry);
            Object by = item.get("by");
            Object dir = item.get("dir");
            if (by instanceof String name && dir instanceof String direction
                    && (direction.equalsIgnoreCase("ASC") || direction.equalsIgnoreCase("DESC"))) {
                keys.add(new SortKey(name, direction.equalsIgnoreCase("DESC")));
            }
        }
        return keys;
    }

    private List<SortKey> keepKnown(List<SortKey> keys) {
        List<SortKey> kept = new ArrayList<>();
        for (SortKey key : keys) {
            if (defines(key.by()) && kept.stream().noneMatch(k -> k.by().equals(key.by()))) {
                kept.add(key);
                if (kept.size() == MAX_SORT_KEYS) {
                    break;
                }
            }
        }
        return List.copyOf(kept);
    }

    private static void readMetrics(Object node, Map<String, Aggregate> into) {
        if (node instanceof List<?> list) {
            for (Object entry : list) {
                Map<String, Object> item = map(entry);
                Aggregate aggregate = Aggregate.parse(item.get("aggregate"));
                if (item.get("key") instanceof String key && !key.isBlank() && aggregate != null && !CORE.contains(key)) {
                    into.put(key, aggregate);
                }
            }
        }
    }

    private static void readDerived(Object node, List<Derived> into) {
        if (node instanceof List<?> list) {
            for (Object entry : list) {
                Map<String, Object> item = map(entry);
                if (item.get("key") instanceof String key && item.get("formula") instanceof String formula
                        && !key.isBlank() && !CORE.contains(key) && StatsFormulas.isValid(formula)) {
                    into.add(new Derived(key, formula));
                }
            }
        }
    }

    /** The listed core counters; a missing list reads as the default, a list as written (unknown names dropped). */
    private static List<String> readCounters(Object node) {
        if (!(node instanceof List<?> list)) {
            return DEFAULT_COUNTERS;
        }
        List<String> kept = new ArrayList<>();
        for (Object entry : list) {
            if (entry instanceof String name && CORE.contains(name) && !kept.contains(name)) {
                kept.add(name);
            }
        }
        return List.copyOf(kept);
    }

    /** {@code PARTNER}, and {@code TEAM} with a size of 2 or more; anything else, and a repeat, is dropped. */
    private static List<Grouping> readGroupBy(Object node) {
        List<Grouping> kept = new ArrayList<>();
        if (node instanceof List<?> list) {
            for (Object entry : list) {
                Map<String, Object> item = map(entry);
                if (!(item.get("by") instanceof String by)) {
                    continue;
                }
                String name = by.trim().toUpperCase(java.util.Locale.ROOT);
                boolean repeat = kept.stream().anyMatch(g -> g.by().equals(name));
                if (repeat) {
                    continue;
                }
                if (name.equals(PARTNER)) {
                    kept.add(new Grouping(PARTNER, 0));
                } else if (name.equals(TEAM) && intOf(item.get("size"), 0) >= 2) {
                    kept.add(new Grouping(TEAM, intOf(item.get("size"), 0)));
                }
            }
        }
        return List.copyOf(kept);
    }

    private static int intOf(Object value, int fallback) {
        return value instanceof Number number && number.intValue() >= 0 ? number.intValue() : fallback;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object node) {
        return node instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    private static Map<String, Object> map(Map<String, Object> parent, String key) {
        return map(parent == null ? null : parent.get(key));
    }
}
