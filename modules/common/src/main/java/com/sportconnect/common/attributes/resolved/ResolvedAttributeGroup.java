package com.sportconnect.common.attributes.resolved;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.sportconnect.common.attributes.AttributeLayout;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * {@link com.sportconnect.common.attributes.AttributeGroup}, locale-resolved (C8): {@code label} a
 * single string; carries the nested {@link #groups} tree to arbitrary depth. Display order is
 * array position.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ResolvedAttributeGroup {

    private String key;

    private String label;

    /** Optional, server-opaque presentation hint (C11), copied verbatim from the raw group. */
    private AttributeLayout layout;

    /** Optional render-suppression flag (C11), copied verbatim from the raw group. Absent reads as {@code false}. */
    private Boolean hidden;

    private Boolean isAvailable;

    private List<ResolvedAttributeGroup> groups;

    private List<ResolvedAttributeNode> attributes;
}
