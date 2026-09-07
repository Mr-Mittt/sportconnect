package com.sportconnect.sport.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.sport.api.dto.SportAttributeDefinition;
import com.sportconnect.sport.api.dto.SportAttributeDefinitionType;
import com.sportconnect.sport.api.dto.SportAttributeField;
import com.sportconnect.sport.api.dto.SportAttributeOption;
import com.sportconnect.sport.api.dto.SportAttributeType;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The rules a schema node obeys regardless of which schema it sits in — shared verbatim by
 * {@link SportAttributeSchemaValidator} (the profile schema, A9/A12/A19) and
 * {@link SessionAttributeSchemaValidator} (the session schema, A17). A session schema's <em>own</em>
 * (non-{@code #ref}) node is structurally a {@link SportAttributeDefinition}, and its
 * {@code definitions} registry is validated by exactly the same three-pass rule, so extracting these
 * keeps the two validators from drifting.
 *
 * <p>What is <strong>not</strong> here: the group-tree walk and the sibling-key namespace, because
 * the two schemas hold different child types ({@link SportAttributeDefinition} vs. the
 * {@code #ref}-or-own {@code SessionAttributeNode}). Each validator keeps its own walk.
 *
 * <p>All-or-nothing: the first violation throws {@link BadRequestException}.
 */
final class SchemaChecks {

    private SchemaChecks() {
    }

    /**
     * Conservative enough that a key is always safe both as a JSON object key and as a client form
     * field name, so no layer in the stack needs escaping rules of its own.
     */
    static final Pattern KEY_PATTERN = Pattern.compile("^[a-z][a-zA-Z0-9_]*$");

    /**
     * PascalCase, deliberately distinct from {@link #KEY_PATTERN}: a definition name is a type
     * namespace, never itself written into a stored profile, so it reads differently at a glance
     * from every {@code key} field (v2 design §5.4).
     */
    static final Pattern DEFINITION_NAME_PATTERN = Pattern.compile("^[A-Z][a-zA-Z0-9]*$");

    /**
     * BCP 47 language tag, permissively (a primary subtag plus any number of hyphenated subtags) —
     * enough to reject the ISO-3166-country-code mistake ({@code "vn"} is a valid 2-letter primary
     * subtag on its own, but {@code label} keys are what {@code Accept-Language} actually sends, so
     * requiring the general tag shape catches typos like {@code "vi_VN"} without hand-maintaining a
     * registry of valid subtags (A13).
     */
    static final Pattern LOCALE_PATTERN = Pattern.compile("^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{1,8})*$");

    /**
     * 16KB — larger than the 4KB profile-attributes cap because a schema carries labels and option
     * lists, not just values. Admin-only write, so this guards against a bad paste rather than
     * abuse.
     */
    static final int MAX_SCHEMA_BYTES = 16384;

    /** The document-level {@code defaultLocale} every label check below needs (A13). */
    static void validateDefaultLocale(String defaultLocale) {
        if (defaultLocale == null || !LOCALE_PATTERN.matcher(defaultLocale).matches()) {
            throw new BadRequestException(
                    "Schema defaultLocale must match " + LOCALE_PATTERN.pattern()
                            + " but was: " + defaultLocale);
        }
    }

    static void validateKey(String key, String what) {
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
    static void validateLabel(Map<String, String> label, String defaultLocale, String context) {
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

    /**
     * {@code min}/{@code max} are legal only on a {@code NUMBER} node, and require {@code min <= max}
     * when both are set (A16). Any other combination is an authoring mistake the admin needs told
     * about loudly, same as every other rule here.
     */
    static void validateNumericBounds(String context, SportAttributeType type, Double min, Double max) {
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

    static void validateOptionsList(String context, List<SportAttributeOption> options, SportAttributeType type,
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
     * Validates one attribute leaf: type present, options only where they belong, numeric bounds
     * only on {@code NUMBER}, {@code definitionRef}/{@code searchScope} only on
     * {@code DEFINITION}/{@code DEFINITION_LIST} and resolving against {@code definitionsByName}, and
     * a {@code defaultValue} that the profile write path would actually accept.
     *
     * <p>Shared by the profile schema (A9) and a session schema's own nodes (A17), which pass a
     * {@link SportAttributeDefinition} built from the own node — an own node has no
     * {@code searchScope}, so that branch simply never fires for it.
     */
    static void validateAttribute(SportAttributeDefinition attribute,
                                  Map<String, SportAttributeDefinitionType> definitionsByName,
                                  String defaultLocale) {
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
     * A default is checked against its own node exactly as a user-supplied value would be, via the
     * shared {@link SportAttributeValues}. A schema therefore cannot ship a default that the
     * profile write path would then silently refuse to store.
     *
     * <p>Never called for {@code DEFINITION}/{@code DEFINITION_LIST} attributes — those forbid
     * {@code defaultValue} outright in {@link #validateAttribute}, before this method would be
     * reached — so {@link SportAttributeValues#isValid} only ever sees the primitive types here
     * ({@code STRING}/{@code NUMBER}/{@code BOOLEAN}/{@code ENUM}/{@code LIST}).
     */
    static void validateDefaultValue(SportAttributeDefinition attribute, List<SportAttributeOption> options) {
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
     * Validates a sport-local {@code definitions} registry (v2 design §5.4) and returns it keyed by
     * name, resolved and ready for the group/attribute pass to reference. Shared verbatim by the
     * profile schema and the session schema's own {@code definitions} registry (A17).
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
    static Map<String, SportAttributeDefinitionType> validateDefinitions(List<SportAttributeDefinitionType> definitions,
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

    private static void validateField(SportAttributeDefinitionType definition, SportAttributeField field,
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

    private static void validateInnerPositionDefinitionsArePrimitiveOnly(Map<String, SportAttributeDefinitionType> byName) {
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

    /**
     * Serialised-byte cap. {@code subject} names the document in both messages ("Attribute schema" /
     * "Session attribute schema") so the two callers keep their own wording.
     */
    static void validateSize(Object schema, ObjectMapper objectMapper, String subject) {
        try {
            byte[] json = objectMapper.writeValueAsBytes(schema);
            if (json.length > MAX_SCHEMA_BYTES) {
                throw new BadRequestException(subject + " exceeds the maximum allowed size (16KB)");
            }
        } catch (JsonProcessingException e) {
            throw new BadRequestException("Invalid " + subject.toLowerCase(Locale.ROOT));
        }
    }

    static <T> List<T> nullSafe(List<T> list) {
        return list == null ? new ArrayList<>() : list;
    }
}
