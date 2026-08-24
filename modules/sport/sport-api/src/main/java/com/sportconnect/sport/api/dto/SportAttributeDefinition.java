package com.sportconnect.sport.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * One attribute a sport offers — a leaf in the schema tree (A9).
 *
 * <p>{@code key} is the identifier written into {@code UserSportProfile.attributes}, and is unique
 * across the <em>whole sport</em>, not merely within its group. That invariant is what lets the
 * stored profile map stay flat while the schema is a tree.
 *
 * <p>Keys are immutable by policy: renaming one silently orphans every stored value, so a "rename"
 * means adding a new attribute and switching the old one off.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SportAttributeDefinition {

    /** Unique across the entire sport. Must match {@code ^[a-z][a-zA-Z0-9_]*$}. */
    private String key;

    /**
     * Locale (BCP 47) → display text (A13). Must carry an entry for the enclosing schema's
     * {@code defaultLocale}; text itself is otherwise unconstrained.
     */
    private Map<String, String> label;

    private SportAttributeType type;

    /** Required and non-empty for {@code ENUM}/{@code LIST}; must be absent or empty otherwise. */
    private List<SportAttributeOption> options;

    /**
     * Soft delete. When {@code false} the attribute is not offered on profile writes — writes
     * targeting it are ignored — but values already stored under this key remain readable and are
     * still returned. Nothing a user saved is destroyed by an admin switching a field off.
     */
    private Boolean isAvailable;

    /** Display order within the parent group. Not validated for uniqueness or contiguity. */
    private Integer order;

    /**
     * Optional. When present, must be valid for this node's own {@code type} and options. Forbidden
     * for {@code DEFINITION}/{@code DEFINITION_LIST} — see {@code SportAttributeType} (v2 design
     * §5.5): a prefilled record would read as the user's own data, not a placeholder.
     */
    private Object defaultValue;

    /**
     * The name of the {@link SportAttributeDefinitionType} this attribute's value is shaped by.
     * Required when {@code type} is {@code DEFINITION}/{@code DEFINITION_LIST}; must be absent for
     * every other type (schema v2, A12).
     */
    private String definitionRef;

    /**
     * Optional pool name for entity-linking typeahead (v2 design §8.3), e.g.
     * {@code "equipment.racket.badminton"}. Only meaningful — and only ever set — on
     * {@code DEFINITION}/{@code DEFINITION_LIST} attributes; carried and validated here but not yet
     * consumed by any search endpoint (that lands with A14). Absent means plain free text, no
     * typeahead.
     */
    private String searchScope;
}
