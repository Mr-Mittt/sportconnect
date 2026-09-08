package com.sportconnect.common.attributes.field;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.sportconnect.common.attributes.AttributeOption;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/** A multi-choice ({@code LIST}) definition field. Carries a non-empty {@code options} list. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class ListField implements AttributeField {

    private String key;

    private Map<String, String> label;

    private Boolean isRequired;

    /** Required and non-empty. */
    private List<AttributeOption> options;
}
