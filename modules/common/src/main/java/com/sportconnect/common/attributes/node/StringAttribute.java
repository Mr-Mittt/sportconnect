package com.sportconnect.common.attributes.node;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.sportconnect.common.attributes.AttributeLayout;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * A free-text ({@code STRING}) attribute node.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class StringAttribute implements AttributeNode {

    private String key;

    private Map<String, String> label;

    /** Optional server-opaque presentation hint (C11); shape-checked on admin write, carried raw otherwise. */
    private AttributeLayout layout;

    /** Optional render-suppression flag (C11). Absent reads as {@code false}. See {@link AttributeNode#getHidden()}. */
    private Boolean hidden;

    /** Soft delete. When {@code false} the attribute is not offered on writes; stored values remain readable. */
    private Boolean isAvailable;

    /**
     * Optional placeholder. Typed {@code Object} (not {@code String}) so the value validator's
     * {@code instanceof} check — not Jackson's scalar coercion — decides validity, matching the
     * sport framework exactly (a JSON {@code 42} here is rejected, never coerced to {@code "42"}).
     */
    private Object defaultValue;
}
