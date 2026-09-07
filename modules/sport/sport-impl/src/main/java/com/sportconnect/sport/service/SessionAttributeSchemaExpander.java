package com.sportconnect.sport.service;

import com.sportconnect.sport.api.dto.SessionAttributeGroup;
import com.sportconnect.sport.api.dto.SessionAttributeNode;
import com.sportconnect.sport.api.dto.SessionAttributeSchema;
import com.sportconnect.sport.api.dto.SportAttributeDefinition;
import com.sportconnect.sport.api.dto.SportAttributeDefinitionType;
import com.sportconnect.sport.api.dto.SportAttributeField;
import com.sportconnect.sport.api.dto.SportAttributeGroup;
import com.sportconnect.sport.api.dto.SportAttributeSchema;
import com.sportconnect.sport.api.dto.SportAttributeType;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Turns a stored {@link SessionAttributeSchema} into a plain {@link SportAttributeSchema} with every
 * {@code #ref} node expanded in place (A17) — the shape SESSION-23's write-time value filter (a
 * near-clone of {@link ProfileAttributeFilter}) consumes, and the input the member-facing resolver
 * ({@link SessionAttributeSchemaResolver}) locale-resolves.
 *
 * <p>Per {@code #ref} node: look the referenced path up in the profile schema's live+available view
 * ({@link SchemaPaths#availableByPath}); <strong>drop the node</strong> if it no longer resolves
 * (lenient — the profile schema may have retired the attribute after this session schema was
 * stored). Otherwise emit a {@link SportAttributeDefinition} copied from the profile target, keyed
 * by the last segment of the {@code #ref} path, in the same session group; pull the profile
 * definition it references — and that definition's whole reachable closure — into the merged
 * {@code definitions} registry. Own nodes are carried through unchanged, except an own
 * {@code DEFINITION}/{@code DEFINITION_LIST} node whose {@code definitionRef} is absent from the
 * session-local registry is likewise dropped.
 *
 * <p>The returned {@link ExpandedSessionSchema#prefillKeyByPath()} maps each expanded {@code #ref}
 * node's full session-tree path to its source profile path, so the resolver can stamp
 * {@code prefillable}/{@code prefillKey} onto the matching resolved node.
 */
@Component
class SessionAttributeSchemaExpander {

    /**
     * @param schema           a {@link SportAttributeSchema} with no {@code #ref} nodes; every leaf
     *                         a plain {@link SportAttributeDefinition}; {@code definitions} the union
     *                         of the session-local registry and every profile definition a
     *                         {@code #ref} reached
     * @param prefillKeyByPath session-tree path → source profile path, for every {@code #ref}-derived
     *                         node that survived expansion
     */
    record ExpandedSessionSchema(SportAttributeSchema schema, Map<String, String> prefillKeyByPath) {
    }

    /**
     * @param sessionSchema the stored session schema; {@code null} yields {@code null}
     * @param profileSchema the sport's profile schema, or {@code null} (then every {@code #ref} is
     *                      dropped)
     */
    ExpandedSessionSchema expand(SessionAttributeSchema sessionSchema, SportAttributeSchema profileSchema) {
        if (sessionSchema == null) {
            return null;
        }

        Map<String, SportAttributeDefinition> profileAvailable = SchemaPaths.availableByPath(profileSchema);
        Map<String, SportAttributeDefinitionType> profileDefinitions = definitionsByName(profileSchema);

        Map<String, SportAttributeDefinitionType> merged = new LinkedHashMap<>();
        for (SportAttributeDefinitionType definition : nullSafe(sessionSchema.getDefinitions())) {
            merged.put(definition.getName(), definition);
        }

        Map<String, String> prefillKeyByPath = new LinkedHashMap<>();
        List<SportAttributeGroup> groups = new ArrayList<>();
        for (SessionAttributeGroup group : nullSafe(sessionSchema.getGroups())) {
            groups.add(expandGroup(group, "", profileAvailable, profileDefinitions, merged, prefillKeyByPath));
        }

        SportAttributeSchema expanded = SportAttributeSchema.builder()
                .defaultLocale(sessionSchema.getDefaultLocale())
                .definitions(new ArrayList<>(merged.values()))
                .groups(groups)
                .build();
        return new ExpandedSessionSchema(expanded, prefillKeyByPath);
    }

    private SportAttributeGroup expandGroup(
            SessionAttributeGroup group, String parentPath,
            Map<String, SportAttributeDefinition> profileAvailable,
            Map<String, SportAttributeDefinitionType> profileDefinitions,
            Map<String, SportAttributeDefinitionType> merged,
            Map<String, String> prefillKeyByPath) {

        String groupPath = parentPath.isEmpty()
                ? group.getKey()
                : parentPath + SchemaPaths.SEPARATOR + group.getKey();

        List<SportAttributeDefinition> attributes = new ArrayList<>();
        for (SessionAttributeNode node : nullSafe(group.getAttributes())) {
            if (node.getRef() != null) {
                SportAttributeDefinition target = profileAvailable.get(node.getRef());
                if (target == null) {
                    continue; // lenient: #ref whose profile target is gone / unavailable
                }
                String key = SessionAttributeNodes.refKey(node.getRef());
                attributes.add(SportAttributeDefinition.builder()
                        .key(key)
                        .label(node.getLabel() != null ? node.getLabel() : target.getLabel())
                        .type(target.getType())
                        .options(target.getOptions())
                        .isAvailable(target.getIsAvailable())
                        .defaultValue(target.getDefaultValue())
                        .min(target.getMin())
                        .max(target.getMax())
                        .definitionRef(target.getDefinitionRef())
                        .searchScope(target.getSearchScope())
                        .build());
                prefillKeyByPath.put(groupPath + SchemaPaths.SEPARATOR + key, node.getRef());
                pullDefinitionClosure(target.getDefinitionRef(), profileDefinitions, merged);
            } else {
                boolean recordType = node.getType() == SportAttributeType.DEFINITION
                        || node.getType() == SportAttributeType.DEFINITION_LIST;
                if (recordType && !merged.containsKey(node.getDefinitionRef())) {
                    continue; // lenient: own record node whose session-local definition is gone
                }
                attributes.add(SessionAttributeNodes.ownNodeAsDefinition(node));
            }
        }

        List<SportAttributeGroup> subGroups = new ArrayList<>();
        for (SessionAttributeGroup child : nullSafe(group.getGroups())) {
            subGroups.add(expandGroup(child, groupPath, profileAvailable, profileDefinitions, merged, prefillKeyByPath));
        }

        return SportAttributeGroup.builder()
                .key(group.getKey())
                .label(group.getLabel())
                .isAvailable(group.getIsAvailable())
                .attributes(attributes)
                .groups(subGroups)
                .build();
    }

    /**
     * Pulls {@code name} and every definition reachable from its {@code DEFINITION} fields into
     * {@code merged}. A name already present (a session-local definition, or an earlier pull) wins
     * and stops the walk — a post-hoc profile/session name clash the {@code PUT} validator would
     * have rejected therefore resolves to the session-local definition, not the profile one.
     */
    private void pullDefinitionClosure(String name, Map<String, SportAttributeDefinitionType> profileDefinitions,
                                       Map<String, SportAttributeDefinitionType> merged) {
        if (name == null || merged.containsKey(name)) {
            return;
        }
        SportAttributeDefinitionType definition = profileDefinitions.get(name);
        if (definition == null) {
            return;
        }
        merged.put(name, definition);
        for (SportAttributeField field : nullSafe(definition.getFields())) {
            if (field.getType() == SportAttributeType.DEFINITION) {
                pullDefinitionClosure(field.getDefinitionRef(), profileDefinitions, merged);
            }
        }
    }

    private Map<String, SportAttributeDefinitionType> definitionsByName(SportAttributeSchema schema) {
        Map<String, SportAttributeDefinitionType> byName = new LinkedHashMap<>();
        if (schema == null) {
            return byName;
        }
        for (SportAttributeDefinitionType definition : nullSafe(schema.getDefinitions())) {
            if (definition != null && definition.getName() != null) {
                byName.putIfAbsent(definition.getName(), definition);
            }
        }
        return byName;
    }

    private static <T> List<T> nullSafe(List<T> list) {
        return list == null ? List.of() : list;
    }
}
