package com.sportconnect.sport.service;

import com.sportconnect.sport.api.dto.SessionAttributeNode;
import com.sportconnect.sport.api.dto.SportAttributeDefinition;

/**
 * Small conversions the session-schema validator, expander and resolver (A17) all need, kept in one
 * place so they agree on how a {@link SessionAttributeNode} maps onto the plain
 * {@link SportAttributeDefinition} shape the rest of the schema machinery speaks.
 */
final class SessionAttributeNodes {

    private SessionAttributeNodes() {
    }

    /**
     * The key a {@code #ref} node occupies in the session tree: the last {@code /}-separated segment
     * of the referenced profile path ({@code gear/rackets/tension} → {@code tension}). The segment is
     * itself a profile attribute key, so it already satisfies {@code SchemaChecks.KEY_PATTERN}. The
     * full path is retained separately as the resolved node's {@code prefillKey}.
     */
    static String refKey(String refPath) {
        int lastSlash = refPath.lastIndexOf(SchemaPaths.SEPARATOR);
        return lastSlash < 0 ? refPath : refPath.substring(lastSlash + 1);
    }

    /**
     * An <em>own</em> ({@code #ref}-less) session node as the {@link SportAttributeDefinition} the
     * shared {@link SchemaChecks#validateAttribute} and the label resolver operate on. An own node
     * has no {@code searchScope} (that is a profile / A14 entity-linking concern), so the resulting
     * definition always leaves it {@code null}.
     */
    static SportAttributeDefinition ownNodeAsDefinition(SessionAttributeNode node) {
        return SportAttributeDefinition.builder()
                .key(node.getKey())
                .label(node.getLabel())
                .type(node.getType())
                .options(node.getOptions())
                .isAvailable(node.getIsAvailable())
                .defaultValue(node.getDefaultValue())
                .min(node.getMin())
                .max(node.getMax())
                .definitionRef(node.getDefinitionRef())
                .build();
    }
}
