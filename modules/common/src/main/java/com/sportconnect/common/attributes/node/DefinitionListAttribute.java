package com.sportconnect.common.attributes.node;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * A repeating-record ({@code DEFINITION_LIST}) attribute node — value is a
 * {@code List<Map<String, Object>>}, each element shaped by {@code definitionRef}. A write replaces
 * the whole list. Never carries a {@code defaultValue}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class DefinitionListAttribute implements AttributeNode {

    private String key;

    private Map<String, String> label;

    /** Soft delete. See {@link StringAttribute#getIsAvailable()}. */
    private Boolean isAvailable;

    /** Required. Names an {@link com.sportconnect.common.attributes.AttributeDefinitionType} in the schema's registry. */
    private String definitionRef;

    /** Optional pool name for entity-linking typeahead; only meaningful on record types. */
    private String searchScope;
}
