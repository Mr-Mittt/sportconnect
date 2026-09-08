package com.sportconnect.common.attributes.node;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.sportconnect.common.attributes.AttributeOption;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

/**
 * A multi-choice ({@code LIST}) attribute node. Carries a non-empty {@code options} list; its
 * {@code defaultValue}, if present, is a list of option values (an empty list is valid).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class ListAttribute implements AttributeNode {

    private String key;

    private Map<String, String> label;

    /** Soft delete. See {@link StringAttribute#getIsAvailable()}. */
    private Boolean isAvailable;

    /** Required and non-empty. */
    private List<AttributeOption> options;

    /** Optional placeholder; every element must be one of {@link #options}' values. */
    private List<String> defaultValue;
}
