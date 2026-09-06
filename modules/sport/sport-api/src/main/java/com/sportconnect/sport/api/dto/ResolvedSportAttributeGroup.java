package com.sportconnect.sport.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * {@link SportAttributeGroup}, locale-resolved (A13): {@code label} is a single display string
 * for the caller's locale instead of the raw {@code Map<String, String>}.
 *
 * <p>Carries the nested {@link #groups} tree (v3/A19); display order is array position, so there
 * is no {@code order} field.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResolvedSportAttributeGroup {

    private String key;

    private String label;

    private Boolean isAvailable;

    private List<ResolvedSportAttributeGroup> groups;

    private List<ResolvedSportAttributeDefinition> attributes;
}
