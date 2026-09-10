package com.sportconnect.common.attributes.field;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.sportconnect.common.attributes.AttributeLayout;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/** A true/false ({@code BOOLEAN}) definition field. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class BooleanField implements AttributeField {

    private String key;

    private Map<String, String> label;

    private Boolean isRequired;

    /** Optional server-opaque presentation hint (C11); shape-checked on admin write, carried raw otherwise. */
    private AttributeLayout layout;

    /** Optional render-suppression flag (C11). Rejected together with {@code isRequired == true}. See {@link AttributeField#getHidden()}. */
    private Boolean hidden;
}
