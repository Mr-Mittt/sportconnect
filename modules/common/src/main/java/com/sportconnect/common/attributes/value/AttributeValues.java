package com.sportconnect.common.attributes.value;

import com.sportconnect.common.attributes.AttributeOption;
import com.sportconnect.common.attributes.AttributeType;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * "Is this value valid for this attribute type" — the primitive core, lifted verbatim from sport
 * {@code SportAttributeValues} (A9/A16).
 *
 * <p>C6 builds only {@link #isValid} (+ its helpers): the schema validator uses it to check an
 * admin-declared {@code defaultValue} against its own node. C7 layers the record cascade
 * ({@code isValidRecord}), the scalar/record dispatcher ({@code filterScalarOrRecord}) and the
 * drop-invalid filter on top of this class.
 *
 * <p>One implementation, two callers (schema-time default check, value-write filter), so a schema
 * can never declare a default the write path would then silently drop.
 */
public final class AttributeValues {

    /**
     * Per-value item cap for both multi-valued shapes ({@code LIST} here; {@code DEFINITION_LIST} in
     * C7's filter, which does not route through this class). Hardcoded — no concrete need for a
     * per-attribute cap today. Client-mirrored (SPORT-2/SPORT-6 block adding past this in the UI).
     */
    public static final int MAX_LIST_ITEMS = 10;

    private AttributeValues() {
    }

    /**
     * Validity for the <strong>primitive</strong> types only ({@code STRING}, {@code NUMBER},
     * {@code BOOLEAN}, {@code ENUM}, {@code LIST}). Reaching this with {@code DEFINITION}/
     * {@code DEFINITION_LIST} is a programming error and throws — record values go through C7's
     * {@code isValidRecord}/{@code filterScalarOrRecord}, since "is this record valid" also has to
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
