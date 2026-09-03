package com.sportconnect.sport.service;

import com.sportconnect.sport.api.dto.SportAttributeDefinition;
import com.sportconnect.sport.api.dto.SportAttributeDefinitionType;
import com.sportconnect.sport.api.dto.SportAttributeGroup;
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
 * Filters user-supplied profile attributes against the sport's live schema (A9).
 *
 * <p><strong>Never throws.</strong> This is the lenient half of A9's asymmetric validation: an
 * entry the schema does not accept is silently dropped and the rest of the write proceeds. An
 * unknown key, a value of the wrong shape, and a write aimed at a switched-off attribute are all
 * treated the same way — discarded, not rejected. This was an explicit product decision: a stale
 * or sloppy client key is noise, and failing a whole profile save over it is worse than ignoring
 * it.
 *
 * <p>The one thing that still fails a profile write loudly is size, which
 * {@code UserSportProfileServiceImpl.validateAttributesSize} enforces separately with a 400. That
 * is deliberate too — an oversized payload has no sensible partial answer, since deciding which
 * keys to discard would be arbitrary.
 *
 * <p>{@link #filter} itself never removes anything already stored — callers merge its output onto
 * the existing map, so a key absent from the request keeps its stored value. Removal is A10's job,
 * split across two entry points the caller invokes alongside {@code filter}: {@link #retainDefined}
 * prunes a stored key whose definition the admin has deleted, and the caller drops any key the raw
 * request carries with an explicit {@code null} (the delete marker). A {@code DEFINITION_LIST} also
 * still self-clears via an explicit empty list (v2/A12) — the submitted list replaces the stored
 * one wholesale, there being no per-element identity to merge against.
 */
@Slf4j
@Component
class ProfileAttributeFilter {

    /**
     * Keeps only the entries the schema currently accepts.
     *
     * <p>An entry survives when its key is a live leaf in the tree, its own {@code isAvailable} is
     * not {@code false}, its parent group's {@code isAvailable} is not {@code false}, and its value
     * is valid for the declared type. Everything else is dropped.
     *
     * <p>A {@code null} schema (the sport offers no attributes) yields an empty map — every
     * supplied attribute is dropped, which is the correct behaviour for a sport whose admin has not
     * defined a schema yet.
     *
     * @param requested the caller-supplied attributes; {@code null} yields an empty map
     * @param schema    the sport's live schema, or {@code null} when it offers no attributes
     * @return a new map holding only acceptable entries, preserving the caller's iteration order
     */
    Map<String, Object> filter(Map<String, Object> requested, SportAttributeSchema schema) {
        if (requested == null || requested.isEmpty() || schema == null) {
            return new LinkedHashMap<>();
        }

        Map<String, SportAttributeDefinition> available = availableAttributesByKey(schema);
        Map<String, SportAttributeDefinitionType> definitions = definitionsByName(schema);
        Map<String, Object> accepted = new LinkedHashMap<>();

        for (Map.Entry<String, Object> entry : requested.entrySet()) {
            SportAttributeDefinition definition = available.get(entry.getKey());
            if (definition == null) {
                // Unknown, or defined but switched off at either the attribute or the group level.
                log.debug("Ignoring attribute {} — not an available attribute for this sport", entry.getKey());
                continue;
            }
            Object value = filterValue(entry.getValue(), definition, definitions);
            if (value == null) {
                log.debug("Ignoring attribute {} — value invalid for type {}",
                        entry.getKey(), definition.getType());
                continue;
            }
            accepted.put(entry.getKey(), value);
        }
        return accepted;
    }

    /**
     * Re-filters an <strong>already-stored</strong> attributes map against the sport's current
     * schema (A10 Part 2). Unlike {@link #filter}, the input is what a profile already holds, not an
     * incoming request, and the "keep" test is <em>physical presence</em> in the schema rather than
     * availability:
     *
     * <ul>
     *   <li>a top-level key whose attribute is not defined anywhere in the schema tree — one
     *       written before A9, or under a definition the admin has since deleted — is
     *       <strong>dropped</strong>;</li>
     *   <li>a key under an attribute that <em>is</em> defined but is {@code isAvailable: false} (or
     *       whose group is) is <strong>kept verbatim</strong>, not re-validated — soft delete
     *       freezes a value, it does not destroy it (see {@code SportAttributeDefinition});</li>
     *   <li>a key under a live attribute is re-run through the same scalar/record validation
     *       {@link #filter} applies to an incoming value (this ticket's "2b"): an undeclared nested
     *       field the admin removed from a {@code DEFINITION} is stripped, and a record that no
     *       longer satisfies its definition (a now-required field missing, a {@code NUMBER} outside
     *       a tightened {@code min}/{@code max}) is dropped whole. That whole-record case is a
     *       known, accepted gap that client {@code SPORT-6}'s strict required-field validation
     *       closes.</li>
     * </ul>
     *
     * <p>A {@code null} schema (the sport offers no attributes) drops everything. Iteration order of
     * the surviving entries is preserved.
     *
     * @param stored the profile's current attributes; {@code null}/empty yields an empty map
     * @param schema the sport's live schema, or {@code null} when it offers no attributes
     * @return a new map holding only what the current schema still recognises
     */
    Map<String, Object> retainDefined(Map<String, Object> stored, SportAttributeSchema schema) {
        if (stored == null || stored.isEmpty() || schema == null) {
            return new LinkedHashMap<>();
        }

        Map<String, DefinedAttribute> defined = definedAttributesByKey(schema);
        Map<String, SportAttributeDefinitionType> definitions = definitionsByName(schema);
        Map<String, Object> retained = new LinkedHashMap<>();

        for (Map.Entry<String, Object> entry : stored.entrySet()) {
            DefinedAttribute defn = defined.get(entry.getKey());
            if (defn == null) {
                log.debug("Pruning stored attribute {} — no longer defined by the schema", entry.getKey());
                continue;
            }
            if (!defn.live()) {
                // Soft-deleted attribute or group: keep whatever the user last stored, untouched.
                retained.put(entry.getKey(), entry.getValue());
                continue;
            }
            Object value = filterValue(entry.getValue(), defn.definition(), definitions);
            if (value == null) {
                log.debug("Pruning stored attribute {} — value no longer valid for its definition", entry.getKey());
                continue;
            }
            retained.put(entry.getKey(), value);
        }
        return retained;
    }

    /**
     * Filters one attribute's submitted value against its own type (A9/A12).
     *
     * <p>{@code DEFINITION_LIST} is the one type this class handles itself rather than delegating
     * whole to {@link SportAttributeValues#filterScalarOrRecord} — "keep the good elements, drop the
     * bad ones" is a list-level policy this filter owns (v2 design §9.1), not a per-value question,
     * so each element is validated individually via a {@code DEFINITION} call and a malformed
     * element is dropped without invalidating the rest. An empty result list is valid and is stored
     * — the one way a {@code DEFINITION_LIST} attribute can be cleared (see the class Javadoc).
     *
     * <p>The {@link SportAttributeValues#MAX_LIST_ITEMS} cap is checked here against the
     * <strong>submitted</strong> list length, before any element filtering — a too-long submission
     * invalidates the whole value, it is not truncated to the cap. Gating on the submitted count
     * rather than the surviving count is deliberate: checking after filtering would let a submission
     * of hundreds of junk elements past the cap as long as few enough of them happened to be valid,
     * which defeats the point of having a cap at all.
     *
     * <p>Every other type — including {@code DEFINITION} itself — is a single call to the shared
     * dispatcher, which already returns {@code null} on failure the same way this method's callers
     * expect; {@link SportAttributeValues#isValid} applies the same cap to {@code LIST} there.
     *
     * @return the value to store, or {@code null} if nothing about the submitted value survives
     */
    private Object filterValue(Object rawValue, SportAttributeDefinition definition,
                                Map<String, SportAttributeDefinitionType> definitions) {
        if (definition.getType() != SportAttributeType.DEFINITION_LIST) {
            return SportAttributeValues.filterScalarOrRecord(
                    rawValue, definition.getType(), allowedValues(definition),
                    definition.getMin(), definition.getMax(), definition.getDefinitionRef(), definitions);
        }

        if (!(rawValue instanceof List<?> list) || list.size() > SportAttributeValues.MAX_LIST_ITEMS) {
            return null;
        }
        List<Object> kept = new ArrayList<>();
        for (Object element : list) {
            // Element type is DEFINITION — min/max are meaningless here, so pass null.
            Object valid = SportAttributeValues.filterScalarOrRecord(
                    element, SportAttributeType.DEFINITION, allowedValues(definition),
                    null, null, definition.getDefinitionRef(), definitions);
            if (valid != null) {
                kept.add(valid);
            }
        }
        return kept;
    }

    /**
     * Builds the sport's {@code definitions} registry keyed by name, trusting it was already
     * validated at write time — same posture as {@link #availableAttributesByKey}, which likewise
     * does not re-check the schema it is handed.
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

    /**
     * Flattens the tree to the leaves a write may currently target.
     *
     * <p>An unavailable group is skipped wholesale rather than having its children examined: parent
     * state wins, so a child's own {@code isAvailable: true} does not resurrect it under a retired
     * group. Skipping the subtree here is what makes that rule hold everywhere, instead of each
     * caller having to remember it.
     *
     * <p>{@code isAvailable} is read as "not explicitly false" so that a document omitting the flag
     * behaves as available, matching how an admin would read a schema that simply does not mention
     * it.
     */
    private Map<String, SportAttributeDefinition> availableAttributesByKey(SportAttributeSchema schema) {
        Map<String, SportAttributeDefinition> byKey = new HashMap<>();
        List<SportAttributeGroup> groups = schema.getGroups();
        if (groups == null) {
            return byKey;
        }
        for (SportAttributeGroup group : groups) {
            if (Boolean.FALSE.equals(group.getIsAvailable())) {
                continue;
            }
            List<SportAttributeDefinition> attributes = group.getAttributes();
            if (attributes == null) {
                continue;
            }
            for (SportAttributeDefinition attribute : attributes) {
                if (Boolean.FALSE.equals(attribute.getIsAvailable()) || attribute.getKey() == null) {
                    continue;
                }
                byKey.put(attribute.getKey(), attribute);
            }
        }
        return byKey;
    }

    /**
     * Every attribute the schema declares, keyed by leaf key, <strong>regardless of
     * {@code isAvailable}</strong> — the "does a definition physically exist" view A10 Part 2's
     * prune needs, as opposed to {@link #availableAttributesByKey}'s "may a write target this" view.
     * {@link DefinedAttribute#live()} carries whether the attribute and its group are both still
     * available, which is what tells {@link #retainDefined} whether to re-validate a stored value or
     * keep it frozen.
     */
    private Map<String, DefinedAttribute> definedAttributesByKey(SportAttributeSchema schema) {
        Map<String, DefinedAttribute> byKey = new HashMap<>();
        List<SportAttributeGroup> groups = schema.getGroups();
        if (groups == null) {
            return byKey;
        }
        for (SportAttributeGroup group : groups) {
            boolean groupLive = !Boolean.FALSE.equals(group.getIsAvailable());
            List<SportAttributeDefinition> attributes = group.getAttributes();
            if (attributes == null) {
                continue;
            }
            for (SportAttributeDefinition attribute : attributes) {
                if (attribute.getKey() == null) {
                    continue;
                }
                boolean live = groupLive && !Boolean.FALSE.equals(attribute.getIsAvailable());
                byKey.put(attribute.getKey(), new DefinedAttribute(attribute, live));
            }
        }
        return byKey;
    }

    /** A schema-declared attribute plus whether it (and its group) are still {@code isAvailable}. */
    private record DefinedAttribute(SportAttributeDefinition definition, boolean live) {
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
