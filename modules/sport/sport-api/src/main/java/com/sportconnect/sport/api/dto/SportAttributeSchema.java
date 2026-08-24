package com.sportconnect.sport.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * The full attribute definition for one sport (A9) — the document stored in
 * {@code sports.attributes_schema} and served by {@code GET /api/sports/{sportId}/attribute-schema}.
 *
 * <p>A sport with no schema at all yields {@code null} from
 * {@code SportService.getAttributeSchema}: it offers no attributes, and every attribute a caller
 * sends on a profile write is ignored.
 *
 * <p>Deliberately <strong>not</strong> part of {@code SportResponse}. {@code GET /api/sports}
 * returns the whole catalogue, and inlining every sport's full tree would inflate that fetch for
 * data only two screens need.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SportAttributeSchema {

    /**
     * The sport-local registry of record shapes an attribute or another definition's field may
     * reference by name via {@code definitionRef} (A12). Absent or empty on a document that uses no
     * {@code DEFINITION}/{@code DEFINITION_LIST} attributes.
     */
    private List<SportAttributeDefinitionType> definitions;

    private List<SportAttributeGroup> groups;
}
