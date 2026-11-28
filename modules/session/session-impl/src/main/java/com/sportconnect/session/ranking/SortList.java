package com.sportconnect.session.ranking;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.session.stats.StatisticsSchema;
import com.sportconnect.session.stats.StatsCatalog;
import com.sportconnect.session.stats.StatsCounters;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * SESSION-54 (locked by the owner, 2026-11-26): how a board is ordered, <b>one list of sort keys, each with its own
 * direction</b>. A key is either a catalog stat ({@code {"key": "wins", "dir": "DESC"}}; a formula stat such as
 * {@code winRate} works too) or a weighted sum of catalog stats ({@code {"sum": {"wins": 3, "games": 1}, "dir": "DESC"}},
 * for a points system). The first key decides, the next ones break ties; entries equal on every key share a rank. A sort list
 * is data a server-only table keeps ({@code sport_ranking_rules}): it names catalog stats and never a class or a method.
 *
 * <p>At most {@value #MAX_KEYS} keys. {@link #parse} is the strict reader for what an admin or a group owner sends (a coded
 * 400), {@link #fromStored} the lenient reader for what the server stored itself.
 */
public final class SortList {

    public static final int MAX_KEYS = 4;
    private static final int MAX_TERMS = 8;

    /**
     * One key.
     *
     * @param stat       the catalog stat, or {@code null} for a weighted sum
     * @param sum        the weights by catalog stat of a weighted sum, or {@code null} for a plain stat
     * @param descending whether a bigger value ranks first
     */
    public record Key(String stat, Map<String, Double> sum, boolean descending) {

        public boolean isSum() {
            return sum != null;
        }
    }

    private final List<Key> keys;

    private SortList(List<Key> keys) {
        this.keys = List.copyOf(keys);
    }

    /**
     * Reads a sort list sent by a person.
     *
     * @throws BadRequestException {@code SESSION_RANKING_SORT_INVALID} with {@code errorParams.reason}: {@code NOT_A_LIST}, {@code EMPTY},
     *                             {@code TOO_MANY_KEYS}, {@code KEY_UNKNOWN}, {@code KEY_DUPLICATE}, {@code DIR_INVALID},
     *                             {@code SUM_INVALID}
     */
    public static SortList parse(Object node, Map<String, StatsCatalog.Stat> catalog) {
        return read(node, catalog);
    }

    /** Reads a sort list the server stored: an entry that cannot be read is dropped, never an error. */
    public static SortList fromStored(Object node) {
        try {
            return read(node, null);
        } catch (BadRequestException e) {
            return new SortList(List.of());
        }
    }

    private static SortList read(Object node, Map<String, StatsCatalog.Stat> catalog) {
        if (!(node instanceof List<?> list)) {
            throw invalid("NOT_A_LIST", null);
        }
        if (list.isEmpty()) {
            throw invalid("EMPTY", null);
        }
        if (list.size() > MAX_KEYS) {
            throw invalid("TOO_MANY_KEYS", null);
        }
        List<Key> keys = new ArrayList<>();
        Set<String> seen = new LinkedHashSet<>();
        for (Object entry : list) {
            Map<?, ?> item = entry instanceof Map<?, ?> m ? m : Map.of();
            boolean descending = direction(item.get("dir"));
            if (item.get("sum") != null) {
                keys.add(new Key(null, readSum(item.get("sum"), catalog), descending));
                continue;
            }
            Object stat = item.get("key");
            if (!(stat instanceof String name) || (catalog != null && !catalog.containsKey(name))) {
                throw invalid("KEY_UNKNOWN", String.valueOf(stat));
            }
            if (!seen.add(name)) {
                throw invalid("KEY_DUPLICATE", name);
            }
            keys.add(new Key(name, null, descending));
        }
        return new SortList(keys);
    }

    private static boolean direction(Object dir) {
        if (dir instanceof String text) {
            if (text.equalsIgnoreCase("DESC")) {
                return true;
            }
            if (text.equalsIgnoreCase("ASC")) {
                return false;
            }
        }
        throw invalid("DIR_INVALID", String.valueOf(dir));
    }

    private static Map<String, Double> readSum(Object node, Map<String, StatsCatalog.Stat> catalog) {
        if (!(node instanceof Map<?, ?> map) || map.isEmpty() || map.size() > MAX_TERMS) {
            throw invalid("SUM_INVALID", null);
        }
        Map<String, Double> weights = new LinkedHashMap<>();
        for (Map.Entry<?, ?> term : map.entrySet()) {
            if (!(term.getKey() instanceof String name) || (catalog != null && !catalog.containsKey(name))
                    || !(term.getValue() instanceof Number weight) || !Double.isFinite(weight.doubleValue())
                    || weight.doubleValue() == 0d) {
                throw invalid("SUM_INVALID", String.valueOf(term.getKey()));
            }
            weights.put(name, weight.doubleValue());
        }
        return weights;
    }

    private static BadRequestException invalid(String reason, String detail) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("reason", reason);
        if (detail != null) {
            params.put("detail", detail);
        }
        return new BadRequestException("SESSION_RANKING_SORT_INVALID", "The ranking sort list is not valid: " + reason, params);
    }

    public List<Key> keys() {
        return keys;
    }

    public int size() {
        return keys.size();
    }

    public boolean isEmpty() {
        return keys.isEmpty();
    }

    /**
     * SESSION-84: this list without what a board cannot value: a key naming a stat {@code usable} rejects is dropped, and so is a
     * term of a weighted sum (a sum with no term left is dropped). The inherited rule of a group board that does not hold a stat is
     * read this way, silently, when the board is rebuilt. Empty when nothing is left.
     */
    public SortList retaining(java.util.function.Predicate<String> usable) {
        List<Key> kept = new java.util.ArrayList<>();
        for (Key key : keys) {
            if (!key.isSum()) {
                if (usable.test(key.stat())) {
                    kept.add(key);
                }
                continue;
            }
            Map<String, Double> terms = new java.util.LinkedHashMap<>();
            key.sum().forEach((stat, weight) -> {
                if (usable.test(stat)) {
                    terms.put(stat, weight);
                }
            });
            if (!terms.isEmpty()) {
                kept.add(new Key(null, terms, key.descending()));
            }
        }
        return new SortList(kept);
    }

    /** Every catalog stat the keys read, plain or in a sum, in the order they first appear. */
    public Set<String> operands() {
        Set<String> stats = new LinkedHashSet<>();
        for (Key key : keys) {
            if (key.isSum()) {
                stats.addAll(key.sum().keySet());
            } else {
                stats.add(key.stat());
            }
        }
        return stats;
    }

    /**
     * The value of every key for these counters, in key order; {@code NaN} where a plain key has no value (a division by
     * zero, a stat the sport does not collect). A weighted sum counts a stat with no value as 0.
     */
    public double[] valuesOf(StatsCounters counters, StatisticsSchema schema) {
        double[] values = new double[keys.size()];
        for (int i = 0; i < values.length; i++) {
            Key key = keys.get(i);
            if (!key.isSum()) {
                Double value = schema.valueOf(key.stat(), counters);
                values[i] = value == null ? Double.NaN : value;
                continue;
            }
            double total = 0d;
            for (Map.Entry<String, Double> term : key.sum().entrySet()) {
                Double value = schema.valueOf(term.getKey(), counters);
                if (value != null) {
                    total += term.getValue() * value;
                }
            }
            values[i] = total;
        }
        return values;
    }

    /** The stored form, the same shape {@link #parse} reads. */
    public List<Object> toJson() {
        List<Object> json = new ArrayList<>();
        for (Key key : keys) {
            Map<String, Object> item = new LinkedHashMap<>();
            if (key.isSum()) {
                item.put("sum", new LinkedHashMap<>(key.sum()));
            } else {
                item.put("key", key.stat());
            }
            item.put("dir", key.descending() ? "DESC" : "ASC");
            json.add(item);
        }
        return json;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof SortList list && keys.equals(list.keys);
    }

    @Override
    public int hashCode() {
        return keys.hashCode();
    }

    @Override
    public String toString() {
        return keys.stream().map(k -> (k.isSum() ? k.sum().toString() : k.stat()) + (k.descending() ? " DESC" : " ASC"))
                .toList().toString().toLowerCase(Locale.ROOT);
    }
}
