package com.sportconnect.session.service;

import com.sportconnect.sport.api.dto.SportAttributeDefinition;
import com.sportconnect.sport.api.dto.SportAttributeGroup;
import com.sportconnect.sport.api.dto.SportAttributeSchema;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Flattens a {@code #ref}-expanded session attribute schema's nested group tree into a path-keyed
 * lookup of the leaves a write may currently target.
 *
 * <p><strong>A deliberate, trimmed clone</strong> of {@code sport-impl}'s package-private
 * {@code SchemaPaths} (A19). SESSION-23's filter is write-only, so unlike the sport side it needs
 * only the "available" view — there is no stored-value prune ({@code retainDefined}) here that
 * would need the "physically defined but switched off" view too. Kept path/cascade-identical to
 * the sport version so both collapse when the attribute framework is extracted to a shared home
 * (sport {@code A23} / common {@code C5}).
 *
 * <p>The {@code getSessionAttributeSchemaRaw} document this walks has every {@code #ref} already
 * inlined to a full {@link SportAttributeDefinition} by {@code sport-impl}, so this class never
 * sees a {@code #ref} node.
 */
final class SessionSchemaPaths {

    static final String SEPARATOR = "/";

    private SessionSchemaPaths() {
    }

    /**
     * Every leaf attribute a session write may currently target: its own {@code isAvailable} is not
     * {@code false} and no ancestor group's {@code isAvailable} is {@code false} (the cascade runs
     * full depth — a disabled group takes its whole subtree with it, and a descendant's own
     * {@code isAvailable == true} does not resurrect it). Keyed by the {@code /}-separated path.
     *
     * <p>A {@code null} schema, {@code null} child lists, and a group/attribute with a {@code null}
     * key are all treated as empty/skipped — the schema was validated on write, so this is
     * defensive only. Iteration order is declaration order, depth-first.
     */
    static Map<String, SportAttributeDefinition> availableByPath(SportAttributeSchema schema) {
        Map<String, SportAttributeDefinition> byPath = new LinkedHashMap<>();
        if (schema == null) {
            return byPath;
        }
        for (SportAttributeGroup group : nullSafe(schema.getGroups())) {
            collect(group, "", true, byPath);
        }
        return byPath;
    }

    private static void collect(SportAttributeGroup group, String parentPath, boolean ancestorsLive,
                                Map<String, SportAttributeDefinition> out) {
        if (group == null || group.getKey() == null) {
            return;
        }
        String groupPath = parentPath.isEmpty() ? group.getKey() : parentPath + SEPARATOR + group.getKey();
        boolean groupLive = ancestorsLive && !Boolean.FALSE.equals(group.getIsAvailable());

        for (SportAttributeDefinition attribute : nullSafe(group.getAttributes())) {
            if (attribute == null || attribute.getKey() == null) {
                continue;
            }
            if (groupLive && !Boolean.FALSE.equals(attribute.getIsAvailable())) {
                out.put(groupPath + SEPARATOR + attribute.getKey(), attribute);
            }
        }
        for (SportAttributeGroup child : nullSafe(group.getGroups())) {
            collect(child, groupPath, groupLive, out);
        }
    }

    private static <T> List<T> nullSafe(List<T> list) {
        return list == null ? List.of() : list;
    }
}
