package com.sportconnect.sport.api.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * One attribute node in a sport's <em>session</em> attribute schema (A17) — a leaf under a
 * {@link SessionAttributeGroup}. A node is one of two kinds, distinguished by whether {@link #ref}
 * is set:
 *
 * <ul>
 *   <li><strong>{@code #ref} node</strong> ({@link #ref} non-null): a pointer at a profile-schema
 *       attribute by its full {@code /}-separated path ({@code gear/rackets/tension}). Its
 *       {@code type}, {@code options}, {@code definitionRef} (and hence the referenced record shape,
 *       from the <em>profile</em> {@code definitions} registry) are all inherited from that profile
 *       attribute. Only {@link #label} may be overridden. Pre-fillable client-side from the session
 *       creator's own sport profile — the resolved schema marks it
 *       {@code prefillable=true}/{@code prefillKey=<path>}. Every other field on this class must be
 *       {@code null} when {@link #ref} is set; the validator rejects the document otherwise.</li>
 *   <li><strong>own node</strong> ({@link #ref} null): a fully self-contained definition for an
 *       event-only attribute with no profile counterpart ("Balls provided?", "Competitive / casual").
 *       Carries its own {@code key}/{@code label}/{@code type}/... exactly like a
 *       {@link SportAttributeDefinition}, and its {@code definitionRef} (if any) resolves against the
 *       <em>session-local</em> {@link SessionAttributeSchema#getDefinitions()} registry. Not
 *       pre-fillable; use {@link #defaultValue} for a placeholder.</li>
 * </ul>
 *
 * <p>There is no {@code order} field (A19 removed it schema-wide; array position is the order) and
 * no {@code searchScope} (entity-linking typeahead is a profile / A14 concern).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SessionAttributeNode {

    /**
     * When set, this is a {@code #ref} node: the full {@code /}-separated path of the profile-schema
     * attribute it points at (e.g. {@code gear/rackets/tension}). Serialised as the JSON key
     * {@code "#ref"}. {@code null} for an own node.
     */
    @JsonProperty("#ref")
    private String ref;

    /**
     * For a {@code #ref} node: an optional locale→text override of the referenced attribute's label
     * ({@code null} keeps the inherited label). For an own node: the required label map, which must
     * carry an entry for the schema's {@code defaultLocale}.
     */
    private Map<String, String> label;

    // ---- own-node fields: all must be null on a #ref node ----

    /** Own node only. Unique among sibling nodes. Must match {@code ^[a-z][a-zA-Z0-9_]*$}. */
    private String key;

    /** Own node only. */
    private SportAttributeType type;

    /** Own node only. Required and non-empty for {@code ENUM}/{@code LIST}; absent otherwise. */
    private List<SportAttributeOption> options;

    /** Own node only. Soft delete, same semantics as {@link SportAttributeDefinition#getIsAvailable()}. */
    private Boolean isAvailable;

    /** Own node only. Must be valid for {@code type}; forbidden for {@code DEFINITION}/{@code DEFINITION_LIST}. */
    private Object defaultValue;

    /** Own node only. Inclusive lower bound; legal only when {@code type} is {@code NUMBER}. */
    private Double min;

    /** Own node only. Inclusive upper bound; legal only when {@code type} is {@code NUMBER}. */
    private Double max;

    /**
     * Own node only. Names a {@link SportAttributeDefinitionType} in the <em>session-local</em>
     * registry ({@link SessionAttributeSchema#getDefinitions()}). Required when {@code type} is
     * {@code DEFINITION}/{@code DEFINITION_LIST}, absent otherwise.
     */
    private String definitionRef;
}
