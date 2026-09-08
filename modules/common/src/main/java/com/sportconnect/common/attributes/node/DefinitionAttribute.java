package com.sportconnect.common.attributes.node;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * A single-record ({@code DEFINITION}) attribute node — value is one {@code Map<String, Object>}
 * shaped by the definition named in {@code definitionRef}. Never carries a {@code defaultValue}
 * (a prefilled record would read as the user's own data).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class DefinitionAttribute implements AttributeNode {

    private String key;

    private Map<String, String> label;

    /** Soft delete. See {@link StringAttribute#getIsAvailable()}. */
    private Boolean isAvailable;

    /** Required. Names an {@link com.sportconnect.common.attributes.AttributeDefinitionType} in the schema's registry. */
    private String definitionRef;

    /** Optional pool name for entity-linking typeahead; only meaningful on record types. */
    private String searchScope;
}
