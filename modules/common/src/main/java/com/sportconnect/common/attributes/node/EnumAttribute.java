package com.sportconnect.common.attributes.node;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.sportconnect.common.attributes.AttributeLayout;
import com.sportconnect.common.attributes.AttributeOption;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * A single-choice ({@code ENUM}) attribute node. Carries a non-empty {@code options} list; its
 * {@code defaultValue}, if present, is one of the option values.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class EnumAttribute implements AttributeNode {

    private String key;

    private Map<String, String> label;

    /** Optional server-opaque presentation hint (C11); shape-checked on admin write, carried raw otherwise. */
    private AttributeLayout layout;

    /** Optional render-suppression flag (C11). Absent reads as {@code false}. See {@link AttributeNode#getHidden()}. */
    private Boolean hidden;

    /** Soft delete. See {@link StringAttribute#getIsAvailable()}. */
    private Boolean isAvailable;

    /** Required and non-empty. */
    private List<AttributeOption> options;

    /** Optional placeholder; must equal one of {@link #options}' values. {@code Object} so a non-string is rejected, not coerced. */
    private Object defaultValue;
}
