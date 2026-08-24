package com.sportconnect.sport.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * {@link SportAttributeSchema}, locale-resolved (A13) — served by
 * {@code GET /api/sports/{sportId}/attribute-schema} for member-facing callers. Every {@code label}
 * in the tree is a single display string for the caller's {@code Accept-Language}, resolved by
 * {@code SportAttributeSchemaLabelResolver}, instead of the raw {@code Map<String, String>} the
 * admin twin ({@code GET /api/sports/all/{sportId}/attribute-schema}, still {@link SportAttributeSchema})
 * returns.
 *
 * <p>No {@code defaultLocale} field — that was only ever an input to resolution, not something a
 * resolved-for-one-locale document needs to carry.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResolvedSportAttributeSchema {

    private List<ResolvedSportAttributeDefinitionType> definitions;

    private List<ResolvedSportAttributeGroup> groups;
}
