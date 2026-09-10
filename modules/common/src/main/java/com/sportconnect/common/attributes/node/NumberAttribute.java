package com.sportconnect.common.attributes.node;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.sportconnect.common.attributes.AttributeLayout;
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

    /** Optional server-opaque presentation hint (C11); shape-checked on admin write, carried raw otherwise. */
    private AttributeLayout layout;

    /** Optional render-suppression flag (C11). Absent reads as {@code false}. See {@link AttributeNode#getHidden()}. */
    private Boolean hidden;

    /** Soft delete. See {@link StringAttribute#getIsAvailable()}. */
    private Boolean isAvailable;

    /**
     * Optional placeholder. Typed {@code Object} (not {@code Number}) so a JSON integer literal
     * round-trips as an integer (not widened to {@code 19.0}) <em>and</em> a JSON string like
     * {@code "27"} stays a {@code String} for the value validator to reject — matching the sport
     * framework, rather than letting Jackson coerce it to a number.
     */
    private Object defaultValue;

    /** Optional inclusive lower bound. */
    private Double min;

    /** Optional inclusive upper bound. */
    private Double max;
}
