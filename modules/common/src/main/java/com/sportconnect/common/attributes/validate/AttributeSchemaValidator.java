package com.sportconnect.common.attributes.validate;

import com.sportconnect.common.attributes.AttributeDefinitionType;
import com.sportconnect.common.attributes.AttributeGroup;
import com.sportconnect.common.attributes.AttributeSchema;
import com.sportconnect.common.attributes.node.AttributeNode;
import com.sportconnect.common.exception.BadRequestException;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Validates an admin-supplied attribute schema document before it is stored — the strict half of
 * the framework's deliberately asymmetric validation (admin writes rejected loudly; value writes
 * filtered silently by C7). Lifted from sport {@code SportAttributeSchemaValidator} (A9/A12/A19).
 *
 * <p><strong>All-or-nothing.</strong> The document is checked in full and the first violation
 * throws {@link BadRequestException}, so a bad paste never half-applies.
 *
 * <p>This is the <strong>single-schema</strong> validator: a {@code #ref}
 * ({@link com.sportconnect.common.attributes.node.RefAttribute}) anywhere in the tree is rejected.
 * A {@code (base, derived)} pair is C9's {@code DerivedSchemaValidator}, which reuses this walk for
 * the derived schema's own nodes.
 *
 * <p>Spring-free by design (extraction plan D2) — a {@code public static} entry point, no injected
 * {@code ObjectMapper} (the size check uses the framework's own
 * {@link com.sportconnect.common.attributes.json.AttributeJson#mapper()}). A consumer that wants a
 * bean wraps this in its own {@code @Component} façade.
 *
 * <p><strong>C11 presentation hints.</strong> {@code layout} / {@code hidden} / {@code fieldLayouts}
 * are otherwise carried raw, but two rules are enforced here (and, since the field walk is shared,
 * in the derived-schema validator too): a {@code layout} object present must carry a non-blank
 * {@code id} ({@link LeafChecks#validateLayout}, on nodes / fields / groups), and a definition field
 * may not be {@code hidden} <em>and</em> {@code isRequired} at once. Values are never gated — an
 * unknown {@code layout.id} or {@code fieldLayouts} key passes.
 */
public final class AttributeSchemaValidator {

    private AttributeSchemaValidator() {
    }

    /**
     * Validates the document in full, throwing on the first violation.
     *
     * <p>Check order affects error quality only, not correctness: {@code defaultLocale} first (every
     * label check needs it); the {@code definitions} registry before the tree (so a
     * {@code definitionRef} resolves against a complete map); the size rule last (so an oversized
     * malformed document reports what is actually wrong, not merely that it is too big).
     *
     * @param schema the document; {@code null} is valid and means "offers no attributes"
     * @throws BadRequestException on any violation, naming the offending node
     */
    public static void validate(AttributeSchema schema) {
        if (schema == null) {
            return;
        }

        LeafChecks.validateDefaultLocale(schema.getDefaultLocale());
        String defaultLocale = schema.getDefaultLocale();

        Map<String, AttributeDefinitionType> definitions =
                DefinitionRegistryValidator.validate(schema.getDefinitions(), defaultLocale);

        Set<String> rootKeys = new HashSet<>();
        for (AttributeGroup group : LeafChecks.nullSafe(schema.getGroups())) {
            validateGroup(group, rootKeys, definitions, defaultLocale);
        }

        LeafChecks.validateSize(schema, "Attribute schema");
    }

    /**
     * Validates one group node and everything below it (v3/A19 nested groups + sibling-scoped keys).
     *
     * <p>{@code siblingKeys} is this group's <em>parent's</em> shared key namespace — this method
     * adds its own key to it and rejects a collision with a sibling sub-group or attribute, then
     * builds a fresh namespace for its own children (sub-groups and attributes together) and
     * recurses.
     */
    private static void validateGroup(AttributeGroup group, Set<String> siblingKeys,
                                      Map<String, AttributeDefinitionType> definitions, String defaultLocale) {
        LeafChecks.validateKey(group.getKey(), "Group key");
        if (!siblingKeys.add(group.getKey())) {
            throw new BadRequestException("Duplicate node key among siblings: " + group.getKey());
        }
        LeafChecks.validateLabel(group.getLabel(), defaultLocale, "Group " + group.getKey());
        LeafChecks.validateLayout(group.getLayout(), "Group " + group.getKey());

        Set<String> childKeys = new HashSet<>();
        for (AttributeNode attribute : LeafChecks.nullSafe(group.getAttributes())) {
            LeafChecks.validateKey(attribute.getKey(), "Attribute key");
            if (!childKeys.add(attribute.getKey())) {
                throw new BadRequestException("Duplicate node key among siblings: " + attribute.getKey());
            }
            NodeValidators.validateOwnNode(attribute, definitions, defaultLocale);
        }
        for (AttributeGroup child : LeafChecks.nullSafe(group.getGroups())) {
            validateGroup(child, childKeys, definitions, defaultLocale);
        }
    }
}
