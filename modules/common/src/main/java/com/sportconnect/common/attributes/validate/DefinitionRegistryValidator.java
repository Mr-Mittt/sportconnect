package com.sportconnect.common.attributes.validate;

import com.sportconnect.common.attributes.AttributeDefinitionType;
import com.sportconnect.common.attributes.field.AttributeField;
import com.sportconnect.common.attributes.field.DefinitionField;
import com.sportconnect.common.exception.BadRequestException;

import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Validates a schema's {@code definitions} registry and returns it keyed by name, ready for the
 * group/node pass to resolve {@code definitionRef}s against. Lifted verbatim from sport
 * {@code SchemaChecks.validateDefinitions} (v2 design §5.4).
 *
 * <p>Three passes, each depending on the last:
 * <ol>
 *   <li>collect names — reject a bad pattern or a duplicate;</li>
 *   <li>validate every definition's fields, including that any {@code definitionRef} resolves
 *       against the now-complete name set;</li>
 *   <li>compute which definitions are referenced <em>by another definition's field</em> ("inner
 *       position") and enforce that those hold only primitive fields.</li>
 * </ol>
 *
 * <p>Pass 3 <em>is</em> the whole depth/cycle rule — no traversal or visited-set. A cycle
 * {@code A → B → A} needs {@code B} (inner, referenced by {@code A}) to point back at {@code A}, but
 * an inner definition may hold only primitives, so {@code B} fails this pass directly. A
 * self-reference {@code A → A} puts {@code A} in both positions — the same contradiction.
 *
 * <p><strong>Visibility:</strong> {@code public} only so the sibling {@code pair} package (C9) can
 * validate a derived schema's own {@code definitions} registry by the identical 3-pass rule —
 * framework-internal, not a supported API outside {@code common.attributes}.
 */
public final class DefinitionRegistryValidator {

    private DefinitionRegistryValidator() {
    }

    public static Map<String, AttributeDefinitionType> validate(List<AttributeDefinitionType> definitions,
                                                                String defaultLocale) {
        Map<String, AttributeDefinitionType> byName = new LinkedHashMap<>();
        for (AttributeDefinitionType definition : LeafChecks.nullSafe(definitions)) {
            if (definition.getName() == null
                    || !LeafChecks.DEFINITION_NAME_PATTERN.matcher(definition.getName()).matches()) {
                throw new BadRequestException("Definition name must match "
                        + LeafChecks.DEFINITION_NAME_PATTERN.pattern() + " but was: " + definition.getName());
            }
            if (byName.putIfAbsent(definition.getName(), definition) != null) {
                throw new BadRequestException("Duplicate definition name: " + definition.getName());
            }
        }

        for (AttributeDefinitionType definition : byName.values()) {
            Set<String> fieldKeys = new HashSet<>();
            for (AttributeField field : LeafChecks.nullSafe(definition.getFields())) {
                LeafChecks.validateKey(field.getKey(), "Definition field key");
                if (!fieldKeys.add(field.getKey())) {
                    throw new BadRequestException("Duplicate field key in definition "
                            + definition.getName() + ": " + field.getKey());
                }
                FieldValidators.validate(definition, field, byName, defaultLocale);
            }
        }

        validateInnerPositionDefinitionsArePrimitiveOnly(byName);
        return byName;
    }

    private static void validateInnerPositionDefinitionsArePrimitiveOnly(
            Map<String, AttributeDefinitionType> byName) {
        Set<String> innerPosition = new HashSet<>();
        for (AttributeDefinitionType definition : byName.values()) {
            for (AttributeField field : LeafChecks.nullSafe(definition.getFields())) {
                if (field instanceof DefinitionField ref) {
                    innerPosition.add(ref.getDefinitionRef());
                }
            }
        }

        for (String name : innerPosition) {
            // Guaranteed resolved already: FieldValidators.validate rejected an unresolved definitionRef.
            AttributeDefinitionType inner = byName.get(name);
            for (AttributeField field : LeafChecks.nullSafe(inner.getFields())) {
                if (field instanceof DefinitionField) {
                    throw new BadRequestException("Definition " + name
                            + " is referenced by another definition and so may only contain primitive "
                            + "fields (STRING/NUMBER/BOOLEAN/ENUM/LIST), but field " + field.getKey()
                            + " is DEFINITION");
                }
            }
        }
    }
}
