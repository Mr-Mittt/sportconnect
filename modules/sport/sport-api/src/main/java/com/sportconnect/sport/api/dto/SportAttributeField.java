package com.sportconnect.sport.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * One field within a {@link SportAttributeDefinitionType} record (schema v2, A12).
 *
 * <p>{@code key} is unique only <em>within its own definition</em> — unlike
 * {@link SportAttributeDefinition#getKey()} it is never written into
 * {@code UserSportProfile.attributes} directly; it only ever appears nested inside the record
 * stored under some attribute's key.
 *
 * <p>{@code type} may be {@code STRING}, {@code ENUM}, {@code LIST}, or {@code DEFINITION} — never
 * {@code DEFINITION_LIST} (a definition field is never itself a repeating list; see
 * {@code SportAttributeType#DEFINITION_LIST}). And when the definition this field belongs to is
 * itself referenced by another definition's field, every field of THIS definition must be a
 * primitive — see {@code SPORT_ATTRIBUTE_SCHEMA_V2_DESIGN.md} §5.3.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SportAttributeField {

    /** Unique within its own definition. Must match {@code ^[a-z][a-zA-Z0-9_]*$}. */
    private String key;

    /** Display text. Unconstrained. */
    private String label;

    private SportAttributeType type;

    /** Required and non-empty for {@code ENUM}/{@code LIST}; must be absent or empty otherwise. */
    private List<SportAttributeOption> options;

    /**
     * The name of the {@link SportAttributeDefinitionType} this field's record is shaped by.
     * Required when {@code type} is {@code DEFINITION}; must be absent for every other type.
     */
    private String definitionRef;

    /**
     * When {@code true}, a missing or invalid value for this field invalidates the whole enclosing
     * record — not just this field — on a profile write (v2 design §6). Read as {@code false} when
     * absent.
     */
    private Boolean isRequired;

    /** Display order within the record. Not validated for uniqueness or contiguity. */
    private Integer order;
}
