package com.sportconnect.common.attributes.resolved;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * {@link com.sportconnect.common.attributes.AttributeOption}, locale-resolved (C8): {@code label}
 * is a single display string for the caller's locale instead of the raw {@code Map}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ResolvedAttributeOption {

    private String value;

    private String label;
}
