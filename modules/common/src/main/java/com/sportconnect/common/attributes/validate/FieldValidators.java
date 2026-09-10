package com.sportconnect.common.attributes.validate;

import com.sportconnect.common.attributes.AttributeDefinitionType;
import com.sportconnect.common.attributes.field.AttributeField;
import com.sportconnect.common.attributes.field.BooleanField;
import com.sportconnect.common.attributes.field.DefinitionField;
import com.sportconnect.common.attributes.field.EnumField;
import com.sportconnect.common.attributes.field.ListField;
import com.sportconnect.common.attributes.field.NumberField;
import com.sportconnect.common.attributes.field.StringField;
import com.sportconnect.common.exception.BadRequestException;

import java.util.Map;

/**
 * Per-{@link AttributeField}-subtype validation — the field counterpart of {@link NodeValidators},
 * replacing the field half of sport {@code SchemaChecks.validateField}. There is no
 * {@code DEFINITION_LIST} or ref field subtype, so those cases are unrepresentable and fail at parse
 * (extraction plan D8); a field never carries a {@code defaultValue}. What remains: label,
 * ENUM/LIST options, {@code NUMBER} bounds, {@code DEFINITION} ref resolution.
 */
final class FieldValidators {

    private FieldValidators() {
    }

    static void validate(AttributeDefinitionType definition, AttributeField field,
                         Map<String, AttributeDefinitionType> byName, String defaultLocale) {
        String ctx = "Definition " + definition.getName() + " field " + field.getKey();
        LeafChecks.validateLabel(field.getLabel(), defaultLocale, ctx);
        LeafChecks.validateLayout(field.getLayout(), ctx);
        // C11: a hidden field renders no input and no read row, so a required-but-hidden field could
        // never be satisfied — reject the contradiction. Applies to both single and derived schemas.
        if (Boolean.TRUE.equals(field.getHidden()) && Boolean.TRUE.equals(field.getIsRequired())) {
            throw new BadRequestException(ctx + " cannot be both hidden and required");
        }
        switch (field) {
            case StringField ignored -> {
            }
            case BooleanField ignored -> {
            }
            case NumberField n -> NodeValidators.validateBounds(ctx, n.getMin(), n.getMax());
            case EnumField e -> LeafChecks.validateOptionsList(ctx, e.getOptions(), "ENUM", defaultLocale);
            case ListField l -> LeafChecks.validateOptionsList(ctx, l.getOptions(), "LIST", defaultLocale);
            case DefinitionField d -> NodeValidators.requireDefinition(ctx, d.getDefinitionRef(), byName);
        }
    }
}
