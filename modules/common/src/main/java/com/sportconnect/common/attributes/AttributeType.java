package com.sportconnect.common.attributes;

/**
 * The value kinds an attribute node (or a {@link AttributeDefinitionType} field) can hold.
 *
 * <p>Domain-neutral home for what was {@code com.sportconnect.sport.api.dto.SportAttributeType}
 * (sport A9/A12/A16). Deliberately a small closed set — a new kind is added only when a real
 * attribute needs it, and doing so is an open/closed change: one new {@code AttributeNode} subtype
 * plus one line in each per-type registry, nothing existing edited.
 *
 * <p><strong>Not</strong> a member here: {@code REF}. A {@code #ref} node
 * ({@code com.sportconnect.common.attributes.node.RefAttribute}) is a separate {@code AttributeNode}
 * subtype whose wire discriminator is the string {@code "REF"}; it has no {@code AttributeType} of
 * its own — it inherits one from the base-schema attribute it points at (see the extraction plan
 * D9).
 */
public enum AttributeType {

    /** Free text. Stored as a {@code String}. Bounded only by the value-map size cap, never by the schema. */
    STRING,

    /**
     * A numeric value. Stored as a JSON number — Jackson yields {@code Integer}/{@code Long}/
     * {@code Double}/{@code BigInteger}/{@code BigDecimal} by the literal, so validity is an
     * {@code instanceof Number} check, never {@code instanceof Integer}. Integers and decimals alike
     * are accepted; a numeric <em>string</em> and a {@code boolean} are not. Optional inclusive
     * {@code min}/{@code max} on the declaring node bound it.
     */
    NUMBER,

    /** A true/false value. Stored as a JSON boolean; {@code 0}/{@code 1} and {@code "true"} are not valid. */
    BOOLEAN,

    /** Single choice. Stored as a {@code String} equal to one of the node's {@code options[].value}. */
    ENUM,

    /** Multi-choice. Stored as a {@code List<String>}, each element one of the node's {@code options[].value}. */
    LIST,

    /**
     * One record, shaped by the definition named in {@code definitionRef}. Stored as a
     * {@code Map<String, Object>} keyed by the definition's field keys. Legal on a node or on a
     * definition field — but an inner-position definition (referenced by another definition's field)
     * may itself declare only primitive fields, which is what makes a cycle structurally
     * unrepresentable.
     */
    DEFINITION,

    /**
     * A repeating record, shaped by {@code definitionRef}. Stored as a
     * {@code List<Map<String, Object>>}; a write replaces the whole list (no per-element identity).
     * Legal on a node only — never on a definition field.
     */
    DEFINITION_LIST
}
