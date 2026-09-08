package com.sportconnect.common.attributes;

import com.sportconnect.common.attributes.node.AttributeNode;
import com.sportconnect.common.attributes.node.BooleanAttribute;
import com.sportconnect.common.attributes.node.DefinitionAttribute;
import com.sportconnect.common.attributes.node.DefinitionListAttribute;
import com.sportconnect.common.attributes.node.EnumAttribute;
import com.sportconnect.common.attributes.node.ListAttribute;
import com.sportconnect.common.attributes.node.NumberAttribute;
import com.sportconnect.common.attributes.node.RefAttribute;
import com.sportconnect.common.attributes.node.StringAttribute;

/**
 * Small accessors the sealed {@link AttributeNode} hierarchy does not expose on its interface —
 * {@code isAvailable} and {@code type} live only on the own-node subtypes (a {@code #ref} node has
 * neither: it inherits both from the base-schema attribute it points at). Rather than every walk
 * repeating the same {@code switch}, they live here.
 */
public final class AttributeNodes {

    private AttributeNodes() {
    }

    /**
     * The node's own soft-delete flag, or {@code null} for a {@link RefAttribute} (which carries no
     * lifecycle of its own). {@code null} is read as "available" everywhere, same as an own node
     * that omits the field.
     */
    public static Boolean isAvailable(AttributeNode node) {
        return switch (node) {
            case StringAttribute a -> a.getIsAvailable();
            case NumberAttribute a -> a.getIsAvailable();
            case BooleanAttribute a -> a.getIsAvailable();
            case EnumAttribute a -> a.getIsAvailable();
            case ListAttribute a -> a.getIsAvailable();
            case DefinitionAttribute a -> a.getIsAvailable();
            case DefinitionListAttribute a -> a.getIsAvailable();
            case RefAttribute a -> null;
        };
    }

    /**
     * The node's declared value kind, or {@code null} for a {@link RefAttribute} (which inherits its
     * type from the base attribute at expansion time).
     */
    public static AttributeType typeOf(AttributeNode node) {
        return switch (node) {
            case StringAttribute a -> AttributeType.STRING;
            case NumberAttribute a -> AttributeType.NUMBER;
            case BooleanAttribute a -> AttributeType.BOOLEAN;
            case EnumAttribute a -> AttributeType.ENUM;
            case ListAttribute a -> AttributeType.LIST;
            case DefinitionAttribute a -> AttributeType.DEFINITION;
            case DefinitionListAttribute a -> AttributeType.DEFINITION_LIST;
            case RefAttribute a -> null;
        };
    }
}
