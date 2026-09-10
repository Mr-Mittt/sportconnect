package com.sportconnect.common.attributes.field;

import com.fasterxml.jackson.annotation.JsonSubTypes;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.sportconnect.common.attributes.AttributeLayout;

import java.util.Map;

/**
 * One field within an {@link com.sportconnect.common.attributes.AttributeDefinitionType} record — a
 * sealed hierarchy keyed on the wire property {@code "type"}, the definition-field counterpart of
 * {@link com.sportconnect.common.attributes.node.AttributeNode} (extraction plan D5).
 *
 * <p>A field's type may be {@code STRING}, {@code NUMBER}, {@code BOOLEAN}, {@code ENUM},
 * {@code LIST} or {@code DEFINITION} — never {@code DEFINITION_LIST} (a field is never itself a
 * repeating list) and never a {@code #ref}. Hence six subtypes, no {@code RefField}.
 *
 * <p>{@code key}, {@code label} and {@code isRequired} are common to every kind and declared here.
 * {@code key} is unique only within its own definition and is never written into a stored value
 * directly — it only appears nested inside the record stored under some node's key.
 */
@JsonTypeInfo(use = JsonTypeInfo.Id.NAME, include = JsonTypeInfo.As.PROPERTY, property = "type")
@JsonSubTypes({
        @JsonSubTypes.Type(value = StringField.class, name = "STRING"),
        @JsonSubTypes.Type(value = NumberField.class, name = "NUMBER"),
        @JsonSubTypes.Type(value = BooleanField.class, name = "BOOLEAN"),
        @JsonSubTypes.Type(value = EnumField.class, name = "ENUM"),
        @JsonSubTypes.Type(value = ListField.class, name = "LIST"),
        @JsonSubTypes.Type(value = DefinitionField.class, name = "DEFINITION")
})
public sealed interface AttributeField
        permits StringField, NumberField, BooleanField, EnumField, ListField, DefinitionField {

    /** Unique within its own definition. Matches {@code ^[a-z][a-zA-Z0-9_]*$}. */
    String getKey();

    /** Locale (BCP 47) → display text. Must carry an entry for the schema's {@code defaultLocale}. */
    Map<String, String> getLabel();

    /**
     * When {@code true}, a missing or invalid value for this field invalidates the whole enclosing
     * record on a value write. Read as {@code false} when absent.
     */
    Boolean getIsRequired();

    /**
     * Optional, server-opaque presentation hint (C11). {@code null} when the field declares none.
     * Shape-checked on admin write (non-blank {@code id} when present), carried raw otherwise.
     */
    AttributeLayout getLayout();

    /**
     * Optional render-suppression flag (C11). {@code true} ⇒ the field's value is stored and
     * round-trips but no editor input and no read-only row is rendered. Absent reads as
     * {@code false}. The single-schema validator rejects {@code hidden == true} together with
     * {@code isRequired == true}.
     */
    Boolean getHidden();
}
