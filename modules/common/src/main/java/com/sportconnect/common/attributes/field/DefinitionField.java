package com.sportconnect.common.attributes.field;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * A nested-record ({@code DEFINITION}) definition field. The definition it names via
 * {@code definitionRef} may itself hold primitive fields only (the inner-position rule that makes a
 * cycle unrepresentable — enforced by C6).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class DefinitionField implements AttributeField {

    private String key;

    private Map<String, String> label;

    private Boolean isRequired;

    /** Required. Names an {@link com.sportconnect.common.attributes.AttributeDefinitionType} in the schema's registry. */
    private String definitionRef;
}
