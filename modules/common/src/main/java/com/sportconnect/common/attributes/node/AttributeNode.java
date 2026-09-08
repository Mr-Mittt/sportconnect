package com.sportconnect.common.attributes.node;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;

import java.util.Map;

/**
 * One attribute leaf in a schema group tree — a sealed hierarchy keyed on the wire property
 * {@code "type"}, replacing the flat {@code SportAttributeDefinition} god-DTO (extraction plan D5).
 * Each subtype carries only the fields its kind actually uses:
 *
 * <ul>
 *   <li>{@link StringAttribute} / {@link BooleanAttribute} — key + label (+ typed {@code defaultValue});</li>
 *   <li>{@link NumberAttribute} — adds {@code min}/{@code max};</li>
 *   <li>{@link EnumAttribute} / {@link ListAttribute} — add {@code options};</li>
 *   <li>{@link DefinitionAttribute} / {@link DefinitionListAttribute} — add {@code definitionRef} / {@code searchScope};</li>
 *   <li>{@link RefAttribute} — a {@code #ref} pointer: {@code ref} + {@code cardinality} (extraction plan D9).
 *       Legal only in a <em>derived</em> schema; the single-schema validator rejects it.</li>
 * </ul>
 *
 * <p><strong>Discrimination:</strong> {@code @JsonTypeInfo(As.PROPERTY, property = "type")} — Jackson
 * owns the {@code type} property as type-metadata, so no subtype declares a {@code type} field.
 * Java code discriminates with a {@code switch} over the sealed set (exhaustive at compile time).
 * The wire {@code type} value for a ref node is the string {@code "REF"} — a {@link JsonSubTypes}
 * name only, not an {@link com.sportconnect.common.attributes.AttributeType} member.
 *
 * <p>The only fields common to <em>every</em> kind, and so declared here, are {@code key} and
 * {@code label}. {@code isAvailable} is on own nodes but not on a {@code #ref} node (which inherits
 * lifecycle from its base target), so it is not on this interface.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes({
        @JsonSubTypes.Type(value = StringAttribute.class, name = "STRING"),
        @JsonSubTypes.Type(value = NumberAttribute.class, name = "NUMBER"),
        @JsonSubTypes.Type(value = BooleanAttribute.class, name = "BOOLEAN"),
        @JsonSubTypes.Type(value = EnumAttribute.class, name = "ENUM"),
        @JsonSubTypes.Type(value = ListAttribute.class, name = "LIST"),
        @JsonSubTypes.Type(value = DefinitionAttribute.class, name = "DEFINITION"),
        @JsonSubTypes.Type(value = DefinitionListAttribute.class, name = "DEFINITION_LIST"),
        @JsonSubTypes.Type(value = RefAttribute.class, name = "REF")
})
public sealed interface AttributeNode
        permits StringAttribute, NumberAttribute, BooleanAttribute, EnumAttribute,
        ListAttribute, DefinitionAttribute, DefinitionListAttribute, RefAttribute {

    /** Unique among sibling nodes (attributes and sub-groups of the same parent). Matches {@code ^[a-z][a-zA-Z0-9_]*$}. */
    String getKey();

    /**
     * Locale (BCP 47) → display text. An own node must carry an entry for the schema's
     * {@code defaultLocale}; a {@code #ref} node's label map is an optional override and may be
     * {@code null}.
     */
    Map<String, String> getLabel();
}
