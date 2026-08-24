package com.sportconnect.sport.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * {@link SportAttributeDefinitionType}, locale-resolved (A13). {@code name} carries no label of
 * its own — only {@code fields} needs resolving.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResolvedSportAttributeDefinitionType {

    private String name;

    private List<ResolvedSportAttributeField> fields;
}
