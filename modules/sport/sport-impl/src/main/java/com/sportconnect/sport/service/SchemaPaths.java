package com.sportconnect.sport.service;

import com.sportconnect.sport.api.dto.SportAttributeDefinition;
import com.sportconnect.sport.api.dto.SportAttributeGroup;
import com.sportconnect.sport.api.dto.SportAttributeSchema;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Flattens a v3 attribute schema's nested group tree (A19) into path-keyed lookup maps — the one
 * place the {@code /}-separated node path ({@code gear/rackets/tension}) is constructed.
 *
 * <p>{@code UserSportProfile.attributes} is keyed by these paths, so {@link ProfileAttributeFilter}
 * resolves each stored or submitted entry against one of these maps. A17's {@code #ref} node
 * references will resolve the same way.
 *
 * <p>Both walks are depth-first in declaration order and apply the {@code isAvailable} cascade at
 * <strong>full depth</strong>: a group with {@code isAvailable == false} takes its whole subtree
 * with it, and a descendant's own {@code isAvailable == true} does not resurrect it (parent wins).
 * A {@code null} schema and {@code null} child lists are treated as empty. A group or attribute with
 * a {@code null} {@code key} is skipped along with everything below it — the validator rejects that
 * document on write, so this is defensive only.
 */
final class SchemaPaths {

    static final String SEPARATOR = "/";

    private SchemaPaths() {
    }

    /**
     * A schema-declared leaf attribute plus whether it and every one of its ancestor groups are
     * still {@code isAvailable}.
     */
    record DefinedAttribute(SportAttributeDefinition definition, boolean live) {
    }

    /**
     * Every leaf attribute the schema declares, keyed by full path, <strong>regardless of
     * {@code isAvailable}</strong> — the "does a definition physically exist" view A10's stored-value
     * prune needs. {@link DefinedAttribute#live()} carries whether the attribute and all its ancestor
     * groups are available, which is what tells the prune whether to re-validate a stored value or
     * keep it frozen.
     */
    static Map<String, DefinedAttribute> definedByPath(SportAttributeSchema schema) {
        Map<String, DefinedAttribute> byPath = new LinkedHashMap<>();
        if (schema == null) {
            return byPath;
        }
        for (SportAttributeGroup group : nullSafe(schema.getGroups())) {
            collect(group, "", true, byPath);
        }
        return byPath;
    }

    /**
     * Only the leaf attributes a profile write may currently target: every ancestor group and the
     * attribute itself have {@code isAvailable != false}. The available subset of
     * {@link #definedByPath}.
     */
    static Map<String, SportAttributeDefinition> availableByPath(SportAttributeSchema schema) {
        Map<String, SportAttributeDefinition> byPath = new LinkedHashMap<>();
        for (Map.Entry<String, DefinedAttribute> entry : definedByPath(schema).entrySet()) {
            if (entry.getValue().live()) {
                byPath.put(entry.getKey(), entry.getValue().definition());
            }
        }
        return byPath;
    }

    private static void collect(SportAttributeGroup group, String parentPath, boolean ancestorsLive,
                                Map<String, DefinedAttribute> out) {
        if (group == null || group.getKey() == null) {
            return;
        }
        String groupPath = parentPath.isEmpty() ? group.getKey() : parentPath + SEPARATOR + group.getKey();
        boolean groupLive = ancestorsLive && !Boolean.FALSE.equals(group.getIsAvailable());

        for (SportAttributeDefinition attribute : nullSafe(group.getAttributes())) {
            if (attribute == null || attribute.getKey() == null) {
                continue;
            }
            boolean live = groupLive && !Boolean.FALSE.equals(attribute.getIsAvailable());
            out.put(groupPath + SEPARATOR + attribute.getKey(), new DefinedAttribute(attribute, live));
        }
        for (SportAttributeGroup child : nullSafe(group.getGroups())) {
            collect(child, groupPath, groupLive, out);
        }
    }

    private static <T> List<T> nullSafe(List<T> list) {
        return list == null ? List.of() : list;
    }
}
