package com.sportconnect.session.stats;

import com.sportconnect.session.record.RecordFacts.Outcome;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * The running counters of one subject (a player, or a group of players) in one set of games (SESSION-53). Only the stats the
 * sport collects are in it ({@link StatisticsSchema#collected()}): a counted stat ({@code games}, {@code wins},
 * {@code losses}) and the sums of the numbers the reader gives each player ({@code scoreFor}, {@code scoreAgainst}); a stat
 * the sport does not collect is simply absent, and a formula is never stored (it is computed from these when read). A plain
 * in-memory value: read from and written back to a jsonb blob as a flat map ({@link #fromMap}, {@link #toMap}), never a JPA
 * type, so the blob shape is in one place.
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

    /** The games counted, or 0 when the sport does not collect {@code games} (or none was counted). */
    public long games() {
        Double games = values.get("games");
        return games == null ? 0L : games.longValue();
    }

    /** A stored stat's running value, or {@code null} when it is not collected or no game has given it a value yet. */
    public Double value(String key) {
        return values.get(key);
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        values.forEach((key, value) -> map.put(key, value == Math.rint(value) && Math.abs(value) < 1e15
                ? (Object) value.longValue() : (Object) value));
        return map;
    }

    /** Reads a counters map written by {@link #toMap}; anything else (null, a missing blob) reads as no games. */
    public static StatsCounters fromMap(Object node) {
        StatsCounters counters = new StatsCounters();
        if (node instanceof Map<?, ?> map) {
            map.forEach((key, value) -> {
                if (key instanceof String name && value instanceof Number number) {
                    counters.values.put(name, number.doubleValue());
                }
            });
        }
        return counters;
    }
}
