package com.sportconnect.common.attributes.value;

import com.sportconnect.common.attributes.AttributeDefinitionType;
import com.sportconnect.common.attributes.AttributeSchema;
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
import com.sportconnect.common.attributes.path.AttributePaths;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Filters a value map against a schema — the lenient half of the framework's asymmetric validation
 * (the strict half is {@code AttributeSchemaValidator}). Verbatim port of sport
 * {@code ProfileAttributeFilter}, with {@code retainDefined} generalised (extraction plan D10 — no
 * "profile" framing).
 *
 * <p><strong>Never throws.</strong> An entry the schema does not accept is silently dropped and the
 * rest of the map is kept. An unknown key, a wrong-shape value, and a write aimed at a switched-off
 * attribute are all discarded, not rejected. Size is the one loud failure and it stays with the
 * caller — deciding which keys to discard from an oversized payload would be arbitrary.
 */
public final class AttributeValueFilter {

    private AttributeValueFilter() {
    }

    /**
     * Keeps only the entries the schema currently accepts: the key is a live leaf path, its own and
     * every ancestor group's {@code isAvailable} is not {@code false}, and its value is valid for
     * the declared type. A {@code null} schema yields an empty map.
     *
     * <p>Never removes anything already stored — callers merge the result onto the existing map, so
     * a key absent from {@code requested} keeps its stored value. Removal is {@link #retainDefined}
     * plus the caller dropping any key the request carries with an explicit {@code null}.
     */
    public static Map<String, Object> filter(Map<String, Object> requested, AttributeSchema schema) {
        if (requested == null || requested.isEmpty() || schema == null) {
            return new LinkedHashMap<>();
        }
        Map<String, AttributeNode> available = AttributePaths.availableByPath(schema);
        Map<String, AttributeDefinitionType> definitions = definitionsByName(schema);
        Map<String, Object> accepted = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : requested.entrySet()) {
            AttributeNode node = available.get(entry.getKey());
            if (node == null) {
                continue; // unknown path, or defined but switched off at the leaf or an ancestor
            }
            Object value = filterValue(entry.getValue(), node, definitions);
            if (value != null) {
                accepted.put(entry.getKey(), value);
            }
        }
        return accepted;
    }

    /**
     * Re-filters an <strong>already-stored</strong> map against the current schema. The "keep" test
     * is <em>physical presence</em>, not availability:
     *
     * <ul>
     *   <li>a key whose leaf the schema no longer defines anywhere → <strong>dropped</strong>;</li>
     *   <li>a key under a defined-but-{@code isAvailable:false} leaf (or ancestor group) →
     *       <strong>kept verbatim</strong>, not re-validated — soft delete freezes a value, it does
     *       not destroy it;</li>
     *   <li>a key under a live leaf → re-run through the same validation {@link #filter} applies
     *       (an undeclared nested field the admin removed is stripped; a record that no longer
     *       satisfies its definition is dropped whole).</li>
     * </ul>
     *
     * <p>A {@code null} schema drops everything.
     */
    public static Map<String, Object> retainDefined(Map<String, Object> stored, AttributeSchema schema) {
        if (stored == null || stored.isEmpty() || schema == null) {
            return new LinkedHashMap<>();
        }
        Map<String, AttributePaths.DefinedAttribute> defined = AttributePaths.definedByPath(schema);
        Map<String, AttributeDefinitionType> definitions = definitionsByName(schema);
        Map<String, Object> retained = new LinkedHashMap<>();
        for (Map.Entry<String, Object> entry : stored.entrySet()) {
            AttributePaths.DefinedAttribute defn = defined.get(entry.getKey());
            if (defn == null) {
                continue; // no longer defined by the schema
            }
            if (!defn.live()) {
                retained.put(entry.getKey(), entry.getValue()); // soft-deleted: keep untouched
                continue;
            }
            Object value = filterValue(entry.getValue(), defn.node(), definitions);
            if (value != null) {
                retained.put(entry.getKey(), value);
            }
        }
        return retained;
    }

    /**
     * Filters one leaf's value against its own type.
     *
     * <p>{@code DEFINITION_LIST} is the one kind this class handles itself: "keep the good elements,
     * drop the bad ones" is a list-level policy, so each element is validated individually as a
     * {@code DEFINITION} and a malformed element is dropped without invalidating the rest. An empty
     * result list is stored — the one way a {@code DEFINITION_LIST} clears. The
     * {@link AttributeValues#MAX_LIST_ITEMS} cap is checked against the <strong>submitted</strong>
     * length before any element filtering, so a flood of junk past the cap is dropped in full.
     *
     * <p>A {@link RefAttribute} has no own value in a single schema (C6 rejects it at validation;
     * C9 filters only expanded, ref-free schemas) — treated as drop, since this method never throws.
     */
    private static Object filterValue(Object raw, AttributeNode node,
                                      Map<String, AttributeDefinitionType> definitions) {
        if (node instanceof DefinitionListAttribute dl) {
            if (!(raw instanceof List<?> list) || list.size() > AttributeValues.MAX_LIST_ITEMS) {
                return null;
            }
            List<Object> kept = new ArrayList<>();
            for (Object element : list) {
                Object valid = AttributeValues.filterScalarOrRecord(
                        element, AttributeType.DEFINITION, Set.of(), null, null, dl.getDefinitionRef(), definitions);
                if (valid != null) {
                    kept.add(valid);
                }
            }
            return kept;
        }
        return switch (node) {
            case StringAttribute a -> AttributeValues.filterScalarOrRecord(
                    raw, AttributeType.STRING, Set.of(), null, null, null, definitions);
            case NumberAttribute a -> AttributeValues.filterScalarOrRecord(
                    raw, AttributeType.NUMBER, Set.of(), a.getMin(), a.getMax(), null, definitions);
            case BooleanAttribute a -> AttributeValues.filterScalarOrRecord(
                    raw, AttributeType.BOOLEAN, Set.of(), null, null, null, definitions);
            case EnumAttribute a -> AttributeValues.filterScalarOrRecord(
                    raw, AttributeType.ENUM, AttributeValues.optionValues(a.getOptions()), null, null, null, definitions);
            case ListAttribute a -> AttributeValues.filterScalarOrRecord(
                    raw, AttributeType.LIST, AttributeValues.optionValues(a.getOptions()), null, null, null, definitions);
            case DefinitionAttribute a -> AttributeValues.filterScalarOrRecord(
                    raw, AttributeType.DEFINITION, Set.of(), null, null, a.getDefinitionRef(), definitions);
            case DefinitionListAttribute a -> throw new IllegalStateException("unreachable — handled above");
            case RefAttribute a -> null;
        };
    }

    private static Map<String, AttributeDefinitionType> definitionsByName(AttributeSchema schema) {
        Map<String, AttributeDefinitionType> byName = new HashMap<>();
        if (schema.getDefinitions() == null) {
            return byName;
        }
        for (AttributeDefinitionType definition : schema.getDefinitions()) {
            if (definition.getName() != null) {
                byName.put(definition.getName(), definition);
            }
        }
        return byName;
    }
}
