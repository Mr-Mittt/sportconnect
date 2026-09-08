package com.sportconnect.common.attributes.resolved;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * {@link com.sportconnect.common.attributes.AttributeDefinitionType}, locale-resolved (C8):
 * every field's {@code label} collapsed to one string.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ResolvedAttributeDefinitionType {

    private String name;

    private List<ResolvedAttributeField> fields;
}
