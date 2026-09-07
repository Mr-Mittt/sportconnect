package com.sportconnect.sport.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.sport.api.dto.SessionAttributeGroup;
import com.sportconnect.sport.api.dto.SessionAttributeNode;
import com.sportconnect.sport.api.dto.SessionAttributeSchema;
import com.sportconnect.sport.api.dto.SportAttributeDefinition;
import com.sportconnect.sport.api.dto.SportAttributeDefinitionType;
import com.sportconnect.sport.api.dto.SportAttributeSchema;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Validates an admin-supplied <em>session</em> attribute schema document before it is stored (A17).
 * The session-schema twin of {@link SportAttributeSchemaValidator}, strict and all-or-nothing for
 * the same reason: an admin pasting a malformed tree needs to know at {@code PUT} time.
 *
 * <p>Every per-node and per-{@code definitions} rule is delegated to {@link SchemaChecks}, so an
 * <em>own</em> node obeys exactly the rules a profile attribute does. What is specific here:
 *
 * <ul>
 *   <li><strong>Two node kinds.</strong> A {@link SessionAttributeNode} with {@code #ref} set is a
 *       pointer at a profile attribute — only {@code label} may accompany it, and the referenced
 *       path must resolve to a <em>live, available</em> node in the sport's profile schema (via
 *       {@link SchemaPaths#availableByPath}). Its key in the session tree is the last segment of the
 *       {@code #ref} path.</li>
 *   <li><strong>Sibling key namespace</strong> (v3): within one group, sub-group keys, own-node
 *       keys and {@code #ref} last-path-segments share one namespace.</li>
 *   <li><strong>Each {@code #ref} path is globally unique</strong> across the whole session schema —
 *       no pointing at the same profile attribute twice.</li>
 *   <li><strong>Session-local {@code definitions}</strong> are validated by the same three-pass rule
 *       as the profile registry, and a session-local definition name must not collide with a
 *       definition name a {@code #ref} pulls in from the profile registry (the two are merged in the
 *       {@code #ref}-expanded doc SESSION-23 consumes).</li>
 * </ul>
 */
@Component
@RequiredArgsConstructor
class SessionAttributeSchemaValidator {

    private final ObjectMapper objectMapper;

    /**
     * @param sessionSchema the document to validate; {@code null} is valid and means "this sport's
     *                      sessions offer no attributes"
     * @param profileSchema the sport's <em>profile</em> attribute schema, needed to resolve every
     *                      {@code #ref}; may be {@code null}, in which case any {@code #ref} is a
     *                      dangling reference and the document is rejected
     * @throws BadRequestException on any violation, naming the offending node
     */
    void validate(SessionAttributeSchema sessionSchema, SportAttributeSchema profileSchema) {
        if (sessionSchema == null) {
            return;
        }

        SchemaChecks.validateDefaultLocale(sessionSchema.getDefaultLocale());
        String defaultLocale = sessionSchema.getDefaultLocale();

        Map<String, SportAttributeDefinitionType> sessionDefinitions =
                SchemaChecks.validateDefinitions(sessionSchema.getDefinitions(), defaultLocale);

        // The live+available view of the profile schema — the only thing a #ref may resolve to
        // (A19's SchemaPaths, full-depth isAvailable cascade).
        Map<String, SportAttributeDefinition> profileAvailable = SchemaPaths.availableByPath(profileSchema);

        Set<String> refPaths = new HashSet<>();               // globally unique across the session schema
        Set<String> referencedProfileDefinitionNames = new HashSet<>();

        Set<String> rootKeys = new HashSet<>();
        for (SessionAttributeGroup group : SchemaChecks.nullSafe(sessionSchema.getGroups())) {
            validateGroupNode(group, rootKeys, sessionDefinitions, profileAvailable,
                    refPaths, referencedProfileDefinitionNames, defaultLocale);
        }

        for (String name : referencedProfileDefinitionNames) {
            if (sessionDefinitions.containsKey(name)) {
                throw new BadRequestException("Session-local definition name collides with a definition "
                        + "a #ref pulls in from the profile schema: " + name);
            }
        }

        SchemaChecks.validateSize(sessionSchema, objectMapper, "Session attribute schema");
    }

    private void validateGroupNode(SessionAttributeGroup group, Set<String> siblingKeys,
                                   Map<String, SportAttributeDefinitionType> sessionDefinitions,
                                   Map<String, SportAttributeDefinition> profileAvailable,
                                   Set<String> refPaths, Set<String> referencedProfileDefinitionNames,
                                   String defaultLocale) {
        SchemaChecks.validateKey(group.getKey(), "Group key");
        if (!siblingKeys.add(group.getKey())) {
            throw new BadRequestException("Duplicate node key among siblings: " + group.getKey());
        }
        SchemaChecks.validateLabel(group.getLabel(), defaultLocale, "Group " + group.getKey());

        Set<String> childKeys = new HashSet<>();
        for (SessionAttributeNode node : SchemaChecks.nullSafe(group.getAttributes())) {
            if (node.getRef() != null) {
                validateRefNode(node, childKeys, profileAvailable, refPaths, referencedProfileDefinitionNames);
            } else {
                validateOwnNode(node, childKeys, sessionDefinitions, defaultLocale);
            }
        }
        for (SessionAttributeGroup child : SchemaChecks.nullSafe(group.getGroups())) {
            validateGroupNode(child, childKeys, sessionDefinitions, profileAvailable,
                    refPaths, referencedProfileDefinitionNames, defaultLocale);
        }
    }

    private void validateRefNode(SessionAttributeNode node, Set<String> siblingKeys,
                                 Map<String, SportAttributeDefinition> profileAvailable,
                                 Set<String> refPaths, Set<String> referencedProfileDefinitionNames) {
        String path = node.getRef();
        if (path.isBlank()) {
            throw new BadRequestException("#ref must be a non-blank profile attribute path");
        }
        if (node.getKey() != null || node.getType() != null || node.getOptions() != null
                || node.getIsAvailable() != null || node.getDefaultValue() != null
                || node.getMin() != null || node.getMax() != null || node.getDefinitionRef() != null) {
            throw new BadRequestException("#ref node " + path + " must not declare any field other than label");
        }

        if (!refPaths.add(path)) {
            throw new BadRequestException("Duplicate #ref to the same profile attribute path: " + path);
        }

        SportAttributeDefinition target = profileAvailable.get(path);
        if (target == null) {
            throw new BadRequestException("#ref points at a profile attribute path that does not exist "
                    + "or is not available: " + path);
        }

        String key = SessionAttributeNodes.refKey(path);
        if (!siblingKeys.add(key)) {
            throw new BadRequestException("Duplicate node key among siblings: " + key
                    + " (from #ref " + path + ")");
        }

        // An optional label override need not cover defaultLocale — an absent one keeps the
        // inherited label — but any locale key it does carry must be well-formed.
        if (node.getLabel() != null) {
            for (String locale : node.getLabel().keySet()) {
                if (locale == null || !SchemaChecks.LOCALE_PATTERN.matcher(locale).matches()) {
                    throw new BadRequestException("#ref " + path + " has a malformed label locale: " + locale);
                }
            }
        }

        if (target.getDefinitionRef() != null) {
            referencedProfileDefinitionNames.add(target.getDefinitionRef());
        }
    }

    private void validateOwnNode(SessionAttributeNode node, Set<String> siblingKeys,
                                 Map<String, SportAttributeDefinitionType> sessionDefinitions,
                                 String defaultLocale) {
        SchemaChecks.validateKey(node.getKey(), "Attribute key");
        if (!siblingKeys.add(node.getKey())) {
            throw new BadRequestException("Duplicate node key among siblings: " + node.getKey());
        }
        SchemaChecks.validateAttribute(SessionAttributeNodes.ownNodeAsDefinition(node),
                sessionDefinitions, defaultLocale);
    }
}
