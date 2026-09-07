package com.sportconnect.sport.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.sport.api.dto.SportAttributeDefinition;
import com.sportconnect.sport.api.dto.SportAttributeDefinitionType;
import com.sportconnect.sport.api.dto.SportAttributeGroup;
import com.sportconnect.sport.api.dto.SportAttributeSchema;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Validates an admin-supplied <em>profile</em> attribute schema document before it is stored (A9;
 * extended by v2/A12 for the {@code definitions} registry and {@code DEFINITION}/
 * {@code DEFINITION_LIST} type kinds, by v3/A19 for nested groups and sibling-scoped keys).
 *
 * <p><strong>All-or-nothing.</strong> The document is checked in full and the first violation
 * throws, so a bad paste never half-applies and leaves a sport with a partly-rewritten schema.
 *
 * <p>This is the strict half of A9's deliberately asymmetric validation: admin writes here are
 * rejected loudly, whereas user profile writes are filtered silently by
 * {@link ProfileAttributeFilter}. That asymmetry is intentional and was an explicit product
 * decision — an admin pasting a malformed tree needs to know about it, whereas a user's stale
 * client key is noise not worth failing a profile save over.
 *
 * <p>The per-node and per-{@code definitions} rules live in {@link SchemaChecks}, shared verbatim
 * with {@link SessionAttributeSchemaValidator} (A17). What stays here is the profile schema's own
 * shape: the recursive group-tree walk and the v3 sibling-scoped key namespace.
 */
@Component
@RequiredArgsConstructor
class SportAttributeSchemaValidator {

    private final ObjectMapper objectMapper;

    /**
     * Validates the document in full, throwing on the first violation found.
     *
     * <p>Check order affects error quality only, not correctness: {@code defaultLocale} is checked
     * first since every label check below needs it (A13); the {@code definitions} registry is then
     * validated before the group/attribute tree, so a {@code definitionRef} can be resolved against
     * a fully-built map; the size rule runs last so an oversized malformed document reports what is
     * actually wrong with it rather than merely that it is too big.
     *
     * @param schema the document to validate; {@code null} is valid and means "offers no attributes"
     * @throws BadRequestException on any violation, naming the offending node
     */
    void validate(SportAttributeSchema schema) {
        if (schema == null) {
            return;
        }

        // Fails fast, before any node in the tree is walked: every label check below needs a
        // resolved defaultLocale to check against (A13).
        SchemaChecks.validateDefaultLocale(schema.getDefaultLocale());
        String defaultLocale = schema.getDefaultLocale();

        Map<String, SportAttributeDefinitionType> definitionsByName =
                SchemaChecks.validateDefinitions(schema.getDefinitions(), defaultLocale);

        // v3/A19: node keys are unique among SIBLINGS only, not across the whole sport, and within
        // one parent the child sub-group keys and child attribute keys share a single namespace
        // (so a node's full path — gear/rackets/tension — is unambiguous). The tree is walked
        // recursively; each parent owns its own children's uniqueness. The root's siblings are the
        // top-level group keys.
        Set<String> rootKeys = new HashSet<>();
        for (SportAttributeGroup group : SchemaChecks.nullSafe(schema.getGroups())) {
            validateGroupNode(group, rootKeys, definitionsByName, defaultLocale);
        }

        SchemaChecks.validateSize(schema, objectMapper, "Attribute schema");
    }

    /**
     * Validates one group node and everything below it (v3/A19).
     *
     * <p>{@code siblingKeys} is the shared key namespace of this group's <em>parent</em> — this
     * method adds its own key to it and rejects a collision with a sibling sub-group or attribute.
     * It then builds a fresh namespace for its own children (sub-groups and attributes together) and
     * recurses into each sub-group.
     */
    private void validateGroupNode(SportAttributeGroup group, Set<String> siblingKeys,
                                    Map<String, SportAttributeDefinitionType> definitionsByName,
                                    String defaultLocale) {
        SchemaChecks.validateKey(group.getKey(), "Group key");
        if (!siblingKeys.add(group.getKey())) {
            throw new BadRequestException("Duplicate node key among siblings: " + group.getKey());
        }
        SchemaChecks.validateLabel(group.getLabel(), defaultLocale, "Group " + group.getKey());

        Set<String> childKeys = new HashSet<>();
        for (SportAttributeDefinition attribute : SchemaChecks.nullSafe(group.getAttributes())) {
            SchemaChecks.validateKey(attribute.getKey(), "Attribute key");
            if (!childKeys.add(attribute.getKey())) {
                throw new BadRequestException("Duplicate node key among siblings: " + attribute.getKey());
            }
            SchemaChecks.validateAttribute(attribute, definitionsByName, defaultLocale);
        }
        for (SportAttributeGroup child : SchemaChecks.nullSafe(group.getGroups())) {
            validateGroupNode(child, childKeys, definitionsByName, defaultLocale);
        }
    }
}
