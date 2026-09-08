package com.sportconnect.common.attributes.resolved;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * {@link com.sportconnect.common.attributes.AttributeSchema}, locale-resolved (C8) — the
 * member-facing view. Every {@code label} in the tree is a single display string for the caller's
 * locale.
 *
 * <p>No {@code defaultLocale} — that was only ever an input to resolution.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ResolvedAttributeSchema {

    private List<ResolvedAttributeDefinitionType> definitions;

    private List<ResolvedAttributeGroup> groups;
}
