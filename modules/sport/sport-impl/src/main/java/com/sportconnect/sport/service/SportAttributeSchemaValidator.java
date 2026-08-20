package com.sportconnect.sport.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.sport.api.dto.SportAttributeDefinition;
import com.sportconnect.sport.api.dto.SportAttributeGroup;
import com.sportconnect.sport.api.dto.SportAttributeOption;
import com.sportconnect.sport.api.dto.SportAttributeSchema;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Validates an admin-supplied attribute schema document before it is stored (A9).
 *
 * <p><strong>All-or-nothing.</strong> The document is checked in full and the first violation
 * throws, so a bad paste never half-applies and leaves a sport with a partly-rewritten schema.
 *
 * <p>This is the strict half of A9's deliberately asymmetric validation: admin writes here are
 * rejected loudly, whereas user profile writes are filtered silently by
 * {@link ProfileAttributeFilter}. That asymmetry is intentional and was an explicit product
 * decision — an admin pasting a malformed tree needs to know about it, whereas a user's stale
 * client key is noise not worth failing a profile save over.
 *
 * <p>Hand-rolled rather than a JSON Schema library: the rule set is small and closed, and the most
 * important rule (sport-wide leaf-key uniqueness) is a cross-branch invariant that JSON Schema
 * expresses poorly.
 */
@Component
@RequiredArgsConstructor
class SportAttributeSchemaValidator {

    /**
     * Conservative enough that a key is always safe both as a JSON object key and as a client form
     * field name, so no layer in the stack needs escaping rules of its own.
     */
    private static final Pattern KEY_PATTERN = Pattern.compile("^[a-z][a-zA-Z0-9_]*$");

    /**
     * 16KB — larger than the 4KB profile-attributes cap because a schema carries labels and option
     * lists, not just values. Admin-only write, so this guards against a bad paste rather than
     * abuse.
     */
    private static final int MAX_SCHEMA_BYTES = 16384;

    private final ObjectMapper objectMapper;

    /**
     * Validates the document in full, throwing on the first violation found.
     *
     * <p>Check order affects error quality only, not correctness: structural rules run before the
     * size rule so an oversized malformed document reports what is actually wrong with it rather
     * than merely that it is too big.
     *
     * @param schema the document to validate; {@code null} is valid and means "offers no attributes"
     * @throws BadRequestException on any violation, naming the offending node
     */
    void validate(SportAttributeSchema schema) {
        if (schema == null) {
            return;
        }
        if (schema.getVersion() == null) {
            throw new BadRequestException("Attribute schema must declare a version");
        }

        Set<String> groupKeys = new HashSet<>();
        // Accumulated across every group rather than reset per group: leaf keys are unique across
        // the WHOLE sport. That is what lets the stored profile map stay flat while the schema is a
        // tree, so it is the one rule here that must not be relaxed.
        Set<String> attributeKeys = new HashSet<>();

        for (SportAttributeGroup group : nullSafe(schema.getGroups())) {
            validateKey(group.getKey(), "Group key");
            if (!groupKeys.add(group.getKey())) {
                throw new BadRequestException("Duplicate group key: " + group.getKey());
            }
            for (SportAttributeDefinition attribute : nullSafe(group.getAttributes())) {
                validateAttribute(attribute, attributeKeys);
            }
        }

        validateSize(schema);
    }

    private void validateAttribute(SportAttributeDefinition attribute, Set<String> seenKeys) {
        validateKey(attribute.getKey(), "Attribute key");
        if (!seenKeys.add(attribute.getKey())) {
            throw new BadRequestException(
                    "Duplicate attribute key across the sport: " + attribute.getKey());
        }
        if (attribute.getType() == null) {
            throw new BadRequestException(
                    "Attribute " + attribute.getKey() + " must declare a type");
        }

        List<SportAttributeOption> options = nullSafe(attribute.getOptions());
        switch (attribute.getType()) {
            case ENUM, LIST -> validateOptions(attribute, options);
            // A STRING carrying options usually means the author meant ENUM. Rejecting is cheaper
            // than silently ignoring a list they expected to constrain input with.
            case STRING -> {
                if (!options.isEmpty()) {
                    throw new BadRequestException(
                            "Attribute " + attribute.getKey() + " is STRING and must not declare options");
                }
            }
        }

        validateDefaultValue(attribute, options);
    }

    private void validateOptions(SportAttributeDefinition attribute, List<SportAttributeOption> options) {
        if (options.isEmpty()) {
            throw new BadRequestException("Attribute " + attribute.getKey() + " is "
                    + attribute.getType() + " and must declare at least one option");
        }
        Set<String> values = new HashSet<>();
        for (SportAttributeOption option : options) {
            if (option.getValue() == null || option.getValue().isBlank()) {
                throw new BadRequestException(
                        "Attribute " + attribute.getKey() + " has an option with no value");
            }
            if (!values.add(option.getValue())) {
                throw new BadRequestException("Attribute " + attribute.getKey()
                        + " has duplicate option value: " + option.getValue());
            }
        }
    }

    /**
     * A default is checked against its own node exactly as a user-supplied value would be, via the
     * shared {@link SportAttributeValues}. A schema therefore cannot ship a default that the
     * profile write path would then silently refuse to store.
     */
    private void validateDefaultValue(SportAttributeDefinition attribute, List<SportAttributeOption> options) {
        Object defaultValue = attribute.getDefaultValue();
        if (defaultValue == null) {
            return;
        }
        Set<String> allowed = new HashSet<>();
        for (SportAttributeOption option : options) {
            allowed.add(option.getValue());
        }
        if (!SportAttributeValues.isValid(defaultValue, attribute.getType(), allowed)) {
            throw new BadRequestException("Attribute " + attribute.getKey()
                    + " has a defaultValue invalid for type " + attribute.getType());
        }
    }

    private void validateKey(String key, String what) {
        if (key == null || !KEY_PATTERN.matcher(key).matches()) {
            throw new BadRequestException(
                    what + " must match " + KEY_PATTERN.pattern() + " but was: " + key);
        }
    }

    private void validateSize(SportAttributeSchema schema) {
        try {
            byte[] json = objectMapper.writeValueAsBytes(schema);
            if (json.length > MAX_SCHEMA_BYTES) {
                throw new BadRequestException("Attribute schema exceeds the maximum allowed size (16KB)");
            }
        } catch (JsonProcessingException e) {
            throw new BadRequestException("Invalid attribute schema");
        }
    }

    private static <T> List<T> nullSafe(List<T> list) {
        return list == null ? new ArrayList<>() : list;
    }
}
