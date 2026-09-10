package com.sportconnect.common.attributes.resolved;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.sportconnect.common.attributes.AttributeLayout;
import com.sportconnect.common.attributes.AttributeType;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * {@link com.sportconnect.common.attributes.field.AttributeField}, locale-resolved and
 * <strong>flattened</strong> (extraction plan D6): the sealed input hierarchy collapses to one
 * flat DTO — {@code type} plus whichever per-kind fields apply, the rest {@code null}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class ResolvedAttributeField {

    private String key;

    private String label;

    private AttributeType type;

    private List<ResolvedAttributeOption> options;

    private Double min;

    private Double max;

    private String definitionRef;

    private Boolean isRequired;

    /**
     * Optional, server-opaque presentation hint (C11), copied verbatim from the raw field.
     * {@code format} inside it stays a raw {@code locale -> pattern} map (client ticket
     * {@code SPORT-16}).
     */
    private AttributeLayout layout;

    /** Optional render-suppression flag (C11), copied verbatim from the raw field. Absent reads as {@code false}. */
    private Boolean hidden;
}
