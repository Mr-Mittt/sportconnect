package com.sportconnect.session.stats;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;
import java.util.function.Function;

/**
 * SESSION-53: the {@code groupings} jsonb shared by the three blobs that carry it: {@code {<by>: {<key>: value}}}, where
 * {@code by} is a dimension of the sport's {@code groupBy} ({@code PARTNER}, {@code TEAM}) and {@code key} identifies the
 * group inside it (a partner's user id, or a team's member ids sorted and joined by commas). The value is whatever the
 * blob keeps per group: counters, or {@code {all, ranked}}. The shape is documented in
 * {@code documentation/md/STATISTICS_JSONB_REFERENCE.md}.
 */
final class StatsGroupings {

    private StatsGroupings() {
    }

    /** Reads {@code {by: {key: value}}}; anything that is not a map of maps reads as empty. */
    static <T> Map<String, Map<String, T>> read(Object node, Function<Object, T> valueOf) {
        Map<String, Map<String, T>> groupings = new TreeMap<>();
        if (node instanceof Map<?, ?> byMap) {
            byMap.forEach((by, keys) -> {
                if (keys instanceof Map<?, ?> keyMap) {
                    Map<String, T> inner = new TreeMap<>();
                    keyMap.forEach((key, value) -> inner.put(String.valueOf(key), valueOf.apply(value)));
                    groupings.put(String.valueOf(by), inner);
                }
            });
        }
        return groupings;
    }

    /** Writes the map back; a dimension with no group is left out. */
    static <T> Map<String, Object> write(Map<String, Map<String, T>> groupings, Function<T, Map<String, Object>> toMap) {
        Map<String, Object> out = new LinkedHashMap<>();
        groupings.forEach((by, keys) -> {
            if (!keys.isEmpty()) {
                Map<String, Object> inner = new LinkedHashMap<>();
                keys.forEach((key, value) -> inner.put(key, toMap.apply(value)));
                out.put(by, inner);
            }
        });
        return out;
    }

    /** The value of one group, created with {@code create} the first time. */
    static <T> T group(Map<String, Map<String, T>> groupings, String by, String key, java.util.function.Supplier<T> create) {
        return groupings.computeIfAbsent(by, b -> new TreeMap<>()).computeIfAbsent(key, k -> create.get());
    }
}
