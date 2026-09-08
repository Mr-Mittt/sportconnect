package com.sportconnect.common.attributes.pair;

import com.sportconnect.common.attributes.AttributeDefinitionType;
import com.sportconnect.common.attributes.AttributeGroup;
import com.sportconnect.common.attributes.AttributeNodes;
import com.sportconnect.common.attributes.AttributeSchema;
import com.sportconnect.common.attributes.node.AttributeNode;
import com.sportconnect.common.attributes.node.RefAttribute;
import com.sportconnect.common.attributes.path.AttributePaths;
import com.sportconnect.common.attributes.validate.DefinitionRegistryValidator;
import com.sportconnect.common.attributes.validate.LeafChecks;
import com.sportconnect.common.attributes.validate.NodeValidators;
import com.sportconnect.common.exception.BadRequestException;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Validates an admin-supplied <em>derived</em> attribute schema against the <em>base</em> schema it
 * draws {@code #ref} nodes from — the pair counterpart of the single-schema
 * {@link com.sportconnect.common.attributes.validate.AttributeSchemaValidator} (C6). Verbatim port
 * of sport {@code SessionAttributeSchemaValidator} (A17), plus the {@code #ref} semantics change of
 * extraction plan D9.
 *
 * <p><strong>All-or-nothing and strict.</strong> The whole document is checked and the first
 * violation throws {@link BadRequestException}. This is the strict half of the pair contract —
 * {@link DerivedSchemaExpander} is the lenient half (a dangling {@code #ref} is rejected here, but
 * silently dropped there).
 *
 * <p>Every <em>own</em> (non-{@code #ref}) node obeys exactly the single-schema rules a base node
 * does — {@link NodeValidators#validateOwnNode} and {@link DefinitionRegistryValidator} are reused
 * unchanged. What is specific here is the {@link RefAttribute} contract (D9):
 *
 * <ul>
 *   <li>{@code key} <strong>required</strong> — its own explicit, sibling-unique key (no longer the
 *       last {@code /}-segment of the ref path). Shares the one sibling namespace with sub-groups
 *       and own nodes.</li>
 *   <li>{@code cardinality} <strong>required</strong> — {@code SINGLE} or {@code LIST}. (An
 *       unparseable value is rejected one layer earlier, at JSON binding.)</li>
 *   <li>{@code #ref} <strong>required</strong>, non-blank, globally unique across the derived
 *       schema, and must resolve to a live + available node in the base schema
 *       ({@link AttributePaths#availableByPath}). Dangling → strict reject.</li>
 *   <li>{@code label} optional — an override that need not cover {@code defaultLocale}; every locale
 *       key it does carry must be well-formed. Every other field is structurally absent from
 *       {@link RefAttribute} and so cannot be set.</li>
 * </ul>
 *
 * <p>Spring-free (extraction plan D2): a {@code public static} entry point, no injected
 * {@code ObjectMapper}.
 */
public final class DerivedSchemaValidator {

    private DerivedSchemaValidator() {
    }

    /**
     * Validates the derived document in full, throwing on the first violation.
     *
     * <p>Check order affects error quality only: {@code defaultLocale} first; the derived-local
     * {@code definitions} registry next (so a {@code definitionRef} resolves against a complete
     * map); then the group tree, resolving every {@code #ref} against the base schema's live view;
     * the base/derived definition-name collision check and the size cap last.
     *
     * @param base    the base schema every {@code #ref} resolves against; {@code null} means any
     *                {@code #ref} is a dangling reference and the document is rejected
     * @param derived the document to validate; {@code null} is valid and means "offers no
     *                attributes"
     * @throws BadRequestException on any violation, naming the offending node
     */
    public static void validate(AttributeSchema base, AttributeSchema derived) {
        if (derived == null) {
            return;
        }

        LeafChecks.validateDefaultLocale(derived.getDefaultLocale());
        String defaultLocale = derived.getDefaultLocale();

        Map<String, AttributeDefinitionType> derivedDefinitions =
                DefinitionRegistryValidator.validate(derived.getDefinitions(), defaultLocale);

        // The live + available view of the base schema — the only thing a #ref may resolve to.
        Map<String, AttributeNode> baseAvailable = AttributePaths.availableByPath(base);

        Set<String> refPaths = new HashSet<>();                 // globally unique across the derived schema
        Set<String> referencedBaseDefinitionNames = new HashSet<>();

        Set<String> rootKeys = new HashSet<>();
        for (AttributeGroup group : LeafChecks.nullSafe(derived.getGroups())) {
            validateGroup(group, rootKeys, derivedDefinitions, baseAvailable,
                    refPaths, referencedBaseDefinitionNames, defaultLocale);
        }

        for (String name : referencedBaseDefinitionNames) {
            if (derivedDefinitions.containsKey(name)) {
                throw new BadRequestException("Derived-local definition name collides with a definition "
                        + "a #ref pulls in from the base schema: " + name);
            }
        }

        LeafChecks.validateSize(derived, "Derived attribute schema");
    }

    /**
     * Validates one group node and everything below it: its own key against the parent's shared
     * sibling namespace, then a fresh namespace for its children (sub-groups, own nodes and
     * {@code #ref} keys all share it), then recursion.
     */
    private static void validateGroup(AttributeGroup group, Set<String> siblingKeys,
                                      Map<String, AttributeDefinitionType> derivedDefinitions,
                                      Map<String, AttributeNode> baseAvailable,
                                      Set<String> refPaths, Set<String> referencedBaseDefinitionNames,
                                      String defaultLocale) {
        LeafChecks.validateKey(group.getKey(), "Group key");
        if (!siblingKeys.add(group.getKey())) {
            throw new BadRequestException("Duplicate node key among siblings: " + group.getKey());
        }
        LeafChecks.validateLabel(group.getLabel(), defaultLocale, "Group " + group.getKey());

        Set<String> childKeys = new HashSet<>();
        for (AttributeNode node : LeafChecks.nullSafe(group.getAttributes())) {
            if (node instanceof RefAttribute ref) {
                validateRefNode(ref, childKeys, baseAvailable, refPaths, referencedBaseDefinitionNames);
            } else {
                LeafChecks.validateKey(node.getKey(), "Attribute key");
                if (!childKeys.add(node.getKey())) {
                    throw new BadRequestException("Duplicate node key among siblings: " + node.getKey());
                }
                NodeValidators.validateOwnNode(node, derivedDefinitions, defaultLocale);
            }
        }
        for (AttributeGroup child : LeafChecks.nullSafe(group.getGroups())) {
            validateGroup(child, childKeys, derivedDefinitions, baseAvailable,
                    refPaths, referencedBaseDefinitionNames, defaultLocale);
        }
    }

    /**
     * The {@code #ref} contract (D9). {@code key} and {@code cardinality} are required; {@code #ref}
     * is required, non-blank, globally unique, and resolves against the base schema's live view;
     * {@code label} is an optional, need-not-cover-{@code defaultLocale} override. If the base
     * target is a record node, its {@code definitionRef} is remembered so the caller can reject a
     * later collision with a derived-local definition of the same name.
     */
    private static void validateRefNode(RefAttribute node, Set<String> siblingKeys,
                                        Map<String, AttributeNode> baseAvailable,
                                        Set<String> refPaths, Set<String> referencedBaseDefinitionNames) {
        LeafChecks.validateKey(node.getKey(), "#ref key");
        if (!siblingKeys.add(node.getKey())) {
            throw new BadRequestException("Duplicate node key among siblings: " + node.getKey());
        }

        if (node.getCardinality() == null) {
            throw new BadRequestException("#ref node " + node.getKey() + " must declare a cardinality (SINGLE or LIST)");
        }

        String path = node.getRef();
        if (path == null || path.isBlank()) {
            throw new BadRequestException("#ref node " + node.getKey() + " must declare a non-blank base attribute path");
        }
        if (!refPaths.add(path)) {
            throw new BadRequestException("Duplicate #ref to the same base attribute path: " + path);
        }

        AttributeNode target = baseAvailable.get(path);
        if (target == null) {
            throw new BadRequestException("#ref points at a base attribute path that does not exist "
                    + "or is not available: " + path);
        }

        // An optional label override need not cover defaultLocale — an absent one keeps the inherited
        // label — but any locale key it does carry must be well-formed.
        if (node.getLabel() != null) {
            for (String locale : node.getLabel().keySet()) {
                if (locale == null || !LeafChecks.LOCALE_PATTERN.matcher(locale).matches()) {
                    throw new BadRequestException("#ref " + path + " has a malformed label locale: " + locale);
                }
            }
        }

        String definitionRef = AttributeNodes.definitionRefOf(target);
        if (definitionRef != null) {
            referencedBaseDefinitionNames.add(definitionRef);
        }
    }
}
