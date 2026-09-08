package com.sportconnect.common.attributes.field;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/** A numeric ({@code NUMBER}) definition field — the only field kind that carries {@code min}/{@code max}. */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class NumberField implements AttributeField {

    private String key;

    private Map<String, String> label;

    private Boolean isRequired;

    /** Optional inclusive lower bound. */
    private Double min;

    /** Optional inclusive upper bound. */
    private Double max;
}
