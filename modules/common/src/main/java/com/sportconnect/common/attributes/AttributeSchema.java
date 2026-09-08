package com.sportconnect.common.attributes;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * A full attribute-definition document. One type serves both roles (extraction plan D4):
 *
 * <ul>
 *   <li>as a <strong>single / base</strong> schema — a plain typed tree, no {@code #ref} nodes;</li>
 *   <li>as a <strong>derived</strong> schema — its tree may contain
 *       {@link com.sportconnect.common.attributes.node.RefAttribute} nodes pointing at paths in a
 *       base schema. The "derived-ness" lives in the validator/expander/resolver API (C9), not in
 *       this DTO.</li>
 * </ul>
 *
 * <p>A {@code null} document means "offers no attributes".
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AttributeSchema {

    /**
     * The schema-local registry of record shapes a node (or another definition's field) may
     * reference by name via {@code definitionRef}. Absent or empty on a document that uses no
     * {@code DEFINITION}/{@code DEFINITION_LIST}.
     */
    private List<AttributeDefinitionType> definitions;

    private List<AttributeGroup> groups;

    /**
     * BCP 47 locale code (e.g. {@code "en"}) — the fallback every labeled node's {@code label} map
     * must carry an entry for, and what the resolver (C8) falls back to.
     */
    private String defaultLocale;
}
