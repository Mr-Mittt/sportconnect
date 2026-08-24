package com.sportconnect.sport.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * {@link SportAttributeGroup}, locale-resolved (A13): {@code label} is a single display string
 * for the caller's locale instead of the raw {@code Map<String, String>}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResolvedSportAttributeGroup {

    private String key;

    private String label;

    private Boolean isAvailable;

    private Integer order;

    private List<ResolvedSportAttributeDefinition> attributes;
}
