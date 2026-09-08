package com.sportconnect.common.attributes.resolved;

import com.fasterxml.jackson.annotation.JsonInclude;
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

    private Boolean isAvailable;

    private List<ResolvedAttributeGroup> groups;

    private List<ResolvedAttributeNode> attributes;
}
