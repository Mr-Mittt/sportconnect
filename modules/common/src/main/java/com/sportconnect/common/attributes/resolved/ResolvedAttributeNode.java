package com.sportconnect.common.attributes.resolved;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.sportconnect.common.attributes.AttributeType;
import com.sportconnect.common.attributes.Cardinality;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * {@link com.sportconnect.common.attributes.node.AttributeNode}, locale-resolved and
 * <strong>flattened</strong> (extraction plan D6). The sealed input hierarchy collapses to one
 * flat DTO: {@code type} plus whichever per-kind fields apply, the rest {@code null}. This is a
 * write-once, read-once, immediately-serialised projection the client narrows into its own
 * discriminated union — so the open/closed benefit is kept on the input side (C8's resolver
 * dispatch is per-type) without doubling the class count here.
 *
 * <p>{@code cardinality} / {@code prefillable} / {@code prefillKey} are set only on a node produced
 * from a {@code #ref} (by C9's derived-schema resolver), never on an own node or a plain
 * single-schema resolution.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ResolvedAttributeNode {

    private String key;

    private String label;

    /** The value kind. {@code null} is not expected on a resolved node — a {@code #ref} inherits one on expansion. */
    private AttributeType type;

    private List<ResolvedAttributeOption> options;

    private Boolean isAvailable;

    private Object defaultValue;

    /** Inclusive bounds for a {@code NUMBER} node; {@code null} otherwise. */
    private Double min;

    private Double max;

    private String definitionRef;

    private String searchScope;

    /** {@code SINGLE}/{@code LIST} — set only on a {@code #ref}-derived node (C9). */
    private Cardinality cardinality;

    /** {@code true} when this node came from a {@code #ref} and the client may source its value(s) from the creator's profile. */
    private Boolean prefillable;

    /** When {@link #prefillable}, the base-schema {@code /}-path the client reads the choice list from. */
    private String prefillKey;
}
