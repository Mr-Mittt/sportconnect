package com.sportconnect.session.stats;

import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.sport.api.service.ResultSchemaValidator;
import org.springframework.stereotype.Component;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * SESSION-84: the statistics side of a sport's result schema, checked when an admin saves it ({@code PUT /api/sports/{id}/result-schema},
 * through the sport module's {@link ResultSchemaValidator}). A stored schema is still read leniently by {@link StatisticsSchema} (a
 * schema edit must never stop a session from being counted); this refuses, at the time of the save, what the reader would have to
 * ignore, so the admin finds out:
 * <ul>
 *   <li>{@code record.scoreboard.config} must be an object keyed by stats of the record type's catalog, each an object;</li>
 *   <li>{@code enabled}, when present, must be a boolean (a stat with {@code enabled: false} is a hard off for the whole sport);</li>
 *   <li>{@code config.sessions} takes {@code when} and {@code combine} as {@link StatsConfigs} defines them, other stats nothing else;</li>
 *   <li>a <b>formula listed in {@code columns} must not have a disabled operand</b> ({@code winRate} needs {@code games} and
 *       {@code wins}): it could not be computed.</li>
 * </ul>
 * A schema whose record type has no catalog is not checked here (the statistics ignore it).
 */
@Component
public class StatisticsSchemaValidator implements ResultSchemaValidator {

    static final String CODE = "SPORT_RESULT_SCHEMA_INVALID";

    @Override
    public void validate(Map<String, Object> schema) {
        Map<String, Object> record = map(schema.get("record"));
        Object type = map(record.get("data")).get("type");
        Map<String, StatsCatalog.Stat> catalog = StatsCatalog.forType(type instanceof String name ? name : null);
        if (catalog.isEmpty()) {
            return;
        }
        Map<String, Object> scoreboard = map(record.get("scoreboard"));
        Object config = scoreboard.get("config");
        if (config == null) {
            return;
        }
        if (!(config instanceof Map<?, ?> byStat)) {
            throw invalid("record.scoreboard.config must be an object");
        }
        Set<String> disabled = new LinkedHashSet<>();
        for (Map.Entry<?, ?> entry : byStat.entrySet()) {
            String stat = String.valueOf(entry.getKey());
            String path = "record.scoreboard.config." + stat;
            if (!catalog.containsKey(stat)) {
                throw invalid(path + " is not a stat of the " + type + " catalog");
            }
            if (!(entry.getValue() instanceof Map<?, ?> settings)) {
                throw invalid(path + " must be an object");
            }
            for (Map.Entry<?, ?> field : settings.entrySet()) {
                String name = String.valueOf(field.getKey());
                if ("enabled".equals(name)) {
                    if (!(field.getValue() instanceof Boolean)) {
                        throw invalid(path + ".enabled must be true or false");
                    }
                } else if (!(StatsConfigs.SESSIONS.equals(stat) && ("when".equals(name) || "combine".equals(name)))) {
                    throw invalid(path + "." + name + " is not a setting of " + stat);
                }
            }
            if (Boolean.FALSE.equals(settings.get("enabled"))) {
                disabled.add(stat);
            }
            if (StatsConfigs.SESSIONS.equals(stat)) {
                checkSessions(settings, path);
            }
        }
        if (scoreboard.get("columns") instanceof List<?> columns) {
            for (Object column : columns) {
                if (column instanceof String key && catalog.containsKey(key) && !disabled.contains(key)) {
                    String cause = StatisticsSchema.offBecause(catalog, key, disabled, 0);
                    if (cause != null) {
                        throw invalid("record.scoreboard.columns lists " + key + " but its operand " + cause + " is disabled");
                    }
                }
            }
        }
    }

    /** {@code when} and {@code combine} of the sessions stat, checked by the same rules a group's config follows. */
    private static void checkSessions(Map<?, ?> settings, String path) {
        Map<String, Object> rest = new java.util.LinkedHashMap<>();
        settings.forEach((key, value) -> {
            if (!"enabled".equals(key)) {
                rest.put(String.valueOf(key), value);
            }
        });
        try {
            StatsConfigs.parseSessions(rest);
        } catch (BadRequestException e) {
            Object detail = e.getErrorParams() == null ? null : e.getErrorParams().get("detail");
            throw invalid(path + " is not valid: " + (e.getErrorParams() == null ? "" : e.getErrorParams().get("reason"))
                    + (detail == null ? "" : " (" + detail + ")"));
        }
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Object node) {
        return node instanceof Map<?, ?> m ? (Map<String, Object>) m : Map.of();
    }

    private static BadRequestException invalid(String message) {
        return new BadRequestException(CODE, message, null);
    }
}
