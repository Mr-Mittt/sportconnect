package com.sportconnect.sport.service;

import com.sportconnect.sport.api.dto.SportAttributeType;

import java.util.List;
import java.util.Set;

/**
 * The single definition of "is this value valid for this attribute type" (A9).
 *
 * <p>Deliberately shared by both halves of A9's asymmetric validation:
 * {@link SportAttributeSchemaValidator} uses it to check an admin-supplied {@code defaultValue},
 * and {@link ProfileAttributeFilter} uses it to decide whether a user-supplied value survives.
 * One implementation means a schema can never declare a default that the profile write path would
 * then silently drop — a divergence that would be invisible until a user hit it.
 *
 * <p>The two callers differ only in what they do with the answer: the validator throws, the filter
 * discards.
 */
final class SportAttributeValues {

    private SportAttributeValues() {
    }

    /**
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
            case LIST -> value instanceof List<?> list
                    && list.stream().allMatch(e -> e instanceof String s && allowedValues.contains(s));
        };
    }
}
