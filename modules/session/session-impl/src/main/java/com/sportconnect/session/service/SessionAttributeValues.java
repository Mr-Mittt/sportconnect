package com.sportconnect.session.service;

import com.sportconnect.sport.api.dto.SportAttributeDefinitionType;
import com.sportconnect.sport.api.dto.SportAttributeField;
import com.sportconnect.sport.api.dto.SportAttributeOption;
import com.sportconnect.sport.api.dto.SportAttributeType;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * "Is this value valid for this attribute type" for SESSION-23's write-time attribute filter.
 *
 * <p><strong>A deliberate clone</strong> of {@code sport-impl}'s {@code SportAttributeValues}
 * (A9/A12/A16). {@code session-impl} can only see the {@code sport-api} DTO tree, not that
 * package-private class, and this codebase clones a validation <em>shape</em> across a domain
 * boundary rather than sharing the implementation (the {@code SessionGate}/{@code PostGate}
 * precedent). Kept behaviourally identical to the sport version so the two collapse cleanly when
 * the attribute framework is extracted to a shared home — see sport ticket {@code A23} /
 * common ticket {@code C5}.
 *
 * <p>Operates only on {@link SessionAttributeFilter}; not a Spring bean.
 */
final class SessionAttributeValues {

    /**
     * Per-value item cap for both multi-valued shapes — {@code LIST} here, and
     * {@code DEFINITION_LIST} in {@link SessionAttributeFilter} (which does not route through this
     * class). Same hardcoded default as the sport side; client-mirrored via CLIENT-SESSION-15.
     */
    static final int MAX_LIST_ITEMS = 10;

    private SessionAttributeValues() {
    }

    /**
     * Validity for the <strong>primitive</strong> types only ({@code STRING}, {@code NUMBER},
     * {@code BOOLEAN}, {@code ENUM}, {@code LIST}). {@code DEFINITION}/{@code DEFINITION_LIST}
     * throw — a caller reaching this with a record type is a bug; record values go through
     * {@link #filterScalarOrRecord}/{@link #isValidRecord} instead.
     *
     * @param value        the candidate value; never {@code null} here (callers handle null first)
     * @param type         the attribute's declared type
     * @param allowedValues the attribute's option values; empty for {@code STRING}/{@code NUMBER}/{@code BOOLEAN}
     * @param min          inclusive lower bound for {@code NUMBER}, or {@code null}
     * @param max          inclusive upper bound for {@code NUMBER}, or {@code null}
     * @return whether the value is storable under this attribute
     */
    static boolean isValid(Object value, SportAttributeType type, Set<String> allowedValues, Double min, Double max) {
        if (value == null || type == null) {
            return false;
        }
        return switch (type) {
            case STRING -> value instanceof String;
            // instanceof Number, never instanceof Integer: Jackson picks Integer/Long/Double by the
            // literal. A boolean is not a Number and a numeric String is not a Number, so both are
            // rejected here for free.
            case NUMBER -> value instanceof Number n && withinBounds(n, min, max);
            case BOOLEAN -> value instanceof Boolean;
            case ENUM -> value instanceof String s && allowedValues.contains(s);
            // Every element must be an allowed String. An empty list is valid. More than
            // MAX_LIST_ITEMS invalidates the whole value — there is no partial-keep for a LIST.
            case LIST -> value instanceof List<?> list && list.size() <= MAX_LIST_ITEMS
                    && list.stream().allMatch(e -> e instanceof String s && allowedValues.contains(s));
            case DEFINITION, DEFINITION_LIST -> throw new IllegalStateException(
                    "isValid is for primitive types only — DEFINITION/DEFINITION_LIST values go "
                            + "through isValidRecord/filterScalarOrRecord instead");
        };
    }

    /**
     * @return whether {@code n} is a finite number within the inclusive {@code [min, max]} range;
     *         a {@code null} bound is "unbounded on that side". NaN and infinity are never valid.
     */
    private static boolean withinBounds(Number n, Double min, Double max) {
        double d = n.doubleValue();
        if (Double.isNaN(d) || Double.isInfinite(d)) {
            return false;
        }
        return (min == null || d >= min) && (max == null || d <= max);
    }

