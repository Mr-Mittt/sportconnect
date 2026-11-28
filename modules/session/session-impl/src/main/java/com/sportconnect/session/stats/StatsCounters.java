package com.sportconnect.session.stats;

import com.sportconnect.session.record.RecordFacts.Outcome;

import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * The running counters of one subject (a player, or a group of players) in one set of games (SESSION-53). Only the stats the
 * sport collects are in it ({@link StatisticsSchema#collected()}): a counted stat ({@code games}, {@code wins},
 * {@code losses}) and the sums of the numbers the reader gives each player ({@code scoreFor}, {@code scoreAgainst}); a stat
 * the sport does not collect is simply absent, and a formula is never stored (it is computed from these when read). A plain
 * in-memory value: read from and written back to a jsonb blob as one short string ({@link #decode}, {@link #encode}), never a
 * JPA type, so the blob shape is in one place.
 */
public final class StatsCounters {

    private final Map<String, Double> values = new TreeMap<>();

    /**
     * Counts one game for the collected stats.
     *
     * @param outcome     how it ended for the subject ({@code NONE} and {@code DRAW} still count the game and add no win or loss)
     * @param gameMetrics the numbers the game gives the subject, by key
     * @param collected   the stored stats the sport collects; a counted stat is written even when this game adds nothing to it
     *                    (a loss adds a zero to {@code wins}), so "collected, none yet" and "not collected" can be told apart
     */
    public void add(Outcome outcome, Map<String, Double> gameMetrics, List<StatsCatalog.Stat> collected) {
        for (StatsCatalog.Stat stat : collected) {
            switch (stat.kind()) {
                case COUNTED -> values.merge(stat.key(), StatsCatalog.counts(stat.key(), outcome) ? 1d : 0d, Double::sum);
                case SUMMED -> {
                    Double value = gameMetrics.get(stat.key());
                    if (value != null) {
                        values.merge(stat.key(), value, Double::sum);
                    }
                }
                default -> {
                }
            }
        }
    }

    /**
     * SESSION-82: counts one session for the player, once, when the sport collects {@code sessions} (a session counts by the sport's
     * {@link StatisticsSchema.SessionsRule}, decided by the caller, never per game). Does nothing when the stat is not in
     * {@code collected}.
     */
    public void addSession(List<StatsCatalog.Stat> collected) {
        if (collected.stream().anyMatch(stat -> stat.kind() == StatsCatalog.Kind.SESSIONS)) {
            values.merge("sessions", 1d, Double::sum);
        }
    }

    /** SESSION-84: a copy holding only these stats (a group board reads only the stats the group's list holds, never a stale number of a dropped one). */
    public StatsCounters retaining(java.util.Set<String> keys) {
        StatsCounters copy = new StatsCounters();
        values.forEach((key, value) -> {
            if (keys.contains(key)) {
                copy.values.put(key, value);
            }
        });
        return copy;
    }

    /** SESSION-55: whether every stat held here is zero (a counters object that a subtraction emptied), or none is held. */
    public boolean isZero() {
        return values.values().stream().allMatch(value -> value == 0d);
    }

    /** Whether nothing was counted into these counters (no stat has a value). */
    public boolean isEmpty() {
        return values.isEmpty();
    }

    /** The games counted, or 0 when the sport does not collect {@code games} (or none was counted). */
    public long games() {
        Double games = values.get("games");
        return games == null ? 0L : games.longValue();
    }

    /** A stored stat's running value, or {@code null} when it is not collected or no game has given it a value yet. */
    public Double value(String key) {
        return values.get(key);
    }

    /**
     * SESSION-73: these counters minus another's, for the "normal" games (all minus ranking). Every stat held here keeps its
     * key, with the other's value (0 when it has none) taken off and never below zero; a stat only the other holds is ignored.
     */
    public StatsCounters minus(StatsCounters other) {
        StatsCounters result = new StatsCounters();
        values.forEach((key, value) -> result.values.put(key, Math.max(0d, value - other.values.getOrDefault(key, 0d))));
        return result;
    }

    /**
     * The stored form (SESSION-81): one string with the value of the stat whose id is {@code n} in its {@code n}-th slot, slots
     * separated by {@code ,}, a stat with no value an empty slot, the slots after the last value cut: {@code "7,4,,52,40"} is
     * 7 games, 4 wins, no losses stat, 52 scoreFor and 40 scoreAgainst. A whole number is written without a decimal part, a
     * fraction with {@code .}, a negative sum with {@code -}; nothing counted is {@code ""}. Only the stored stats of the catalog
     * have an id, so a key without one is not written.
     */
    public String encode() {
        int last = 0;
        Map<Integer, Double> byId = new TreeMap<>();
        for (Map.Entry<String, Double> value : values.entrySet()) {
            Integer id = StatsCatalog.ids().get(value.getKey());
            if (id != null) {
                byId.put(id, value.getValue());
                last = Math.max(last, id);
            }
        }
        StringBuilder text = new StringBuilder();
        for (int id = 1; id <= last; id++) {
            if (id > 1) {
                text.append(',');
            }
            Double value = byId.get(id);
            if (value != null) {
                text.append(value == Math.rint(value) && Math.abs(value) < 1e15 ? Long.toString(value.longValue()) : Double.toString(value));
            }
        }
        return text.toString();
    }

    /**
     * Reads a stored counters string ({@link #encode}); a slot that is empty, not a number, or has no stat id is skipped.
     * Also reads the flat map of the first builds ({@code {games: 3}}), so an older row never fails; anything else (null, a
     * missing blob) reads as no games.
     */
    public static StatsCounters decode(Object node) {
        StatsCounters counters = new StatsCounters();
        if (node instanceof String text) {
            String[] slots = text.split(",", -1);
            for (int i = 0; i < slots.length; i++) {
                String key = StatsCatalog.keyOfStoredId(i + 1);
                if (key == null || slots[i].isBlank()) {
                    continue;
                }
                try {
                    double value = Double.parseDouble(slots[i].trim());
                    if (!Double.isNaN(value) && !Double.isInfinite(value)) {
                        counters.values.put(key, value);
                    }
                } catch (NumberFormatException e) {
                    // not a number: the slot is skipped
                }
            }
        } else if (node instanceof Map<?, ?> map) {
            map.forEach((key, value) -> {
                if (key instanceof String name && value instanceof Number number) {
                    counters.values.put(name, number.doubleValue());
                }
            });
        }
        return counters;
    }
}
