package com.sportconnect.sport.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.sport.api.dto.SportAttributeDefinition;
import com.sportconnect.sport.api.dto.SportAttributeDefinitionType;
import com.sportconnect.sport.api.dto.SportAttributeField;
import com.sportconnect.sport.api.dto.SportAttributeGroup;
import com.sportconnect.sport.api.dto.SportAttributeOption;
import com.sportconnect.sport.api.dto.SportAttributeSchema;
import com.sportconnect.sport.api.dto.SportAttributeType;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Validates an admin-supplied attribute schema document before it is stored (A9; extended by v2/A12
 * for the {@code definitions} registry and {@code DEFINITION}/{@code DEFINITION_LIST} type kinds).
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
     * PascalCase, deliberately distinct from {@link #KEY_PATTERN}: a definition name is a type
     * namespace, never itself written into a stored profile, so it reads differently at a glance
     * from every {@code key} field (v2 design §5.4).
     */
    private static final Pattern DEFINITION_NAME_PATTERN = Pattern.compile("^[A-Z][a-zA-Z0-9]*$");

    /**
     * BCP 47 language tag, permissively (a primary subtag plus any number of hyphenated subtags) —
     * enough to reject the ISO-3166-country-code mistake ({@code "vn"} is a valid 2-letter primary
     * subtag on its own, but {@code label} keys are what {@code Accept-Language} actually sends, so
     * requiring the general tag shape catches typos like {@code "vi_VN"} without hand-maintaining a
     * registry of valid subtags (A13).
     */
    private static final Pattern LOCALE_PATTERN = Pattern.compile("^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{1,8})*$");

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
     * <p>Check order affects error quality only, not correctness: {@code defaultLocale} is checked
     * first since every label check below needs it (A13); the {@code definitions} registry is then
     * validated before the group/attribute tree, so a {@code definitionRef} can be resolved against
     * a fully-built map; the size rule runs last so an oversized malformed document reports what is
     * actually wrong with it rather than merely that it is too big.
     *
     * @param schema the document to validate; {@code null} is valid and means "offers no attributes"
     * @throws BadRequestException on any violation, naming the offending node
     */
    void validate(SportAttributeSchema schema) {
        if (schema == null) {
            return;
        }

        // Fails fast, before any node in the tree is walked: every label check below needs a
        // resolved defaultLocale to check against (A13).
        if (schema.getDefaultLocale() == null || !LOCALE_PATTERN.matcher(schema.getDefaultLocale()).matches()) {
            throw new BadRequestException(
                    "Schema defaultLocale must match " + LOCALE_PATTERN.pattern()
                            + " but was: " + schema.getDefaultLocale());
        }
        String defaultLocale = schema.getDefaultLocale();

        Map<String, SportAttributeDefinitionType> definitionsByName =
                validateDefinitions(schema.getDefinitions(), defaultLocale);

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
            validateLabel(group.getLabel(), defaultLocale, "Group " + group.getKey());
            for (SportAttributeDefinition attribute : nullSafe(group.getAttributes())) {
                validateAttribute(attribute, attributeKeys, definitionsByName, defaultLocale);
            }
        }

        validateSize(schema);
    }

    private void validateAttribute(SportAttributeDefinition attribute, Set<String> seenKeys,
                                    Map<String, SportAttributeDefinitionType> definitionsByName,
                                    String defaultLocale) {
        validateKey(attribute.getKey(), "Attribute key");
        if (!seenKeys.add(attribute.getKey())) {
            throw new BadRequestException(
                    "Duplicate attribute key across the sport: " + attribute.getKey());
        }
        validateLabel(attribute.getLabel(), defaultLocale, "Attribute " + attribute.getKey());
        if (attribute.getType() == null) {
            throw new BadRequestException(
                    "Attribute " + attribute.getKey() + " must declare a type");
        }

        List<SportAttributeOption> options = nullSafe(attribute.getOptions());
        switch (attribute.getType()) {
            case ENUM, LIST -> validateOptionsList(
                    "Attribute " + attribute.getKey(), options, attribute.getType(), defaultLocale);
            // A STRING carrying options usually means the author meant ENUM. Rejecting is cheaper
            // than silently ignoring a list they expected to constrain input with. NUMBER/BOOLEAN
            // (A16) are bounded by min/max, never an option set.
            case STRING, NUMBER, BOOLEAN -> {
                if (!options.isEmpty()) {
                    throw new BadRequestException(
                            "Attribute " + attribute.getKey() + " is " + attribute.getType()
                                    + " and must not declare options");
                }
            }
            case DEFINITION, DEFINITION_LIST -> {
                if (!options.isEmpty()) {
                    throw new BadRequestException("Attribute " + attribute.getKey() + " is "
                            + attribute.getType() + " and must not declare options");
                }
                if (attribute.getDefaultValue() != null) {
                    throw new BadRequestException("Attribute " + attribute.getKey() + " is "
                            + attribute.getType() + " and must not declare a defaultValue");
                }
                if (attribute.getDefinitionRef() == null) {
                    throw new BadRequestException("Attribute " + attribute.getKey() + " is "
                            + attribute.getType() + " and must declare definitionRef");
                }
                if (!definitionsByName.containsKey(attribute.getDefinitionRef())) {
                    throw new BadRequestException("Attribute " + attribute.getKey()
                            + " references unknown definition: " + attribute.getDefinitionRef());
                }
            }
        }

        validateNumericBounds("Attribute " + attribute.getKey(), attribute.getType(),
                attribute.getMin(), attribute.getMax());

        if (attribute.getType() != SportAttributeType.DEFINITION
                && attribute.getType() != SportAttributeType.DEFINITION_LIST) {
            if (attribute.getDefinitionRef() != null) {
                throw new BadRequestException("Attribute " + attribute.getKey()
                        + " must not declare definitionRef unless its type is DEFINITION or DEFINITION_LIST");
            }
            if (attribute.getSearchScope() != null) {
                throw new BadRequestException("Attribute " + attribute.getKey()
                        + " must not declare searchScope unless its type is DEFINITION or DEFINITION_LIST");
            }
            validateDefaultValue(attribute, options);
        }
    }

    /**
     * {@code min}/{@code max} are legal only on a {@code NUMBER} node, and require {@code min <= max}
     * when both are set (A16). Any other combination is an authoring mistake the admin needs told
     * about loudly, same as every other rule here.
     */
    private void validateNumericBounds(String context, SportAttributeType type, Double min, Double max) {
        if (type != SportAttributeType.NUMBER) {
            if (min != null || max != null) {
                throw new BadRequestException(context + " is " + type + " and must not declare min/max");
            }
            return;
        }
        if (min != null && max != null && min > max) {
            throw new BadRequestException(context + " has a min greater than its max");
        }
    }

    private void validateOptionsList(String context, List<SportAttributeOption> options, SportAttributeType type,
                                      String defaultLocale) {
        if (options.isEmpty()) {
            throw new BadRequestException(context + " is " + type + " and must declare at least one option");
        }
        Set<String> values = new HashSet<>();
        for (SportAttributeOption option : options) {
            if (option.getValue() == null || option.getValue().isBlank()) {
                throw new BadRequestException(context + " has an option with no value");
            }
            if (!values.add(option.getValue())) {
                throw new BadRequestException(context + " has duplicate option value: " + option.getValue());
            }
            validateLabel(option.getLabel(), defaultLocale, context + " option " + option.getValue());
        }
    }

    /**
     * A default is checked against its own node exactly as a user-supplied value would be, via the
     * shared {@link SportAttributeValues}. A schema therefore cannot ship a default that the
     * profile write path would then silently refuse to store.
     *
     * <p>Never called for {@code DEFINITION}/{@code DEFINITION_LIST} attributes — those forbid
     * {@code defaultValue} outright in {@link #validateAttribute}, before this method would be
     * reached — so {@link SportAttributeValues#isValid} only ever sees the primitive types here
     * ({@code STRING}/{@code NUMBER}/{@code BOOLEAN}/{@code ENUM}/{@code LIST}).
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
        if (!SportAttributeValues.isValid(defaultValue, attribute.getType(), allowed,
                attribute.getMin(), attribute.getMax())) {
            throw new BadRequestException("Attribute " + attribute.getKey()
                    + " has a defaultValue invalid for type " + attribute.getType());
        }
    }

    /**
     * Validates the sport-local {@code definitions} registry (v2 design §5.4) and returns it keyed
     * by name, resolved and ready for the group/attribute pass to reference.
     *
     * <p>Three passes, each depending on the last: (1) collect names, rejecting bad patterns and
     * duplicates; (2) validate every definition's own fields, including that any
     * {@code definitionRef} they carry resolves against the now-complete name set; (3) compute which
     * definitions are referenced <em>by another definition's field</em> ("inner position") and
     * enforce that those hold only primitive fields.
     *
     * <p>That third pass is the whole of the depth/cycle rule (v2 design §5.3) — deliberately no
     * traversal or visited-set is written. A cycle {@code A → B → A} requires {@code B} (inner,
     * referenced by {@code A}) to hold a field pointing back to {@code A}, but inner-position
     * definitions may only hold primitives, so {@code B} fails this pass directly. A self-reference
     * {@code A → A} puts {@code A} in both positions, the same contradiction.
     */
    private Map<String, SportAttributeDefinitionType> validateDefinitions(List<SportAttributeDefinitionType> definitions,
                                                                           String defaultLocale) {
        Map<String, SportAttributeDefinitionType> byName = new LinkedHashMap<>();
        for (SportAttributeDefinitionType definition : nullSafe(definitions)) {
            if (definition.getName() == null || !DEFINITION_NAME_PATTERN.matcher(definition.getName()).matches()) {
                throw new BadRequestException("Definition name must match "
                        + DEFINITION_NAME_PATTERN.pattern() + " but was: " + definition.getName());
            }
            if (byName.putIfAbsent(definition.getName(), definition) != null) {
                throw new BadRequestException("Duplicate definition name: " + definition.getName());
            }
        }

        for (SportAttributeDefinitionType definition : byName.values()) {
            Set<String> fieldKeys = new HashSet<>();
            for (SportAttributeField field : nullSafe(definition.getFields())) {
                validateKey(field.getKey(), "Definition field key");
                if (!fieldKeys.add(field.getKey())) {
                    throw new BadRequestException("Duplicate field key in definition "
                            + definition.getName() + ": " + field.getKey());
                }
                validateField(definition, field, byName, defaultLocale);
            }
        }

        validateInnerPositionDefinitionsArePrimitiveOnly(byName);
        return byName;
    }

    private void validateField(SportAttributeDefinitionType definition, SportAttributeField field,
                                Map<String, SportAttributeDefinitionType> definitionsByName,
                                String defaultLocale) {
        validateLabel(field.getLabel(), defaultLocale,
                "Definition " + definition.getName() + " field " + field.getKey());
        if (field.getType() == null) {
            throw new BadRequestException("Definition " + definition.getName()
                    + " field " + field.getKey() + " must declare a type");
        }

        List<SportAttributeOption> options = nullSafe(field.getOptions());
        switch (field.getType()) {
            case ENUM, LIST -> validateOptionsList(
                    "Definition " + definition.getName() + " field " + field.getKey(), options, field.getType(),
                    defaultLocale);
            case STRING, NUMBER, BOOLEAN -> {
                if (!options.isEmpty()) {
                    throw new BadRequestException("Definition " + definition.getName()
                            + " field " + field.getKey() + " is " + field.getType()
                            + " and must not declare options");
                }
            }
            case DEFINITION -> {
                if (!options.isEmpty()) {
                    throw new BadRequestException("Definition " + definition.getName()
                            + " field " + field.getKey() + " must not declare options");
                }
                if (field.getDefinitionRef() == null) {
                    throw new BadRequestException("Definition " + definition.getName()
                            + " field " + field.getKey() + " must declare definitionRef");
                }
                if (!definitionsByName.containsKey(field.getDefinitionRef())) {
                    throw new BadRequestException("Definition " + definition.getName() + " field "
                            + field.getKey() + " references unknown definition: " + field.getDefinitionRef());
                }
            }
            case DEFINITION_LIST -> throw new BadRequestException("Definition " + definition.getName()
                    + " field " + field.getKey()
                    + " must not be DEFINITION_LIST — a definition field may only be a primitive or a single DEFINITION");
        }

        if (field.getType() != SportAttributeType.DEFINITION && field.getDefinitionRef() != null) {
            throw new BadRequestException("Definition " + definition.getName() + " field " + field.getKey()
                    + " must not declare definitionRef unless its type is DEFINITION");
        }

        validateNumericBounds("Definition " + definition.getName() + " field " + field.getKey(),
                field.getType(), field.getMin(), field.getMax());
    }

    private void validateInnerPositionDefinitionsArePrimitiveOnly(Map<String, SportAttributeDefinitionType> byName) {
        Set<String> innerPosition = new HashSet<>();
        for (SportAttributeDefinitionType definition : byName.values()) {
            for (SportAttributeField field : nullSafe(definition.getFields())) {
                if (field.getType() == SportAttributeType.DEFINITION) {
                    innerPosition.add(field.getDefinitionRef());
                }
            }
        }

        for (String name : innerPosition) {
            // Guaranteed resolved already: validateField rejected an unresolved definitionRef above.
            SportAttributeDefinitionType inner = byName.get(name);
            for (SportAttributeField field : nullSafe(inner.getFields())) {
                switch (field.getType()) {
                    case STRING, NUMBER, BOOLEAN, ENUM, LIST -> { /* primitive — allowed inner */ }
                    default -> throw new BadRequestException("Definition " + name
                            + " is referenced by another definition and so may only contain primitive "
                            + "fields (STRING/NUMBER/BOOLEAN/ENUM/LIST), but field " + field.getKey()
                            + " is " + field.getType());
                }
            }
        }
    }

    private void validateKey(String key, String what) {
        if (key == null || !KEY_PATTERN.matcher(key).matches()) {
            throw new BadRequestException(
                    what + " must match " + KEY_PATTERN.pattern() + " but was: " + key);
        }
    }

    /**
     * Every labeled node (group, attribute, option, definition field) must carry an entry for the
     * document's {@code defaultLocale} — that is the one rule that makes resolution total (A13):
     * a missing label is caught here, at {@code PUT} time, never at render time by a user staring
     * at a blank field. Every locale key present is also checked against {@link #LOCALE_PATTERN},
     * not just the default one, since a malformed extra locale would otherwise sit in the document
     * unnoticed until some caller's {@code Accept-Language} happened to match it.
     */
    private void validateLabel(Map<String, String> label, String defaultLocale, String context) {
        if (label == null || label.isEmpty()) {
            throw new BadRequestException(context + " must declare a label for locale " + defaultLocale);
        }
        for (String locale : label.keySet()) {
            if (locale == null || !LOCALE_PATTERN.matcher(locale).matches()) {
                throw new BadRequestException(context + " has a malformed label locale: " + locale);
            }
        }
        if (!label.containsKey(defaultLocale)) {
            throw new BadRequestException(context + " label is missing the schema's defaultLocale: " + defaultLocale);
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
