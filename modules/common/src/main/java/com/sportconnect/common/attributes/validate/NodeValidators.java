package com.sportconnect.common.attributes.validate;

import com.sportconnect.common.attributes.AttributeDefinitionType;
import com.sportconnect.common.attributes.AttributeType;
import com.sportconnect.common.attributes.node.AttributeNode;
import com.sportconnect.common.attributes.node.BooleanAttribute;
import com.sportconnect.common.attributes.node.DefinitionAttribute;
import com.sportconnect.common.attributes.node.DefinitionListAttribute;
import com.sportconnect.common.attributes.node.EnumAttribute;
import com.sportconnect.common.attributes.node.ListAttribute;
import com.sportconnect.common.attributes.node.NumberAttribute;
import com.sportconnect.common.attributes.node.RefAttribute;
import com.sportconnect.common.attributes.node.StringAttribute;
import com.sportconnect.common.attributes.value.AttributeValues;
import com.sportconnect.common.exception.BadRequestException;

import java.util.Map;
import java.util.Set;

/**
 * Per-{@link AttributeNode}-subtype validation, as an exhaustive {@code switch} over the sealed set
 * (adding a subtype is a compile error until a case is added — the same open/closed guarantee a
 * registry of classes gives, with less ceremony).
 *
 * <p>Replaces the type half of sport {@code SchemaChecks.validateAttribute}. Most of that method's
 * branches are gone: with the sealed DTO model an {@code options}/{@code min}/{@code definitionRef}
 * on the wrong kind is unrepresentable and fails at parse (extraction plan D8), so only the rules
 * that need a <em>value</em> or a cross-reference remain here.
 */
final class NodeValidators {

    private NodeValidators() {
    }

    /**
     * Validates one <em>own</em> node in a single (non-derived) schema. A {@link RefAttribute} is
     * rejected outright — {@code #ref} is only valid in a derived schema (C9). Key and
     * sibling-uniqueness are checked by the caller's tree walk before this runs.
     */
    static void validateOwnNode(AttributeNode node, Map<String, AttributeDefinitionType> definitions,
                                String defaultLocale) {
        String ctx = "Attribute " + node.getKey();
        switch (node) {
            case RefAttribute ignored -> throw new BadRequestException(
                    ctx + " is a #ref node — #ref is only valid in a derived schema");
            case StringAttribute s -> {
                LeafChecks.validateLabel(s.getLabel(), defaultLocale, ctx);
                validateDefault(ctx, s.getDefaultValue(), AttributeType.STRING, Set.of(), null, null);
            }
            case BooleanAttribute b -> {
                LeafChecks.validateLabel(b.getLabel(), defaultLocale, ctx);
                validateDefault(ctx, b.getDefaultValue(), AttributeType.BOOLEAN, Set.of(), null, null);
            }
            case NumberAttribute n -> {
                LeafChecks.validateLabel(n.getLabel(), defaultLocale, ctx);
                validateBounds(ctx, n.getMin(), n.getMax());
                validateDefault(ctx, n.getDefaultValue(), AttributeType.NUMBER, Set.of(), n.getMin(), n.getMax());
            }
            case EnumAttribute e -> {
                LeafChecks.validateLabel(e.getLabel(), defaultLocale, ctx);
                LeafChecks.validateOptionsList(ctx, e.getOptions(), "ENUM", defaultLocale);
                validateDefault(ctx, e.getDefaultValue(), AttributeType.ENUM,
                        AttributeValues.optionValues(e.getOptions()), null, null);
            }
            case ListAttribute l -> {
                LeafChecks.validateLabel(l.getLabel(), defaultLocale, ctx);
                LeafChecks.validateOptionsList(ctx, l.getOptions(), "LIST", defaultLocale);
                validateDefault(ctx, l.getDefaultValue(), AttributeType.LIST,
                        AttributeValues.optionValues(l.getOptions()), null, null);
            }
            case DefinitionAttribute d -> {
                LeafChecks.validateLabel(d.getLabel(), defaultLocale, ctx);
                requireDefinition(ctx, d.getDefinitionRef(), definitions);
            }
            case DefinitionListAttribute d -> {
                LeafChecks.validateLabel(d.getLabel(), defaultLocale, ctx);
                requireDefinition(ctx, d.getDefinitionRef(), definitions);
            }
        }
    }

    static void validateBounds(String context, Double min, Double max) {
        if (min != null && max != null && min > max) {
            throw new BadRequestException(context + " has a min greater than its max");
        }
    }

    static void requireDefinition(String context, String definitionRef,
                                  Map<String, AttributeDefinitionType> definitions) {
        if (definitionRef == null) {
            throw new BadRequestException(context + " must declare definitionRef");
        }
        if (!definitions.containsKey(definitionRef)) {
            throw new BadRequestException(context + " references unknown definition: " + definitionRef);
        }
    }

    private static void validateDefault(String context, Object defaultValue, AttributeType type,
                                        Set<String> allowed, Double min, Double max) {
        if (defaultValue == null) {
            return;
        }
        if (!AttributeValues.isValid(defaultValue, type, allowed, min, max)) {
            throw new BadRequestException(context + " has a defaultValue invalid for type " + type);
        }
    }
}
