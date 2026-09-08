package com.sportconnect.common.attributes.field;

import com.fasterxml.jackson.annotation.JsonInclude;
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
}
