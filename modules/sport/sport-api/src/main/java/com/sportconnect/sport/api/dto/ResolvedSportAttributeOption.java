package com.sportconnect.sport.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * {@link SportAttributeOption}, locale-resolved (A13): {@code label} is a single display string
 * for the caller's locale instead of the raw {@code Map<String, String>}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResolvedSportAttributeOption {

    private String value;

    private String label;
}
