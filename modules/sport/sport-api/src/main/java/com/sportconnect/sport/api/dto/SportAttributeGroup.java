package com.sportconnect.sport.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * A display grouping of attributes within a sport's schema (A9) — e.g. "Gear", "Play style".
 *
 * <p>Groups exist for presentation only; they do not namespace their children. Attribute keys are
 * unique across the whole sport regardless of which group they sit in.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SportAttributeGroup {

    /** Unique among groups. Must match {@code ^[a-z][a-zA-Z0-9_]*$}. */
    private String key;

    /**
     * Locale (BCP 47) → display text (A13). Must carry an entry for the enclosing schema's
     * {@code defaultLocale}; text itself is otherwise unconstrained.
     */
    private Map<String, String> label;

    /**
     * Soft delete. An unavailable group hides its <em>whole subtree</em>: its children are not
     * offered on profile writes even if their own {@code isAvailable} is {@code true}. Parent state
     * wins, so retiring a group needs no per-child edit.
     */
    private Boolean isAvailable;

    /** Display order among groups. Not validated for uniqueness or contiguity. */
    private Integer order;

    private List<SportAttributeDefinition> attributes;
}
