package com.sportconnect.session.stats;

import com.sportconnect.session.record.RecordFacts.Outcome;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

/**
 * The running counters of one subject (a player, or a combo of players) in one set of games (SESSION-53): the four core
 * counters every competitive sport has, and the sport's own metrics, each combined by its {@link Aggregate}. A plain
 * in-memory value: read from and written back to a jsonb blob as a map ({@link #fromMap}, {@link #toMap}), never a JPA
 * type, so the blob shape is in one place.
 */
public final class StatsCounters {

    private long games;
    private long wins;
    private long losses;
    private long draws;
    private final Map<String, Double> metrics = new TreeMap<>();

    /**
     * Counts one game.
     *
     * @param outcome     how it ended for the subject ({@code NONE} still counts the game and adds no win, loss or draw)
     * @param gameMetrics the numbers the game gives the subject, by key
     * @param declared    the metrics the sport's schema declares, with their aggregates; a number the schema does not
     *                    declare is not counted
     */
    public void add(Outcome outcome, Map<String, Double> gameMetrics, Map<String, Aggregate> declared) {
        games++;
        switch (outcome) {
            case WIN -> wins++;
            case LOSS -> losses++;
            case DRAW -> draws++;
            default -> {
            }
        }
        for (Map.Entry<String, Aggregate> metric : declared.entrySet()) {
            Double value = gameMetrics.get(metric.getKey());
            if (value != null) {
                metrics.merge(metric.getKey(), value, metric.getValue()::combine);
            }
        }
    }

    public long games() {
        return games;
    }

    /** A core counter by name ({@code games}, {@code wins}, {@code losses}, {@code draws}), or {@code null}. */
    public Double core(String key) {
        return switch (key) {
            case "games" -> (double) games;
            case "wins" -> (double) wins;
            case "losses" -> (double) losses;
            case "draws" -> (double) draws;
            default -> null;
        };
    }

    /** A metric's running value, or {@code null} when no game has given it a value yet. */
    public Double metric(String key) {
        return metrics.get(key);
    }

    public Map<String, Object> toMap() {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put("games", games);
        map.put("wins", wins);
        map.put("losses", losses);
        map.put("draws", draws);
        Map<String, Object> metricMap = new LinkedHashMap<>();
        metrics.forEach((key, value) -> metricMap.put(key, value == Math.rint(value) && Math.abs(value) < 1e15
                ? (Object) value.longValue() : (Object) value));
        map.put("metrics", metricMap);
        return map;
    }

    /** Reads a counters map written by {@link #toMap}; anything else (null, a missing blob) reads as no games. */
    public static StatsCounters fromMap(Object node) {
        StatsCounters counters = new StatsCounters();
        if (node instanceof Map<?, ?> map) {
            counters.games = longOf(map.get("games"));
            counters.wins = longOf(map.get("wins"));
            counters.losses = longOf(map.get("losses"));
            counters.draws = longOf(map.get("draws"));
            if (map.get("metrics") instanceof Map<?, ?> metricMap) {
                metricMap.forEach((key, value) -> {
                    if (key instanceof String name && value instanceof Number number) {
                        counters.metrics.put(name, number.doubleValue());
                    }
                });
            }
        }
        return counters;
    }

    private static long longOf(Object value) {
        return value instanceof Number number ? number.longValue() : 0L;
    }
}
