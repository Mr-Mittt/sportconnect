package com.sportconnect.common.attributes.pair;

import com.sportconnect.common.attributes.AttributeDefinitionType;
import com.sportconnect.common.attributes.AttributeGroup;
import com.sportconnect.common.attributes.AttributeNodes;
import com.sportconnect.common.attributes.AttributeSchema;
import com.sportconnect.common.attributes.AttributeType;
import com.sportconnect.common.attributes.Cardinality;
import com.sportconnect.common.attributes.field.AttributeField;
import com.sportconnect.common.attributes.field.DefinitionField;
import com.sportconnect.common.attributes.node.AttributeNode;
import com.sportconnect.common.attributes.node.BooleanAttribute;
import com.sportconnect.common.attributes.node.DefinitionAttribute;
import com.sportconnect.common.attributes.node.DefinitionListAttribute;
import com.sportconnect.common.attributes.node.EnumAttribute;
import com.sportconnect.common.attributes.node.ListAttribute;
import com.sportconnect.common.attributes.node.NumberAttribute;
import com.sportconnect.common.attributes.node.RefAttribute;
import com.sportconnect.common.attributes.node.StringAttribute;
import com.sportconnect.common.attributes.path.AttributePaths;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Inlines every {@code #ref} node of a <em>derived</em> schema into a plain {@link AttributeSchema} —
 * the ref-free shape C7's {@link com.sportconnect.common.attributes.value.AttributeValueFilter}
 * consumes and C8's {@link com.sportconnect.common.attributes.resolve.AttributeSchemaResolver}
 * locale-resolves. Verbatim port of sport {@code SessionAttributeSchemaExpander} (A17), adjusted for
 * the sealed node model and the {@code #ref} semantics of extraction plan D9.
 *
 * <p><strong>Lenient</strong> — the one lenient step of the pair contract (the validator is strict).
 * Per {@code #ref} node: look the base path up in the base schema's live + available view
 * ({@link AttributePaths#availableByPath}); <strong>drop the node</strong> if it no longer resolves
 * (the base schema may have retired the attribute since the derived schema was stored). Otherwise
 * emit a concrete node whose <strong>arity follows the {@code #ref}'s own {@code cardinality}</strong>
 * (C10 — a {@code SINGLE} {@code #ref} off a list base emits the single subtype, not the list one),
 * its element type ({@code options} / {@code definitionRef} / bounds / {@code searchScope}) taken
 * from the base target — re-keyed to the {@code #ref}'s explicit {@code key}, its label the
 * {@code #ref}'s override if present else the base target's; see {@link #expandRefTarget} for the
 * full mapping. The base target's {@code defaultValue} is <strong>not</strong> carried: under D9 a
 * {@code #ref} is a choice-list source, not a prefilled default (that role is now
 * {@code prefillKey}).
 *
 * <p>An own {@code DEFINITION}/{@code DEFINITION_LIST} node whose {@code definitionRef} is absent
 * from the merged registry is likewise dropped; every other own node is carried through unchanged.
 *
 * <p>The base definition a surviving {@code #ref}'s target references — and that definition's whole
 * reachable closure — is pulled into the merged {@code definitions} registry. A name already present
 * (a derived-local definition, or an earlier pull) wins and stops the walk.
 *
 * <p>Spring-free (D2): a {@code public static} entry point.
 */
public final class DerivedSchemaExpander {

    private DerivedSchemaExpander() {
    }

    /**
     * The expanded document plus, for every {@code #ref} node that survived expansion, the base path
     * it draws its value(s) from and the {@link Cardinality} it declared — everything
     * {@link DerivedSchemaResolver} needs to stamp {@code prefillable} / {@code prefillKey} /
     * {@code cardinality} onto the matching resolved node.
     *
     * @param schema             a {@link AttributeSchema} with no {@code #ref} nodes; every leaf a
     *                           plain typed {@link AttributeNode} subtype; {@code definitions} the
     *                           union of the derived-local registry and every base definition a
     *                           {@code #ref} reached
     * @param refExpansionsByPath expanded-node full path → its {@link RefExpansion}
     */
    public record ExpandedSchema(AttributeSchema schema, Map<String, RefExpansion> refExpansionsByPath) {
    }

    /**
     * @param basePath    the base-schema {@code /}-path the client reads the choice list from
     * @param cardinality whether the derived attribute holds one value ({@code SINGLE}) or many
     *                    ({@code LIST}) — the {@code #ref}'s own declaration, independent of the
     *                    base attribute's shape
     */
    public record RefExpansion(String basePath, Cardinality cardinality) {
    }

    /**
     * @param base    the base schema, or {@code null} (then every {@code #ref} is dropped)
     * @param derived the stored derived schema; {@code null} yields {@code null}
     */
    public static ExpandedSchema expand(AttributeSchema base, AttributeSchema derived) {
        if (derived == null) {
            return null;
        }

        Map<String, AttributeNode> baseAvailable = AttributePaths.availableByPath(base);
        Map<String, AttributeDefinitionType> baseDefinitions = definitionsByName(base);

        Map<String, AttributeDefinitionType> merged = definitionsByName(derived);

        Map<String, RefExpansion> refExpansionsByPath = new LinkedHashMap<>();
        List<AttributeGroup> groups = new ArrayList<>();
        for (AttributeGroup group : nullSafe(derived.getGroups())) {
            groups.add(expandGroup(group, "", baseAvailable, baseDefinitions, merged, refExpansionsByPath));
        }

        AttributeSchema expanded = AttributeSchema.builder()
                .defaultLocale(derived.getDefaultLocale())
                .definitions(new ArrayList<>(merged.values()))
                .groups(groups)
                .build();
        return new ExpandedSchema(expanded, refExpansionsByPath);
    }

    private static AttributeGroup expandGroup(
            AttributeGroup group, String parentPath,
            Map<String, AttributeNode> baseAvailable,
            Map<String, AttributeDefinitionType> baseDefinitions,
            Map<String, AttributeDefinitionType> merged,
            Map<String, RefExpansion> refExpansionsByPath) {

        String groupPath = parentPath.isEmpty()
                ? group.getKey()
                : parentPath + AttributePaths.SEPARATOR + group.getKey();

        List<AttributeNode> attributes = new ArrayList<>();
        for (AttributeNode node : nullSafe(group.getAttributes())) {
            if (node instanceof RefAttribute ref) {
                AttributeNode target = baseAvailable.get(ref.getRef());
                if (target == null) {
                    continue; // lenient: #ref whose base target is gone / unavailable
                }
                attributes.add(expandRefTarget(target, ref.getKey(), ref.getLabel(), ref.getCardinality()));
                refExpansionsByPath.put(groupPath + AttributePaths.SEPARATOR + ref.getKey(),
                        new RefExpansion(ref.getRef(), ref.getCardinality()));
                pullDefinitionClosure(AttributeNodes.definitionRefOf(target), baseDefinitions, merged);
            } else {
                AttributeType type = AttributeNodes.typeOf(node);
                boolean recordType = type == AttributeType.DEFINITION || type == AttributeType.DEFINITION_LIST;
                if (recordType && !merged.containsKey(AttributeNodes.definitionRefOf(node))) {
                    continue; // lenient: own record node whose derived-local definition is gone
                }
                attributes.add(node);
            }
        }

        List<AttributeGroup> subGroups = new ArrayList<>();
        for (AttributeGroup child : nullSafe(group.getGroups())) {
            subGroups.add(expandGroup(child, groupPath, baseAvailable, baseDefinitions, merged, refExpansionsByPath));
        }

        return AttributeGroup.builder()
                .key(group.getKey())
                .label(group.getLabel())
                .isAvailable(group.getIsAvailable())
                .attributes(attributes)
                .groups(subGroups)
                .build();
    }

    /**
     * The concrete node a surviving {@code #ref} inlines to (C10). Its <strong>arity</strong>
     * follows the {@code #ref}'s own {@code cardinality}; its <strong>element type</strong>
     * ({@code options} / {@code definitionRef} / bounds / {@code searchScope}) comes from the base
     * target. Re-keyed to {@code newKey}, re-labelled to {@code labelOverride} when non-{@code null}
     * (else the target's own label).
     *
     * <p>Mapping (base target type → {@code SINGLE} / {@code LIST}):
     * <ul>
     *   <li>{@code ENUM} / {@code LIST} → {@link EnumAttribute} / {@link ListAttribute}, base options;</li>
     *   <li>{@code DEFINITION} / {@code DEFINITION_LIST} → {@link DefinitionAttribute} /
     *       {@link DefinitionListAttribute}, base {@code definitionRef} + {@code searchScope};</li>
     *   <li>{@code STRING} / {@code NUMBER} / {@code BOOLEAN} → that scalar for either cardinality —
     *       single by nature, and there is no list-of-free-scalars node type.</li>
     * </ul>
     *
     * <p>Before C10 this cloned the base target's subtype verbatim, so a {@code SINGLE} {@code #ref}
     * off a list base kept a list subtype and {@code AttributeValueFilter} then required an array —
     * dropping the single value the client submits for a {@code SINGLE} {@code #ref}.
     *
     * <p>{@code cardinality} is {@code non-null} in practice (the pair validator rejects a
     * {@code #ref} without one on write); a {@code null} here is read as {@code SINGLE}, the safe
     * default for the lenient half of the contract. The base target comes from a validated base
     * schema, so it is never a {@link RefAttribute} — that case is a programming error.
     */
    private static AttributeNode expandRefTarget(AttributeNode target, String newKey,
                                                 Map<String, String> labelOverride, Cardinality cardinality) {
        Map<String, String> label = labelOverride != null ? labelOverride : target.getLabel();
        boolean list = cardinality == Cardinality.LIST;
        return switch (target) {
            case StringAttribute a -> StringAttribute.builder()
                    .key(newKey).label(label).isAvailable(a.getIsAvailable()).build();
            case NumberAttribute a -> NumberAttribute.builder()
                    .key(newKey).label(label).isAvailable(a.getIsAvailable())
                    .min(a.getMin()).max(a.getMax()).build();
            case BooleanAttribute a -> BooleanAttribute.builder()
                    .key(newKey).label(label).isAvailable(a.getIsAvailable()).build();
            case EnumAttribute a -> list
                    ? ListAttribute.builder().key(newKey).label(label)
                            .isAvailable(a.getIsAvailable()).options(a.getOptions()).build()
                    : EnumAttribute.builder().key(newKey).label(label)
                            .isAvailable(a.getIsAvailable()).options(a.getOptions()).build();
            case ListAttribute a -> list
                    ? ListAttribute.builder().key(newKey).label(label)
                            .isAvailable(a.getIsAvailable()).options(a.getOptions()).build()
                    : EnumAttribute.builder().key(newKey).label(label)
                            .isAvailable(a.getIsAvailable()).options(a.getOptions()).build();
            case DefinitionAttribute a -> list
                    ? DefinitionListAttribute.builder().key(newKey).label(label)
                            .isAvailable(a.getIsAvailable())
                            .definitionRef(a.getDefinitionRef()).searchScope(a.getSearchScope()).build()
                    : DefinitionAttribute.builder().key(newKey).label(label)
                            .isAvailable(a.getIsAvailable())
                            .definitionRef(a.getDefinitionRef()).searchScope(a.getSearchScope()).build();
            case DefinitionListAttribute a -> list
                    ? DefinitionListAttribute.builder().key(newKey).label(label)
                            .isAvailable(a.getIsAvailable())
                            .definitionRef(a.getDefinitionRef()).searchScope(a.getSearchScope()).build()
                    : DefinitionAttribute.builder().key(newKey).label(label)
                            .isAvailable(a.getIsAvailable())
                            .definitionRef(a.getDefinitionRef()).searchScope(a.getSearchScope()).build();
            case RefAttribute a -> throw new IllegalStateException(
                    "base schema contains a #ref node at the target of another #ref: " + a.getRef());
        };
    }

    /**
     * Pulls {@code name} and every definition reachable from its {@code DEFINITION} fields into
     * {@code merged}. A name already present (a derived-local definition, or an earlier pull) wins
     * and stops the walk.
     */
    private static void pullDefinitionClosure(String name, Map<String, AttributeDefinitionType> baseDefinitions,
                                              Map<String, AttributeDefinitionType> merged) {
        if (name == null || merged.containsKey(name)) {
            return;
        }
        AttributeDefinitionType definition = baseDefinitions.get(name);
        if (definition == null) {
            return;
        }
        merged.put(name, definition);
        for (AttributeField field : nullSafe(definition.getFields())) {
            if (field instanceof DefinitionField ref) {
                pullDefinitionClosure(ref.getDefinitionRef(), baseDefinitions, merged);
            }
        }
    }

    private static Map<String, AttributeDefinitionType> definitionsByName(AttributeSchema schema) {
        Map<String, AttributeDefinitionType> byName = new LinkedHashMap<>();
        if (schema == null) {
            return byName;
        }
        for (AttributeDefinitionType definition : nullSafe(schema.getDefinitions())) {
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
