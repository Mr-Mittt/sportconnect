package com.sportconnect.location.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Result of parsing/resolving a pasted Google Maps URL. Nothing is persisted by this call —
 * {@code latitude}/{@code longitude} are null when coordinates couldn't be detected (e.g. an
 * unresolvable short link), and the caller is expected to let the user enter/adjust them
 * manually rather than treat this as a hard failure.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResolvedMapsUrlResponse {

    private Double latitude;

    private Double longitude;

    private String suggestedName;
}
