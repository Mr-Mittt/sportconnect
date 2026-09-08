package com.sportconnect.common.attributes.path;

import com.sportconnect.common.attributes.AttributeGroup;
import com.sportconnect.common.attributes.AttributeNodes;
import com.sportconnect.common.attributes.AttributeSchema;
import com.sportconnect.common.attributes.node.AttributeNode;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Flattens a schema's nested group tree into path-keyed lookup maps — the one place the
 * {@code /}-separated node path ({@code gear/rackets/tension}) is built. Verbatim port of sport
 * {@code SchemaPaths} (A19).
 *
 * <p>A stored value map is keyed by these paths, so {@code AttributeValueFilter} resolves each
 * entry against one of them. Both walks are depth-first in declaration order and apply the
 * {@code isAvailable} cascade at <strong>full depth</strong>: a group with
 * {@code isAvailable == false} takes its whole subtree with it, and a descendant's own
 * {@code isAvailable == true} does not resurrect it (parent wins). A {@code null} schema and
 * {@code null} child lists are empty; a node with a {@code null} key is skipped (the validator
 * rejects that on write — defensive only).
 */
public final class AttributePaths {

    public static final String SEPARATOR = "/";

    private AttributePaths() {
    }

    /**
     * A schema-declared leaf plus whether it and every one of its ancestor groups are still
     * {@code isAvailable}.
     */
    public record DefinedAttribute(AttributeNode node, boolean live) {
    }

    /**
     * Every leaf the schema declares, keyed by full path, <strong>regardless of
     * {@code isAvailable}</strong> — the "does a definition physically exist" view a stored-value
     * prune needs. {@link DefinedAttribute#live()} carries whether the leaf and all its ancestor
     * groups are available.
     */
    public static Map<String, DefinedAttribute> definedByPath(AttributeSchema schema) {
        Map<String, DefinedAttribute> byPath = new LinkedHashMap<>();
        if (schema == null) {
            return byPath;
        }
        for (AttributeGroup group : nullSafe(schema.getGroups())) {
            collect(group, "", true, byPath);
        }
        return byPath;
    }

    /**
     * Only the leaves a value write may currently target: every ancestor group and the leaf itself
     * have {@code isAvailable != false}. The available subset of {@link #definedByPath}.
     */
    public static Map<String, AttributeNode> availableByPath(AttributeSchema schema) {
        Map<String, AttributeNode> byPath = new LinkedHashMap<>();
        for (Map.Entry<String, DefinedAttribute> entry : definedByPath(schema).entrySet()) {
            if (entry.getValue().live()) {
                byPath.put(entry.getKey(), entry.getValue().node());
            }
        }
        return byPath;
    }

    private static void collect(AttributeGroup group, String parentPath, boolean ancestorsLive,
                                Map<String, DefinedAttribute> out) {
        if (group == null || group.getKey() == null) {
            return;
        }
        String groupPath = parentPath.isEmpty() ? group.getKey() : parentPath + SEPARATOR + group.getKey();
        boolean groupLive = ancestorsLive && !Boolean.FALSE.equals(group.getIsAvailable());

        for (AttributeNode node : nullSafe(group.getAttributes())) {
            if (node == null || node.getKey() == null) {
                continue;
            }
            boolean live = groupLive && !Boolean.FALSE.equals(AttributeNodes.isAvailable(node));
            out.put(groupPath + SEPARATOR + node.getKey(), new DefinedAttribute(node, live));
        }
        for (AttributeGroup child : nullSafe(group.getGroups())) {
            collect(child, groupPath, groupLive, out);
        }
    }

    private static <T> List<T> nullSafe(List<T> list) {
        return list == null ? List.of() : list;
    }
}
