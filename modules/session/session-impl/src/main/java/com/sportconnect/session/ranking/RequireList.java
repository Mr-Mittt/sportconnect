package com.sportconnect.session.ranking;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.session.stats.StatisticsSchema;
import com.sportconnect.session.stats.StatsCatalog;
import com.sportconnect.session.stats.StatsCounters;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * SESSION-54 (owner, 2026-11-26, replaces the single {@code minGames}): the <b>preconditions</b> of a board, a list of
 * conditions a player or a pair must <i>all</i> meet to be listed: {@code [{"key":"games","op":">=","value":5},
 * {"key":"wins","op":">=","value":2}]}. A key is a catalog stat the sport collects (a formula such as {@code winRate} too), the
 * operator one of {@code >=}, {@code >}, {@code <=}, {@code <}, {@code =}. They decide <b>who is on the board</b>, never the
 * order (that is the {@link SortList}); a key with no value (a win rate with no games) fails its condition. An empty list lists
 * everyone who has played. At most {@value #MAX_CONDITIONS}.
 */
public final class RequireList {

    public static final int MAX_CONDITIONS = 6;
    private static final Set<String> OPERATORS = Set.of(">=", ">", "<=", "<", "=");
    private static final RequireList NONE = new RequireList(List.of());

    /** One condition: the stat {@code key}, the operator, the number it is compared with. */
    public record Condition(String key, String op, double value) {

        boolean holds(double actual) {
            return switch (op) {
                case ">=" -> actual >= value;
                case ">" -> actual > value;
                case "<=" -> actual <= value;
                case "<" -> actual < value;
                default -> Double.compare(actual, value) == 0;
            };
        }
    }

    private final List<Condition> conditions;

    private RequireList(List<Condition> conditions) {
        this.conditions = List.copyOf(conditions);
    }

    /** No condition: everyone who has played is listed. */
    public static RequireList none() {
        return NONE;
    }

    /**
     * Reads the conditions a person sent ({@code null} is none).
     *
     * @throws BadRequestException {@code SESSION_RANKING_REQUIRE_INVALID} with {@code errorParams.reason}: {@code NOT_A_LIST},
     *                             {@code TOO_MANY_CONDITIONS}, {@code KEY_UNKNOWN}, {@code OP_INVALID}, {@code VALUE_INVALID}
     */
    public static RequireList parse(Object node, Map<String, StatsCatalog.Stat> catalog) {
        if (node == null) {
            return NONE;
        }
        if (!(node instanceof List<?> list)) {
            throw invalid("NOT_A_LIST", null);
        }
        if (list.size() > MAX_CONDITIONS) {
            throw invalid("TOO_MANY_CONDITIONS", null);
        }
        List<Condition> parsed = new ArrayList<>();
        for (Object entry : list) {
            Map<?, ?> item = entry instanceof Map<?, ?> m ? m : Map.of();
            if (!(item.get("key") instanceof String key) || (catalog != null && !catalog.containsKey(key))) {
                throw invalid("KEY_UNKNOWN", String.valueOf(item.get("key")));
            }
            if (!(item.get("op") instanceof String op) || !OPERATORS.contains(op)) {
                throw invalid("OP_INVALID", String.valueOf(item.get("op")));
            }
            if (!(item.get("value") instanceof Number number) || !Double.isFinite(number.doubleValue())) {
                throw invalid("VALUE_INVALID", String.valueOf(item.get("value")));
            }
            parsed.add(new Condition(key, op, number.doubleValue()));
        }
        return new RequireList(parsed);
    }

    /** Reads conditions the server stored: an entry that cannot be read is dropped, never an error. */
    public static RequireList fromStored(Object node) {
        if (!(node instanceof List<?> list)) {
            return NONE;
        }
        List<Condition> kept = new ArrayList<>();
        for (Object entry : list) {
            if (entry instanceof Map<?, ?> item && item.get("key") instanceof String key && item.get("op") instanceof String op
                    && OPERATORS.contains(op) && item.get("value") instanceof Number number) {
                kept.add(new Condition(key, op, number.doubleValue()));
            }
        }
        return new RequireList(kept);
    }

    private static BadRequestException invalid(String reason, String detail) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("reason", reason);
        if (detail != null) {
            params.put("detail", detail);
        }
        return new BadRequestException("SESSION_RANKING_REQUIRE_INVALID", "The ranking preconditions are not valid: " + reason, params);
    }

    public List<Condition> conditions() {
        return conditions;
    }

    public boolean isEmpty() {
        return conditions.isEmpty();
    }

    /** Every catalog stat the conditions read, in the order they first appear. */
    public Set<String> operands() {
        Set<String> stats = new LinkedHashSet<>();
        conditions.forEach(condition -> stats.add(condition.key()));
        return stats;
    }

    /** Whether the counters meet every condition; a key with no value fails its condition. */
    public boolean test(StatsCounters counters, StatisticsSchema schema) {
        for (Condition condition : conditions) {
            Double actual = schema.valueOf(condition.key(), counters);
            if (actual == null || !condition.holds(actual)) {
                return false;
            }
        }
        return true;
    }

    /** The stored form, the same shape {@link #parse} reads. */
    public List<Object> toJson() {
        List<Object> json = new ArrayList<>();
        for (Condition condition : conditions) {
            Map<String, Object> item = new LinkedHashMap<>();
            item.put("key", condition.key());
            item.put("op", condition.op());
            double value = condition.value();
            item.put("value", value == Math.rint(value) && Math.abs(value) < 1e15 ? (Object) (long) value : (Object) value);
            json.add(item);
        }
        return json;
    }

    @Override
    public boolean equals(Object other) {
        return other instanceof RequireList list && conditions.equals(list.conditions);
    }

    @Override
    public int hashCode() {
        return conditions.hashCode();
    }

    @Override
    public String toString() {
        return conditions.toString();
    }
}
