package com.sportconnect.session.stats;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * What a sport's result schema says about its statistics and its ranking (SESSION-53, reworked 2026-11-25 by the owner),
 * read leniently: an entry the server cannot use is dropped, never an error, so a schema edit can never stop a session from
 * being counted.
 *
 * <p><b>One config, shared with the client.</b> The sport lists the stats it shows in {@code record.scoreboard.columns},
 * chosen from the record type's {@link StatsCatalog}; the server collects exactly what those columns need ({@code winRate}
 * needs {@code games} and {@code wins}, so those are stored though not listed) and a key of {@code record.ranking.sort} adds
 * what it needs too, so the ranking can order by it. <b>There are no defaults</b>: no {@code columns} (or none the catalog
 * knows) means {@link #collects()} is {@code false} and nothing is counted. No fixed counters, no custom metrics, no
 * {@code record.statistics} block.
 *
 * <p>{@code record.scoreboard.groupBy} names the <b>one</b> dimension that gets counters of its own beside the totals: a list
 * whose first usable entry is kept, {@code {by: PARTNER}} (each teammate: badminton) or {@code {by: TEAM, size: n}} (groups of
 * n players of one team: football). Missing means no grouping at all, and with {@code PARTNER} a group session also keeps the
 * head-to-head of its pairs. {@code record.ranking} gives the order ({@code sort}, at most three keys of the catalog; no
 * default, so a sport that names none has no ranking order) and {@code minGames} (default 0 for a single player, 5 for a
 * combo). {@code record.data.allowDraws} (default false) says the sport's games can end in a draw. {@code record.scoreboard.config.sessions} (SESSION-82) says what makes a session count in the {@code sessions} stat ({@link SessionsRule}); the default is {@code joined}.
 */
public final class StatisticsSchema {

    private static final int MAX_SORT_KEYS = 3;

    /** One sort key of the ranking: a catalog key and whether bigger is better. */
    public record SortKey(String by, boolean descending) {
    }

    /** The dimensions a game's counters can be split by, besides the totals. */
    public static final String PARTNER = "PARTNER";
    public static final String TEAM = "TEAM";

    /** One grouping: {@code PARTNER} (size 0: each other member of the player's team) or {@code TEAM} (groups of {@code size}). */
    public record Grouping(String by, int size) {
    }

    /**
     * SESSION-82: what makes a session count for a player in the {@code sessions} stat, read from
     * {@code record.scoreboard.config.sessions = {when: ["joined", "atLeast1Game"], combine: "AND"|"OR"}}: {@code joined} (the
     * player was a joined participant when the session was counted), {@code atLeast1Game} (the player had a counted game in it), or
     * both, met together ({@code AND}) or either ({@code OR}). <b>Default {@code joined}</b>; two conditions with no {@code combine}
     * mean {@code OR}. A counted game needs a joined player, so {@code AND} is {@code atLeast1Game} and {@code OR} is
     * {@code joined} today; the form is kept for conditions that are not implied (an at-least-one-ranking-game, say). An unknown
     * entry is dropped and nothing usable is the default, never an error.
     */
    public record SessionsRule(boolean joined, boolean atLeast1Game, boolean and) {

        public static final SessionsRule DEFAULT = new SessionsRule(true, false, false);

        /** SESSION-83: the rule for these conditions ({@code AND} when {@code and}); an unusable list is {@link #DEFAULT}. */
        public static SessionsRule of(List<?> when, boolean and) {
            boolean joined = false;
            boolean game = false;
            if (when != null) {
                for (Object entry : when) {
                    if ("joined".equals(entry)) {
                        joined = true;
                    } else if ("atLeast1Game".equals(entry)) {
                        game = true;
                    }
                }
            }
            return !joined && !game ? DEFAULT : new SessionsRule(joined, game, and);
        }

        /** SESSION-83: the rule as a config ({@code {"when": [...], "combine": "OR"}}), what a settings answer shows. */
        public Map<String, Object> toConfig() {
            List<String> when = new ArrayList<>();
            if (joined) {
                when.add("joined");
            }
            if (atLeast1Game) {
                when.add("atLeast1Game");
            }
            Map<String, Object> config = new LinkedHashMap<>();
            config.put("when", when);
            config.put("combine", and ? "AND" : "OR");
            return config;
        }

        /** Whether a player who {@code wasJoined} and {@code hadGame} counts for the session. */
        public boolean counts(boolean wasJoined, boolean hadGame) {
            if (joined && atLeast1Game) {
                return and ? wasJoined && hadGame : wasJoined || hadGame;
            }
            return atLeast1Game ? hadGame : wasJoined;
        }
    }

    private final Map<String, StatsCatalog.Stat> catalog;
    private final List<String> columns;
    private final List<StatsCatalog.Stat> collected;
    private final List<StatsCatalog.Stat> collectedForCombos;
    private final SessionsRule sessionsRule;
    private final List<Grouping> groupBy;
    private final List<SortKey> sort;
    private final int minGamesSingle;
    private final int minGamesCombo;
    private final boolean allowDraws;

    private StatisticsSchema(Map<String, StatsCatalog.Stat> catalog, List<String> columns,
                             List<StatsCatalog.Stat> collected, SessionsRule sessionsRule, List<Grouping> groupBy, List<SortKey> sort,
                             int minGamesSingle, int minGamesCombo, boolean allowDraws) {
        this.catalog = catalog;
        this.columns = columns;
        this.collected = collected;
        this.collectedForCombos = collected.stream().filter(stat -> !stat.singleOnly()).toList();
        this.sessionsRule = sessionsRule;
        this.groupBy = groupBy;
        this.sort = sort;
        this.minGamesSingle = minGamesSingle;
        this.minGamesCombo = minGamesCombo;
        this.allowDraws = allowDraws;
    }

    /** Reads the sport's schema (never {@code null}; an empty map, or a schema with no columns, collects nothing). */
    public static StatisticsSchema of(Map<String, Object> schema) {
        Map<String, Object> record = map(schema, "record");
        Map<String, Object> data = map(record, "data");
        Map<String, StatsCatalog.Stat> catalog = StatsCatalog.forType(data.get("type") instanceof String type ? type : null);
        Map<String, Object> scoreboard = map(record, "scoreboard");
        Map<String, Object> ranking = map(record, "ranking");

        // SESSION-82: config.sessions.enabled = false lists the column but does not collect it (the column is dropped, nothing is counted)
        boolean sessionsOff = Boolean.FALSE.equals(map(map(scoreboard, "config"), "sessions").get("enabled"));
        List<String> columns = readColumns(scoreboard.get("columns"), catalog).stream()
                .filter(key -> !(sessionsOff && "sessions".equals(key))).toList();
        List<SortKey> sort = ranking.get("sort") instanceof List<?> list ? readSort(list, catalog) : List.of();

        List<String> needed = new ArrayList<>(columns);
        if (!columns.isEmpty()) {
            sort.stream().map(SortKey::by).filter(key -> !(sessionsOff && "sessions".equals(key))).forEach(needed::add);
        }
        List<StatsCatalog.Stat> collected = StatsCatalog.storedFor(catalog, needed);

        return new StatisticsSchema(catalog, columns, collected, readSessionsRule(map(scoreboard, "config")), readGroupBy(scoreboard.get("groupBy")), sort,
                intOf(map(ranking, "minGames").get("single"), 0), intOf(map(ranking, "minGames").get("combo"), 5),
                Boolean.TRUE.equals(data.get("allowDraws")));
    }

    /** SESSION-54: the stats the sport's record type supports (the catalog the ranking rules are checked against); empty for a type with none. */
    public Map<String, StatsCatalog.Stat> catalog() {
        return catalog;
    }

    /** Whether the sport collects anything at all: false for a schema with no usable {@code scoreboard.columns}. */
    public boolean collects() {
        return !collected.isEmpty();
    }

    /** The columns the sport shows, from the catalog, in the order the schema lists them; unknown and repeated keys dropped. */
    public List<String> columns() {
        return columns;
    }

    /** The stored stats the sport collects: the columns' own and their operands', and the ranking keys' operands. */
    public List<StatsCatalog.Stat> collected() {
        return collected;
    }

    /** SESSION-82: the stored stats a pair or team entry may hold: {@link #collected()} without the single-only ones. */
    public List<StatsCatalog.Stat> collectedForCombos() {
        return collectedForCombos;
    }

    /** SESSION-82: whether the sport collects the {@code sessions} stat. */
    public boolean collectsSessions() {
        return collected.stream().anyMatch(stat -> stat.kind() == StatsCatalog.Kind.SESSIONS);
    }

    /** SESSION-82: what makes a session count for a player in the {@code sessions} stat (the default is {@code joined}). */
    public SessionsRule sessionsRule() {
        return sessionsRule;
    }

    /** The grouping, empty or exactly one entry ({@code PARTNER} or {@code TEAM}). */
    public List<Grouping> groupBy() {
        return groupBy;
    }

    /** Whether each teammate gets counters of their own (and a group session keeps the head-to-head of its pairs). */
    public boolean groupsByPartner() {
        return groupBy.stream().anyMatch(g -> g.by().equals(PARTNER));
    }

    /** The size of the player groups that get counters of their own, or 0 for none. */
    public int comboSize() {
        return groupBy.stream().filter(g -> g.by().equals(TEAM)).mapToInt(Grouping::size).findFirst().orElse(0);
    }

    /** Whether the sport's games can end in a draw ({@code record.data.allowDraws}). */
    public boolean allowDraws() {
        return allowDraws;
    }

    /** The ranking's sort keys, at most three, in order; empty when the sport names none. */
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
     * The value of a catalog key for these counters: a stored stat as counted, a formula computed from its operands.
     * {@code null} when the key is not in the catalog, the sport does not collect what it needs, or it has no value yet
     * (a division by zero, a sum no game has given).
     */
    public Double valueOf(String key, StatsCounters counters) {
        return valueOf(key, counters, 0);
    }

    /**
     * SESSION-73: the value of every column of the sport for these counters, in column order ({@code null} where a column has
     * no value). Empty for a sport with no columns.
     */
    public Map<String, Double> valuesOf(StatsCounters counters) {
        Map<String, Double> values = new LinkedHashMap<>();
        for (String key : columns) {
            values.put(key, valueOf(key, counters, 0));
        }
        return values;
    }

    private Double valueOf(String key, StatsCounters counters, int depth) {
        StatsCatalog.Stat stat = catalog.get(key);
        if (stat == null || depth >= 3) {
            return null;
        }
        if (stat.stored()) {
            return counters.value(key);
        }
        return StatsFormulas.evaluate(stat.formula(), operand -> valueOf(operand, counters, depth + 1));
    }

    private static List<String> readColumns(Object node, Map<String, StatsCatalog.Stat> catalog) {
        List<String> kept = new ArrayList<>();
        if (node instanceof List<?> list) {
            for (Object entry : list) {
                if (entry instanceof String key && catalog.containsKey(key) && !kept.contains(key)) {
                    kept.add(key);
                }
            }
        }
        return List.copyOf(kept);
    }

    private static List<SortKey> readSort(List<?> list, Map<String, StatsCatalog.Stat> catalog) {
        List<SortKey> keys = new ArrayList<>();
        for (Object entry : list) {
            Map<String, Object> item = map(entry);
            if (item.get("by") instanceof String name && item.get("dir") instanceof String direction
                    && (direction.equalsIgnoreCase("ASC") || direction.equalsIgnoreCase("DESC"))
                    && catalog.containsKey(name) && keys.stream().noneMatch(k -> k.by().equals(name))) {
                keys.add(new SortKey(name, direction.equalsIgnoreCase("DESC")));
                if (keys.size() == MAX_SORT_KEYS) {
                    break;
                }
            }
        }
        return List.copyOf(keys);
    }

    /**
     * The one grouping a sport asks for (owner, 2026-11-24): the first usable entry, {@code PARTNER} or {@code TEAM} with a
     * size of 2 or more; any later entry is dropped, so a sport is grouped by its partners or by its teams, never both (for
     * a two-player team they would be the same numbers twice). Nothing usable means no grouping.
     */
    private static List<Grouping> readGroupBy(Object node) {
        if (node instanceof List<?> list) {
            for (Object entry : list) {
                Map<String, Object> item = map(entry);
                if (!(item.get("by") instanceof String by)) {
                    continue;
                }
                String name = by.trim().toUpperCase(java.util.Locale.ROOT);
                if (name.equals(PARTNER)) {
                    return List.of(new Grouping(PARTNER, 0));
                }
                if (name.equals(TEAM) && intOf(item.get("size"), 0) >= 2) {
                    return List.of(new Grouping(TEAM, intOf(item.get("size"), 0)));
                }
            }
        }
        return List.of();
    }

    /** SESSION-82: the {@code sessions} config, lenient: unknown entries dropped, nothing usable is {@link SessionsRule#DEFAULT}. */
    private static SessionsRule readSessionsRule(Map<String, Object> config) {
        Map<String, Object> sessions = map(config, "sessions");
        boolean and = sessions.get("combine") instanceof String combine && combine.trim().equalsIgnoreCase("AND");
        return SessionsRule.of(sessions.get("when") instanceof List<?> when ? when : null, and);
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
