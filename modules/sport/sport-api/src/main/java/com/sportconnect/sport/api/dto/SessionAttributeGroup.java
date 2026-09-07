package com.sportconnect.sport.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * A grouping node in a sport's <em>session</em> attribute schema (A17) — the session-schema twin of
 * {@link SportAttributeGroup}.
 *
 * <p>Groups nest by containment to arbitrary depth ({@link #groups}) and may hold {@link #attributes}
 * alongside sub-groups, exactly like {@link SportAttributeGroup}. Display order is array position;
 * there is no {@code order} field (A19 removed it schema-wide).
 *
 * <p>The difference from {@link SportAttributeGroup} is the child kind: {@link #attributes} holds
 * {@link SessionAttributeNode}s, each of which is either a {@code #ref} (a pointer at a profile
 * attribute) or a self-contained "own" definition.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionAttributeGroup {

    /** Unique among sibling nodes (sub-groups and own-node keys of the same parent). Must match {@code ^[a-z][a-zA-Z0-9_]*$}. */
    private String key;

    /**
     * Locale (BCP 47) → display text. Must carry an entry for the enclosing schema's
     * {@code defaultLocale}.
     */
    private Map<String, String> label;

    /**
     * Soft delete. An unavailable group hides its whole subtree at every depth on the member-facing
     * resolved schema; parent state wins. Same semantics as {@link SportAttributeGroup#getIsAvailable()}.
     */
    private Boolean isAvailable;

    /** Optional nested sub-groups. {@code null} or empty for a leaf grouping. */
    private List<SessionAttributeGroup> groups;

    /** The group's direct attribute nodes — each a {@code #ref} or an own definition. */
    private List<SessionAttributeNode> attributes;
}
