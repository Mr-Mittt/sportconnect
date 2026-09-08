package com.sportconnect.common.attributes.value;

import com.sportconnect.common.attributes.AttributeDefinitionType;
import com.sportconnect.common.attributes.AttributeOption;
import com.sportconnect.common.attributes.AttributeType;
import com.sportconnect.common.attributes.field.AttributeField;
import com.sportconnect.common.attributes.field.BooleanField;
import com.sportconnect.common.attributes.field.DefinitionField;
import com.sportconnect.common.attributes.field.EnumField;
import com.sportconnect.common.attributes.field.ListField;
import com.sportconnect.common.attributes.field.NumberField;
import com.sportconnect.common.attributes.field.StringField;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * "Is this value valid for this attribute type" — the primitive core ({@link #isValid}, C6) plus
 * the record cascade and scalar/record dispatcher (C7). Lifted verbatim from sport
 * {@code SportAttributeValues} (A9/A12/A16).
 *
 * <p>One implementation, two callers — the schema validator's {@code defaultValue} check and
 * {@code AttributeValueFilter}'s value-write filter — so a schema can never declare a default the
 * write path would then silently drop.
 */
public final class AttributeValues {

    /**
     * Per-value item cap for both multi-valued shapes ({@code LIST} here; {@code DEFINITION_LIST} in
     * {@code AttributeValueFilter}, which does not route through this class). Hardcoded — no concrete
     * need for a per-attribute cap today. Client-mirrored (SPORT-2/SPORT-6 block adding past this in
     * the UI).
     */
    public static final int MAX_LIST_ITEMS = 10;

    private AttributeValues() {
    }

    /**
     * Validity for the <strong>primitive</strong> types only ({@code STRING}, {@code NUMBER},
     * {@code BOOLEAN}, {@code ENUM}, {@code LIST}). Reaching this with {@code DEFINITION}/
     * {@code DEFINITION_LIST} is a programming error and throws — record values go through
     * {@link #isValidRecord}/{@link #filterScalarOrRecord}, since "is this record valid" also has to
     * say <em>which fields</em> to keep, which a boolean cannot express.
     *
     * @param value         the candidate; {@code null} is never valid (callers handle null first)
     * @param type          the attribute's declared type
     * @param allowedValues the attribute's option values; empty for {@code STRING}/{@code NUMBER}/{@code BOOLEAN}
     * @param min           inclusive lower bound for {@code NUMBER}, or {@code null}
     * @param max           inclusive upper bound for {@code NUMBER}, or {@code null}
     */
    public static boolean isValid(Object value, AttributeType type, Set<String> allowedValues,
                                  Double min, Double max) {
        if (value == null || type == null) {
            return false;
        }
        return switch (type) {
            case STRING -> value instanceof String;
            // instanceof Number, never instanceof Integer: Jackson picks Integer/Long/Double/
            // BigInteger/BigDecimal by the literal. A boolean is not a Number and a numeric String
            // is not a Number, so both are rejected here for free.
            case NUMBER -> value instanceof Number n && withinBounds(n, min, max);
            case BOOLEAN -> value instanceof Boolean;
            case ENUM -> value instanceof String s && allowedValues.contains(s);
            // Every element an allowed String. An empty list is valid (clears a multi-select).
            // Over MAX_LIST_ITEMS invalidates the whole value — no partial-keep for a too-long LIST.
            case LIST -> value instanceof List<?> list && list.size() <= MAX_LIST_ITEMS
                    && list.stream().allMatch(e -> e instanceof String s && allowedValues.contains(s));
            case DEFINITION, DEFINITION_LIST -> throw new IllegalStateException(
                    "isValid is for primitive types only — DEFINITION/DEFINITION_LIST values go "
                            + "through isValidRecord/filterScalarOrRecord instead");
        };
    }

    /**
     * Applies the required-field cascade to one record (v2 §6): every declared field is checked
     * against its own type; a missing or invalid <strong>required</strong> field invalidates the
     * whole record; a missing or invalid <strong>optional</strong> field is dropped and the record
     * survives. A key present in {@code record} that the definition does not declare is dropped
     * implicitly — this method only reads keys it knows about, which is what keeps junk from
     * satisfying a requirement.
     *
     * <p>Recurses through {@link #filterScalarOrRecord} for any {@code DEFINITION} field, so a
     * nested record's own invalid-optional-field is dropped from the result too. Terminates in one
     * step in practice: the schema validator only lets a {@code DEFINITION} field reference a
     * definition holding primitive fields only, so this trusts the schema was already validated.
     *
     * @return the surviving fields, or {@code null} if the record itself is invalid
     */
    public static Map<String, Object> isValidRecord(Map<String, Object> record,
                                                    AttributeDefinitionType definitionType,
                                                    Map<String, AttributeDefinitionType> definitions) {
        if (record == null || definitionType == null) {
            return null;
        }
        Map<String, Object> result = new LinkedHashMap<>();
        for (AttributeField field : nullSafeFields(definitionType)) {
            Object raw = record.get(field.getKey());
            boolean required = Boolean.TRUE.equals(field.getIsRequired());
            if (raw == null) {
                if (required) {
                    return null;
                }
                continue;
            }
            FieldShape shape = shapeOf(field);
            Object value = filterScalarOrRecord(raw, shape.type(), shape.allowed(),
                    shape.min(), shape.max(), shape.definitionRef(), definitions);
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
     * The shared dispatcher for any single scalar or record value — used directly for a
     * {@code DEFINITION} node/field, and once per element for a {@code DEFINITION_LIST} node (which
     * {@code AttributeValueFilter} unwraps itself, since "keep the good elements" is a list-level
     * policy). {@code type} is never {@code DEFINITION_LIST} here.
     *
     * @return the value to store ({@code raw} for a valid primitive, the filtered record map for a
     *         valid {@code DEFINITION}), or {@code null} if nothing survives
     */
    public static Object filterScalarOrRecord(Object raw, AttributeType type, Set<String> allowedValues,
                                              Double min, Double max, String definitionRef,
                                              Map<String, AttributeDefinitionType> definitions) {
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
     *         Safe without an unchecked-cast worry: every value here originated from deserialised
     *         JSON, whose object keys are always strings.
     */
    @SuppressWarnings("unchecked")
    public static Map<String, Object> asRecord(Object value) {
        return value instanceof Map<?, ?> ? (Map<String, Object>) value : null;
    }

    /** The option {@code value}s as a set — the {@code allowedValues} argument to {@link #isValid}. */
    public static Set<String> optionValues(List<AttributeOption> options) {
        Set<String> values = new HashSet<>();
        if (options != null) {
            for (AttributeOption option : options) {
                values.add(option.getValue());
            }
        }
        return values;
    }

    /** The per-kind facts {@link #isValidRecord} needs from a sealed {@link AttributeField}. */
    private record FieldShape(AttributeType type, Set<String> allowed, Double min, Double max, String definitionRef) {
    }

    private static FieldShape shapeOf(AttributeField field) {
        return switch (field) {
            case StringField f -> new FieldShape(AttributeType.STRING, Set.of(), null, null, null);
            case NumberField f -> new FieldShape(AttributeType.NUMBER, Set.of(), f.getMin(), f.getMax(), null);
            case BooleanField f -> new FieldShape(AttributeType.BOOLEAN, Set.of(), null, null, null);
            case EnumField f -> new FieldShape(AttributeType.ENUM, optionValues(f.getOptions()), null, null, null);
            case ListField f -> new FieldShape(AttributeType.LIST, optionValues(f.getOptions()), null, null, null);
            case DefinitionField f -> new FieldShape(AttributeType.DEFINITION, Set.of(), null, null, f.getDefinitionRef());
        };
    }

    private static List<AttributeField> nullSafeFields(AttributeDefinitionType definitionType) {
        return definitionType.getFields() == null ? List.of() : definitionType.getFields();
    }

    /**
     * @return whether {@code n} is finite and within the inclusive {@code [min, max]} range; a
     *         {@code null} bound is "unbounded on that side". NaN/infinity are never valid.
     */
    private static boolean withinBounds(Number n, Double min, Double max) {
        double d = n.doubleValue();
        if (Double.isNaN(d) || Double.isInfinite(d)) {
            return false;
        }
        return (min == null || d >= min) && (max == null || d <= max);
    }
}
