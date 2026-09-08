package com.sportconnect.common.attributes;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.sportconnect.common.attributes.node.AttributeNode;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * A grouping node in a schema tree — e.g. "Gear", "Gear → Rackets".
 *
 * <p>Groups nest by containment to arbitrary depth ({@link #groups}) and may hold {@link #attributes}
 * alongside sub-groups. A node is addressed by its full {@code /}-separated path from the schema
 * root ({@code gear/rackets/tension}); {@code key} is unique <em>among its siblings only</em>, and
 * within one parent the sub-group keys and attribute keys share a single namespace.
 *
 * <p>{@code key} and tree position are immutable by policy — both are part of every descendant's
 * storage path, so a rename or a move orphans stored values. Retire a subtree by setting the group
 * {@code isAvailable: false}, never by editing its key.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AttributeGroup {

    /** Unique among sibling nodes (sub-groups and attributes of the same parent). Matches {@code ^[a-z][a-zA-Z0-9_]*$}. */
    private String key;

    /** Locale (BCP 47) → display text. Must carry an entry for the schema's {@code defaultLocale}. */
    private Map<String, String> label;

    /**
     * Soft delete. An unavailable group hides its whole subtree at every depth — no descendant is
     * offered on writes even if its own {@code isAvailable} is {@code true}. Parent state wins.
     */
    private Boolean isAvailable;

    /** Optional nested sub-groups. {@code null} or empty for a leaf grouping. */
    private List<AttributeGroup> groups;

    /** The group's direct attribute leaves. */
    private List<AttributeNode> attributes;
}
