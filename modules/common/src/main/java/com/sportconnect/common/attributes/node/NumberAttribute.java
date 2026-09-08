package com.sportconnect.common.attributes.node;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * A numeric ({@code NUMBER}) attribute node — the only kind that carries {@code min}/{@code max}.
 * Bounds are inclusive; {@code min <= max} when both are set (enforced by the validator, C6).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class NumberAttribute implements AttributeNode {

    private String key;

    private Map<String, String> label;

    /** Soft delete. See {@link StringAttribute#getIsAvailable()}. */
    private Boolean isAvailable;

    /**
     * Optional placeholder. Typed {@code Number} (not {@code Double}) so a JSON integer literal
     * round-trips as an integer rather than widening to {@code 19.0}.
     */
    private Number defaultValue;

    /** Optional inclusive lower bound. */
    private Double min;

    /** Optional inclusive upper bound. */
    private Double max;
}
