package com.sportconnect.sport.api.dto;

/**
 * The value kinds a per-sport attribute (or, since v2, a {@link SportAttributeField} inside a
 * {@link SportAttributeDefinitionType}) can hold (A9; {@code DEFINITION}/{@code DEFINITION_LIST}
 * added by v2/A12).
 *
 * <p>Deliberately a small closed set. {@code NUMBER} and {@code BOOLEAN} are the obvious next
 * additions but are not present until a real attribute needs one, per this codebase's standing
 * "don't design for hypothetical future requirements" rule (tracked as A16).
 *
 * <p><strong>Client-visible.</strong> The client branches on this to decide which form control to
 * render, so adding a member here is a client-facing change: client {@code SPORT-2} (renderer) and
 * {@code ADMIN-2} (editor) must gain a case for it in the same change or one filed alongside.
 */
public enum SportAttributeType {

    /** Free text. Stored as a {@code String}. Not bounded by the schema — only by the profile size cap. */
    STRING,

    /** Single choice. Stored as a {@code String} that must equal one of the node's {@code options[].value}. */
    ENUM,

    /** Multi-choice. Stored as a {@code List<String>}, each element one of the node's {@code options[].value}. */
    LIST,

    /**
     * One record, shaped by the definition named in {@code definitionRef}. Stored as a
     * {@code Map<String, Object>} keyed by the definition's field keys.
     *
     * <p>Legal on a top-level attribute or on a {@link SportAttributeField} — but when it is the
     * latter, the referenced definition may itself declare only primitive fields ({@code STRING}/
     * {@code ENUM}/{@code LIST}); see {@code SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md} §5.3. That rule is
     * what makes a cycle through two {@code DEFINITION} fields structurally unrepresentable.
     */
    DEFINITION,

    /**
     * A repeating record, shaped by the definition named in {@code definitionRef}. Stored as a
     * {@code List<Map<String, Object>>}. A write replaces the whole list — there is no per-element
     * identity or merge.
     *
     * <p>Legal on a top-level attribute only — never on a {@link SportAttributeField}, which keeps
     * stored-value nesting bounded at three JSON levels (attribute list → record → nested record →
     * primitive).
     */
    DEFINITION_LIST
}