    /**
     * Applies the required-field cascade to one record: every field the definition declares is
     * checked against its own type via {@link #filterScalarOrRecord}; a missing or invalid
     * <strong>required</strong> field invalidates the whole record; a missing or invalid
     * <strong>optional</strong> field is dropped on its own and the record survives. A key present
     * in {@code record} the definition does not declare is dropped implicitly.
     *
     * @param record         the candidate record; {@code null} is invalid
     * @param definitionType the shape to validate against; {@code null} is invalid (unresolved ref)
     * @param definitions    the schema's full registry, for resolving nested {@code DEFINITION} fields
     * @return the surviving fields, or {@code null} if the record itself is invalid
     */
    static Map<String, Object> isValidRecord(Map<String, Object> record, SportAttributeDefinitionType definitionType,
                                             Map<String, SportAttributeDefinitionType> definitions) {
        if (record == null || definitionType == null) {
            return null;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        for (SportAttributeField field : nullSafeFields(definitionType)) {
            Object raw = record.get(field.getKey());
            boolean required = Boolean.TRUE.equals(field.getIsRequired());
            if (raw == null) {
                if (required) {
                    return null;
                }
                continue;
            }
            Object value = filterScalarOrRecord(raw, field.getType(), optionValues(field.getOptions()),
                    field.getMin(), field.getMax(), field.getDefinitionRef(), definitions);
            if (value == null) {
                if (required) {
                    return null;
                }
                continue;
            }
            result.put(field.getKey(), value);
        }
        return result;
    }

    /**
     * The shared dispatcher for any single scalar or record value — used directly for a top-level
     * {@code DEFINITION} attribute or a definition field, and once per element for a top-level
     * {@code DEFINITION_LIST} attribute (see {@link SessionAttributeFilter}, which owns iterating
     * the list).
     *
     * <p>{@code type} is never {@code DEFINITION_LIST} here — a definition field can never declare
     * that type, and {@code DEFINITION_LIST} attributes are unwrapped into per-element
     * {@code DEFINITION} calls by their caller.
     *
     * @return the value to store ({@code raw} itself for a valid primitive, or the filtered record
     *         map for a valid {@code DEFINITION}), or {@code null} if nothing survives
     */
    static Object filterScalarOrRecord(Object raw, SportAttributeType type, Set<String> allowedValues,
                                       Double min, Double max, String definitionRef,
                                       Map<String, SportAttributeDefinitionType> definitions) {
        return switch (type) {
            case STRING, NUMBER, BOOLEAN, ENUM, LIST -> isValid(raw, type, allowedValues, min, max) ? raw : null;
            case DEFINITION -> {
                Map<String, Object> record = asRecord(raw);
                yield record == null ? null : isValidRecord(record, definitions.get(definitionRef), definitions);
            }
            case DEFINITION_LIST -> throw new IllegalStateException(
                    "filterScalarOrRecord does not handle DEFINITION_LIST directly — the caller must "
                            + "iterate its elements and call this once per element with type DEFINITION");
        };
    }

    /**
     * @return {@code value} cast to a string-keyed map, or {@code null} if it is not a JSON object.
     */
    @SuppressWarnings("unchecked")
    static Map<String, Object> asRecord(Object value) {
        return value instanceof Map<?, ?> map ? (Map<String, Object>) map : null;
    }

    private static List<SportAttributeField> nullSafeFields(SportAttributeDefinitionType definitionType) {
        return definitionType.getFields() == null ? List.of() : definitionType.getFields();
    }

    private static Set<String> optionValues(List<SportAttributeOption> options) {
        if (options == null) {
            return Set.of();
        }
        Set<String> values = new HashSet<>();
        for (SportAttributeOption option : options) {
            values.add(option.getValue());
        }
        return values;
    }
}
