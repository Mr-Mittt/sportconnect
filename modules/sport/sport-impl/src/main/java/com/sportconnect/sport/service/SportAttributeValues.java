package com.sportconnect.sport.service;

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
 * The single definition of "is this value valid for this attribute type" (A9), extended by v2/A12
 * for record types.
 *
 * <p>Deliberately shared by both halves of A9's asymmetric validation:
 * {@link SportAttributeSchemaValidator} uses {@link #isValid} to check an admin-supplied
 * {@code defaultValue}, and {@link ProfileAttributeFilter} uses {@link #filterScalarOrRecord} (which
 * itself calls {@link #isValid} for the primitive cases) to decide what a user-supplied value keeps.
 * One implementation means a schema can never declare a default that the profile write path would
 * then silently drop — a divergence that would be invisible until a user hit it.
 */
final class SportAttributeValues {

    /**
     * Default per-value item cap for both multi-valued shapes — {@code LIST} here, and
     * {@code DEFINITION_LIST} in {@link ProfileAttributeFilter}, which does not route through this
     * class. A hardcoded default, not yet admin-configurable per attribute: there is no concrete need
     * for a per-attribute cap today, so this is the smallest thing that bounds unbounded growth,
     * consistent with this codebase's "don't design for hypothetical future requirements" rule.
     * <strong>Client-mirrored</strong> — {@code SPORT-2}/{@code SPORT-6} must block adding a further
     * item past this count in the UI, the same strict-client/lenient-server split as
     * {@code isRequired} (v2 design §6.2): the server drops the whole value silently, the client
     * should never let a user reach that state in the first place.
     */
    static final int MAX_LIST_ITEMS = 10;

    private SportAttributeValues() {
    }

    /**
     * Validity for the three <strong>primitive</strong> types only. {@code type} is the full
     * {@link SportAttributeType} enum, so the switch below is compile-time exhaustive — but
     * {@code DEFINITION}/{@code DEFINITION_LIST} throw rather than silently answering, because a
     * caller reaching this method with a record type is a programming error: record values go
     * through {@link #isValidRecord}/{@link #filterScalarOrRecord} instead, since "is this record
     * valid" also needs to say *which of its fields* to keep, which a boolean cannot express.
     *
     * <p>In practice this is never invoked with a record type: {@link SportAttributeSchemaValidator}
     * forbids {@code defaultValue} on {@code DEFINITION}/{@code DEFINITION_LIST} attributes before
     * ever reaching this method, and every other caller in this class routes records through
     * {@link #filterScalarOrRecord} instead of calling this directly.
     *
     * @param value        the candidate value; never {@code null} here (callers handle null first)
     * @param type         the attribute's declared type
     * @param allowedValues the attribute's option values; empty for {@code STRING}
     * @return whether the value is storable under this attribute
     */
    static boolean isValid(Object value, SportAttributeType type, Set<String> allowedValues) {
        if (value == null || type == null) {
            return false;
        }
        return switch (type) {
            case STRING -> value instanceof String;
            case ENUM -> value instanceof String s && allowedValues.contains(s);
            // Every element must be an allowed String. An empty list is valid: it is how a user
            // clears a multi-select without needing a delete-a-key path (which A9 does not have).
            // More than MAX_LIST_ITEMS invalidates the whole value, same as any other bad shape -
            // there is no partial-keep for a too-long LIST any more than for a too-long ENUM.
            case LIST -> value instanceof List<?> list && list.size() <= MAX_LIST_ITEMS
                    && list.stream().allMatch(e -> e instanceof String s && allowedValues.contains(s));
            case DEFINITION, DEFINITION_LIST -> throw new IllegalStateException(
                    "isValid is for primitive types only — DEFINITION/DEFINITION_LIST values go "
                            + "through isValidRecord/filterScalarOrRecord instead");
        };
    }

    /**
     * Applies the v2 §6 required-field cascade to one record: every field the definition declares is
     * checked against its own type via {@link #filterScalarOrRecord}; a missing or invalid
     * <strong>required</strong> field invalidates the whole record; a missing or invalid
     * <strong>optional</strong> field is dropped on its own and the record survives. A key present in
     * {@code record} that the definition does not declare is dropped implicitly — this method only
     * ever reads keys it knows about, which is what keeps junk from satisfying a requirement.
     *
     * <p>Recurses through {@link #filterScalarOrRecord} for any field whose own type is
     * {@code DEFINITION}, so a nested record's own invalid-optional-field is dropped from the stored
     * result too, not just checked for whole-record validity. The recursion terminates in one step
     * in practice: {@link SportAttributeSchemaValidator} only allows a {@code DEFINITION}-typed field
     * to reference a definition that itself holds primitive fields only (v2 design §5.3), so this
     * method trusts the schema was already validated rather than re-deriving that bound at runtime.
     *
     * @param record         the candidate record; {@code null} is invalid
     * @param definitionType the shape to validate against; {@code null} is invalid (an unresolved or
     *                       absent {@code definitionRef})
     * @param definitions    the sport's full registry, for resolving any nested {@code DEFINITION}
     *                       fields
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
                    field.getDefinitionRef(), definitions);
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
     * The shared dispatcher behind both halves of A9/A12's asymmetric validation for any single
     * scalar or record value — used directly for a top-level {@code DEFINITION} attribute or a
     * definition field, and once per element for a top-level {@code DEFINITION_LIST} attribute
     * (see {@link ProfileAttributeFilter}, which owns iterating the list itself since "keep the good
     * elements, drop the bad ones" is a list-level policy, not a per-value one).
     *
     * <p>{@code type} is never {@code DEFINITION_LIST} here — a definition field can never declare
     * that type ({@link SportAttributeSchemaValidator} rejects it at write time), and
     * {@code DEFINITION_LIST} attributes are unwrapped into per-element {@code DEFINITION} calls by
     * their caller before reaching this method.
     *
     * @return the value to store ({@code raw} itself for a valid primitive, or the filtered record
     *         map for a valid {@code DEFINITION}), or {@code null} if nothing survives
     */
    static Object filterScalarOrRecord(Object raw, SportAttributeType type, Set<String> allowedValues,
                                        String definitionRef, Map<String, SportAttributeDefinitionType> definitions) {
        return switch (type) {
            case STRING, ENUM, LIST -> isValid(raw, type, allowedValues) ? raw : null;
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
     *         Safe without an unchecked cast in practice: every value here originated from
     *         deserialised JSON, whose object keys are always strings.
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
