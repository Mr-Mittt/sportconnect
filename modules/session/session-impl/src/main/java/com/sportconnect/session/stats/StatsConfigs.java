package com.sportconnect.session.stats;

import com.sportconnect.common.exception.BadRequestException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * SESSION-83, SESSION-84: a group's own stat list for its member row and board, a partial scoreboard like the sport's
 * {@code record.scoreboard}: {@code {"columns": ["games", "wins", "sessions"], "config": {"sessions": {"when": ["atLeast1Game"]}}}}.
 * When the group has one, its {@code columns} <b>replace the sport's default list</b> (a stat left out is excluded, a stat the sport does
 * not list is opted in) and its {@code config.sessions} replaces the sport's rule for what makes a session count; either part may be
 * left out and then the sport's applies. A stat the sport disabled ({@code config.{stat}.enabled = false}), and a formula that needs
 * one, can never be in it. Only {@code sessions} has settings today.
 *
 * <p>{@link #parse} is strict (a settings call is refused when it is wrong, the owner sees the result at once); reading a stored config
 * is lenient. {@link #effective} is what a settings answer shows, built on the fly against the sport's current schema.
 */
public final class StatsConfigs {

    public static final String ERROR_CODE = "SESSION_GROUP_STATS_CONFIG_INVALID";
    public static final String SESSIONS = "sessions";

    private StatsConfigs() {
    }

    /**
     * Checks a request's {@code statsConfig} against the sport's current schema and returns the form that is stored ({@code columns} and
     * {@code config} only when given, {@code combine} in upper case). An empty object is valid and means "clear" (the caller stores
     * {@code null}); {@code null} is "keep" and is the caller's business.
     *
     * @throws BadRequestException {@value #ERROR_CODE} with {@code reason} ({@code NOT_AN_OBJECT}, {@code KEY_UNKNOWN},
     *                             {@code COLUMNS_INVALID}, {@code STAT_UNKNOWN}, {@code STAT_DISABLED_BY_SPORT},
     *                             {@code STAT_NOT_CONFIGURABLE}, {@code WHEN_INVALID}, {@code COMBINE_INVALID}) and {@code detail}
     */
    public static Map<String, Object> parse(Object node, StatisticsSchema sport) {
        if (!(node instanceof Map<?, ?> map)) {
            throw invalid("NOT_AN_OBJECT", null);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            String key = String.valueOf(entry.getKey());
            switch (key) {
                case "columns" -> result.put(key, parseColumns(entry.getValue(), sport));
                case "config" -> result.put(key, parseConfig(entry.getValue(), sport));
                default -> throw invalid("KEY_UNKNOWN", key);
            }
        }
        return result;
    }

    private static List<String> parseColumns(Object node, StatisticsSchema sport) {
        if (!(node instanceof List<?> list) || list.isEmpty()) {
            throw invalid("COLUMNS_INVALID", "columns");
        }
        Set<String> seen = new LinkedHashSet<>();
        for (Object item : list) {
            if (!(item instanceof String stat) || !seen.add(stat)) {
                throw invalid("COLUMNS_INVALID", String.valueOf(item));
            }
            if (!sport.catalog().containsKey(stat)) {
                throw invalid("STAT_UNKNOWN", stat);
            }
            if (StatisticsSchema.isOff(sport.catalog(), stat, sport.disabledStats())) {
                throw invalid("STAT_DISABLED_BY_SPORT", stat);
            }
        }
        return new ArrayList<>(seen);
    }

    private static Map<String, Object> parseConfig(Object node, StatisticsSchema sport) {
        if (!(node instanceof Map<?, ?> map)) {
            throw invalid("NOT_AN_OBJECT", "config");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            String stat = String.valueOf(entry.getKey());
            if (!sport.catalog().containsKey(stat)) {
                throw invalid("STAT_UNKNOWN", stat);
            }
            if (!SESSIONS.equals(stat)) {
                throw invalid("STAT_NOT_CONFIGURABLE", stat);
            }
            result.put(stat, parseSessions(entry.getValue()));
        }
        return result;
    }

    static Map<String, Object> parseSessions(Object node) {
        if (!(node instanceof Map<?, ?> map)) {
            throw invalid("NOT_AN_OBJECT", "config." + SESSIONS);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            String key = String.valueOf(entry.getKey());
            Object value = entry.getValue();
            switch (key) {
                case "when" -> {
                    if (!(value instanceof List<?> list) || list.isEmpty()) {
                        throw invalid("WHEN_INVALID", "config." + SESSIONS + ".when");
                    }
                    Set<String> seen = new LinkedHashSet<>();
                    for (Object item : list) {
                        if (!("joined".equals(item) || "atLeast1Game".equals(item)) || !seen.add((String) item)) {
                            throw invalid("WHEN_INVALID", String.valueOf(item));
                        }
                    }
                    result.put(key, new ArrayList<>(seen));
                }
                case "combine" -> {
                    if (!(value instanceof String text) || !(text.equalsIgnoreCase("AND") || text.equalsIgnoreCase("OR"))) {
                        throw invalid("COMBINE_INVALID", "config." + SESSIONS + ".combine");
                    }
                    result.put(key, text.toUpperCase(Locale.ROOT));
                }
                default -> throw invalid("KEY_UNKNOWN", "config." + SESSIONS + "." + key);
            }
        }
        return result;
    }

    /**
     * The rule that makes a session count for the group's member row: the group's own {@code when} (and {@code combine}) when its
     * {@code config} names one, otherwise the sport's. {@code configByStat} is the {@code config} node of a group's stored stats
     * config.
     */
    public static StatisticsSchema.SessionsRule sessionsRule(Map<String, Object> configByStat, StatisticsSchema.SessionsRule sport) {
        if (configByStat != null && configByStat.get(SESSIONS) instanceof Map<?, ?> entry && entry.get("when") instanceof List<?> when) {
            boolean and = entry.get("combine") instanceof String combine && combine.equalsIgnoreCase("AND");
            return StatisticsSchema.SessionsRule.of(when, and);
        }
        return sport;
    }

    /**
     * What a settings answer shows as the stat list the group's member row and board really use, built on the fly against the sport's
     * <b>current</b> schema (nothing of it is stored): the effective {@code columns}, the effective {@code config} (the
     * {@code sessions} rule, when the list holds it), and {@code off}: every other stat of the catalog with the reason it is not in
     * the list: {@code SPORT_DISABLED} (the sport set {@code enabled: false}, a hard off), {@code OPERAND_DISABLED} (a formula that
     * needs such a stat) or {@code NOT_IN_LIST} (neither the sport's list nor the group's names it).
     */
    public static Map<String, Object> effective(StatisticsSchema sport, Map<String, Object> groupConfig) {
        StatisticsSchema view = sport.forGroup(groupConfig);
        Map<String, Object> config = new LinkedHashMap<>();
        if (view.columns().contains(SESSIONS)) {
            config.put(SESSIONS, view.sessionsRule().toConfig());
        }
        Map<String, Object> off = new LinkedHashMap<>();
        for (String stat : sport.catalog().keySet()) {
            if (view.columns().contains(stat)) {
                continue;
            }
            off.put(stat, sport.disabledStats().contains(stat) ? "SPORT_DISABLED"
                    : StatisticsSchema.isOff(sport.catalog(), stat, sport.disabledStats()) ? "OPERAND_DISABLED" : "NOT_IN_LIST");
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("columns", new ArrayList<>(view.columns()));
        result.put("config", config);
        result.put("off", off);
        return result;
    }

    private static BadRequestException invalid(String reason, String detail) {
        Map<String, Object> params = new LinkedHashMap<>();
        params.put("reason", reason);
        if (detail != null) {
            params.put("detail", detail);
        }
        return new BadRequestException(ERROR_CODE, "The statistics config is not valid: " + reason, params);
    }
}
