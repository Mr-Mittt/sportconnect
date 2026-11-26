package com.sportconnect.session.stats;

import com.sportconnect.common.exception.BadRequestException;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * SESSION-83: a group's own config of the statistics it counts for its member row and its board, one entry by stat:
 * {@code {"sessions": {"enabled": false}}} or {@code {"sessions": {"when": ["atLeast1Game"]}}}. It can only <b>narrow</b> what the
 * sport collects (switch a stat off, or change what makes a session count); a stat the sport does not list stays uncollected. The
 * group's entry <b>replaces</b> the sport's for that row, with no field-by-field merge, except that a group that only says
 * {@code enabled} keeps the sport's {@code when}. Only {@code sessions} can be configured today (SESSION-84 will open the others).
 *
 * <p>{@link #parse} is strict (a settings call is refused when it is wrong, the owner sees the result at once); reading a stored
 * config is lenient, like the sport's schema.
 */
public final class StatsConfigs {

    public static final String ERROR_CODE = "SESSION_GROUP_STATS_CONFIG_INVALID";
    public static final String SESSIONS = "sessions";

    private StatsConfigs() {
    }

    /**
     * Checks a request's {@code statsConfig} and returns the form that is stored. An empty object is valid and means "clear" (the
     * caller stores {@code null}); {@code null} is "keep" and is the caller's business.
     *
     * @throws BadRequestException {@value #ERROR_CODE} with {@code reason} ({@code NOT_AN_OBJECT}, {@code KEY_UNKNOWN},
     *                             {@code STAT_NOT_CONFIGURABLE}, {@code ENABLED_INVALID}, {@code WHEN_INVALID},
     *                             {@code COMBINE_INVALID}) and {@code detail}
     */
    public static Map<String, Object> parse(Object node) {
        if (!(node instanceof Map<?, ?> map)) {
            throw invalid("NOT_AN_OBJECT", null);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            String stat = String.valueOf(entry.getKey());
            if (!SESSIONS.equals(stat)) {
                boolean known = StatsCatalog.forType("COMPETITIVE").containsKey(stat);
                throw invalid(known ? "STAT_NOT_CONFIGURABLE" : "KEY_UNKNOWN", stat);
            }
            result.put(stat, parseSessions(entry.getValue()));
        }
        return result;
    }

    private static Map<String, Object> parseSessions(Object node) {
        if (!(node instanceof Map<?, ?> map)) {
            throw invalid("NOT_AN_OBJECT", SESSIONS);
        }
        Map<String, Object> result = new LinkedHashMap<>();
        for (Map.Entry<?, ?> entry : map.entrySet()) {
            String key = String.valueOf(entry.getKey());
            Object value = entry.getValue();
            switch (key) {
                case "enabled" -> {
                    if (!(value instanceof Boolean)) {
                        throw invalid("ENABLED_INVALID", SESSIONS + ".enabled");
                    }
                    result.put(key, value);
                }
                case "when" -> {
                    if (!(value instanceof List<?> list) || list.isEmpty()) {
                        throw invalid("WHEN_INVALID", SESSIONS + ".when");
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
                        throw invalid("COMBINE_INVALID", SESSIONS + ".combine");
                    }
                    result.put(key, ((String) value).toUpperCase(java.util.Locale.ROOT));
                }
                default -> throw invalid("KEY_UNKNOWN", SESSIONS + "." + key);
            }
        }
        return result;
    }

    /** Whether the group's config switches the stat off for its member row (anything but a stored {@code enabled: false} is on). */
    public static boolean disables(Map<String, Object> config, String stat) {
        return config != null && config.get(stat) instanceof Map<?, ?> entry && Boolean.FALSE.equals(entry.get("enabled"));
    }

    /** The stats the group's config switches off. */
    public static Set<String> disabledStats(Map<String, Object> config) {
        Set<String> off = new LinkedHashSet<>();
        if (disables(config, SESSIONS)) {
            off.add(SESSIONS);
        }
        return off;
    }

    /**
     * The rule that makes a session count for the group's member row: the group's own {@code when} (and {@code combine}) when it
     * names one, otherwise the sport's.
     */
    public static StatisticsSchema.SessionsRule sessionsRule(Map<String, Object> config, StatisticsSchema.SessionsRule sport) {
        if (config != null && config.get(SESSIONS) instanceof Map<?, ?> entry && entry.get("when") instanceof List<?> when) {
            boolean and = entry.get("combine") instanceof String combine && combine.equalsIgnoreCase("AND");
            return StatisticsSchema.SessionsRule.of(when, and);
        }
        return sport;
    }

    /**
     * What a settings answer shows as the config the group's member row really uses: for {@code sessions}, whether it is collected
     * for the row (the sport collects it and the group did not switch it off) and, when it is, the rule.
     */
    public static Map<String, Object> effective(StatisticsSchema schema, Map<String, Object> config) {
        Map<String, Object> sessions = new LinkedHashMap<>();
        boolean on = schema.collectsSessions() && !disables(config, SESSIONS);
        sessions.put("enabled", on);
        if (on) {
            sessions.putAll(sessionsRule(config, schema.sessionsRule()).toConfig());
        }
        Map<String, Object> result = new LinkedHashMap<>();
        result.put(SESSIONS, sessions);
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
