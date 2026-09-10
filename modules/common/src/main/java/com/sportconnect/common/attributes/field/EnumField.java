package com.sportconnect.common.attributes.field;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.sportconnect.common.attributes.AttributeLayout;
import com.sportconnect.common.attributes.AttributeOption;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/** A single-choice ({@code ENUM}) definition field. Carries a non-empty {@code options} list. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class EnumField implements AttributeField {

    private String key;

    private Map<String, String> label;

    private Boolean isRequired;

    /** Optional server-opaque presentation hint (C11); shape-checked on admin write, carried raw otherwise. */
    private AttributeLayout layout;

    /** Optional render-suppression flag (C11). Rejected together with {@code isRequired == true}. See {@link AttributeField#getHidden()}. */
    private Boolean hidden;

    /** Required and non-empty. */
    private List<AttributeOption> options;
}
