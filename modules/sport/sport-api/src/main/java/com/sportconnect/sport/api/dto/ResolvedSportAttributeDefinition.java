package com.sportconnect.sport.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * {@link SportAttributeDefinition}, locale-resolved (A13): {@code label} is a single display
 * string for the caller's locale instead of the raw {@code Map<String, String>}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResolvedSportAttributeDefinition {

    private String key;

    private String label;

    private SportAttributeType type;

    private List<ResolvedSportAttributeOption> options;

    private Boolean isAvailable;

    private Integer order;

    private Object defaultValue;

    /** Inclusive bounds for a {@code NUMBER} attribute (A16); {@code null} for every other type. */
    private Double min;

    private Double max;

    private String definitionRef;

    private String searchScope;
}
