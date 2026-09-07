package com.sportconnect.session.service;

import com.sportconnect.sport.api.dto.SportAttributeDefinition;
import com.sportconnect.sport.api.dto.SportAttributeDefinitionType;
import com.sportconnect.sport.api.dto.SportAttributeOption;
import com.sportconnect.sport.api.dto.SportAttributeSchema;
import com.sportconnect.sport.api.dto.SportAttributeType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Filters a caller-supplied session attribute map against the sport's live, {@code #ref}-expanded
 * session attribute schema (A17 / SESSION-23).
 *
 * <p><strong>Never throws.</strong> Like {@code sport-impl}'s {@code ProfileAttributeFilter}, this
 * is the lenient half of the asymmetric validation: an entry the schema does not accept is silently
 * dropped and the rest of the write proceeds. An unknown path, a value of the wrong shape, and a
 * write aimed at a switched-off attribute (or one under a switched-off group) are all discarded,
 * not rejected. The only thing that fails a session write loudly is size, which
 * {@code SessionServiceImpl} enforces separately with a 400 against the <em>filtered</em> map.
 *
 * <p><strong>Replace semantics.</strong> Unlike {@code ProfileAttributeFilter} (whose output the
 * profile write path merges onto the stored map, with A10 handling removals), {@link #filter}'s
 * output is the whole stored value — {@code SessionServiceImpl} calls {@code setAttributes} with it
 * directly. A key absent from the request is therefore <em>gone</em>, and an explicit empty request
 * map clears every attribute. There is no delete-marker / merge path to reason about.
 *
 * <p>A near-clone of {@code ProfileAttributeFilter} for the reasons in {@link SessionAttributeValues}
 * — collapses into a shared implementation under sport {@code A23} / common {@code C5}.
 */
@Slf4j
@Component
class SessionAttributeFilter {

    /**
     * Keeps only the entries the schema currently accepts.
     *
     * <p>An entry survives when its key is the full path of a live leaf in the tree (its own
     * {@code isAvailable} is not {@code false} and no ancestor group's is), and its value is valid
     * for the declared type. Everything else is dropped. Iteration order of the surviving entries
     * follows the caller's request.
     *
     * @param requested the caller-supplied attributes; {@code null}/empty yields an empty map
     * @param schema    the sport's {@code #ref}-expanded session schema
     *                  ({@code SportService.getSessionAttributeSchemaRaw}), or {@code null} when the
     *                  sport's sessions offer no attributes — which drops everything
     * @return a new map holding only acceptable entries; this is the whole value to store
     */
    Map<String, Object> filter(Map<String, Object> requested, SportAttributeSchema schema) {
        if (requested == null || requested.isEmpty() || schema == null) {
            return new LinkedHashMap<>();
        }

        Map<String, SportAttributeDefinition> available = SessionSchemaPaths.availableByPath(schema);
        Map<String, SportAttributeDefinitionType> definitions = definitionsByName(schema);
        Map<String, Object> accepted = new LinkedHashMap<>();

        for (Map.Entry<String, Object> entry : requested.entrySet()) {
            SportAttributeDefinition definition = available.get(entry.getKey());
            if (definition == null) {
                log.debug("Ignoring session attribute {} — not an available attribute for this sport", entry.getKey());
                continue;
            }
            Object value = filterValue(entry.getValue(), definition, definitions);
            if (value == null) {
                log.debug("Ignoring session attribute {} — value invalid for type {}",
                        entry.getKey(), definition.getType());
                continue;
            }
            accepted.put(entry.getKey(), value);
        }
        return accepted;
    }

    /**
     * Filters one attribute's submitted value against its own type.
     *
     * <p>{@code DEFINITION_LIST} is handled here rather than delegated whole to
     * {@link SessionAttributeValues#filterScalarOrRecord} — "keep the good elements, drop the bad
     * ones" is a list-level policy: each element is validated individually as a {@code DEFINITION}
     * and a malformed one is dropped without invalidating the rest. An empty result list is valid
     * and stored (the one way a {@code DEFINITION_LIST} attribute clears). The
     * {@link SessionAttributeValues#MAX_LIST_ITEMS} cap is checked against the <em>submitted</em>
     * length, before element filtering — a too-long submission invalidates the whole value.
     *
     * <p>Every other type — {@code DEFINITION} included — is one call to the shared dispatcher.
     *
     * @return the value to store, or {@code null} if nothing about the submitted value survives
     */
    private Object filterValue(Object rawValue, SportAttributeDefinition definition,
                               Map<String, SportAttributeDefinitionType> definitions) {
        if (definition.getType() != SportAttributeType.DEFINITION_LIST) {
            return SessionAttributeValues.filterScalarOrRecord(
                    rawValue, definition.getType(), allowedValues(definition),
                    definition.getMin(), definition.getMax(), definition.getDefinitionRef(), definitions);
        }

        if (!(rawValue instanceof List<?> list) || list.size() > SessionAttributeValues.MAX_LIST_ITEMS) {
            return null;
        }
        List<Object> kept = new ArrayList<>();
        for (Object element : list) {
            // Element type is DEFINITION — min/max are meaningless here, so pass null.
            Object valid = SessionAttributeValues.filterScalarOrRecord(
                    element, SportAttributeType.DEFINITION, allowedValues(definition),
                    null, null, definition.getDefinitionRef(), definitions);
            if (valid != null) {
                kept.add(valid);
            }
        }
        return kept;
    }

    /**
     * Builds the schema's {@code definitions} registry keyed by name, trusting it was validated at
     * write time. The {@code #ref}-expanded raw document merges the session-local registry with any
     * profile-schema definition a {@code #ref} pulled in, so this is the whole set an own or
     * inherited {@code DEFINITION} node can reference.
     */
    private Map<String, SportAttributeDefinitionType> definitionsByName(SportAttributeSchema schema) {
        Map<String, SportAttributeDefinitionType> byName = new HashMap<>();
        if (schema.getDefinitions() == null) {
            return byName;
        }
        for (SportAttributeDefinitionType definition : schema.getDefinitions()) {
            if (definition.getName() != null) {
                byName.put(definition.getName(), definition);
            }
        }
        return byName;
    }

    private Set<String> allowedValues(SportAttributeDefinition definition) {
        Set<String> values = new HashSet<>();
        if (definition.getOptions() != null) {
            for (SportAttributeOption option : definition.getOptions()) {
                values.add(option.getValue());
            }
        }
        return values;
    }
}
