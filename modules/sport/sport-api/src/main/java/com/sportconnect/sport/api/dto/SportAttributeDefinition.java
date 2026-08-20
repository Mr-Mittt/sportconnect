package com.sportconnect.sport.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

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

    /** Display text. Unconstrained. */
    private String label;

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

    /** Optional. When present, must be valid for this node's own {@code type} and options. */
    private Object defaultValue;
}
