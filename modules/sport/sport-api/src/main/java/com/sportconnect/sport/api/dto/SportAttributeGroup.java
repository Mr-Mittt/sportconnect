package com.sportconnect.sport.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * A grouping node in a sport's attribute schema (A9; nesting added by v3/A19) — e.g. "Gear",
 * "Gear → Rackets".
 *
 * <p>Groups nest: a group may carry sub-{@link #groups} and {@link #attributes} together, to
 * arbitrary depth. Nesting is by containment, so no cycle is possible.
 *
 * <p><strong>Groups namespace their children.</strong> A node is addressed by its full,
 * {@code /}-separated path from the schema root — {@code gear/rackets/tension}. {@code key} is
 * unique <em>among its siblings only</em> (v1's sport-wide uniqueness was relaxed in v3), and within
 * one parent the child sub-group keys and child attribute keys share a single namespace, so the
 * last path segment is unambiguous without knowing whether it names a group or a leaf.
 *
 * <p>A group's {@code key} <em>and its position in the tree</em> are immutable by policy: both are
 * part of every descendant's storage path in {@code UserSportProfile.attributes}, so a rename or a
 * move orphans stored values. Retiring a group means adding the replacement subtree and setting the
 * old group {@code isAvailable: false} — never editing its key or reparenting it in place.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SportAttributeGroup {

    /** Unique among sibling nodes (sub-groups and attributes of the same parent). Must match {@code ^[a-z][a-zA-Z0-9_]*$}. */
    private String key;

    /**
     * Locale (BCP 47) → display text (A13). Must carry an entry for the enclosing schema's
     * {@code defaultLocale}; text itself is otherwise unconstrained.
     */
    private Map<String, String> label;

    /**
     * Soft delete. An unavailable group hides its <em>whole subtree at every depth</em>: no
     * descendant attribute is offered on profile writes even if its own {@code isAvailable} is
     * {@code true}. Parent state wins, so retiring a subtree needs no per-descendant edit.
     */
    private Boolean isAvailable;

    /**
     * Optional nested sub-groups (v3/A19). {@code null} or empty for a leaf grouping. A sub-group's
     * {@code key} shares one namespace with this group's {@link #attributes} keys.
     */
    private List<SportAttributeGroup> groups;

    private List<SportAttributeDefinition> attributes;
}
