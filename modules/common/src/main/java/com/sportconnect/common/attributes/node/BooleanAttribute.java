package com.sportconnect.common.attributes.node;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * A true/false ({@code BOOLEAN}) attribute node. Its {@code defaultValue}, if present, is a
 * {@code Boolean}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class BooleanAttribute implements AttributeNode {

    private String key;

    private Map<String, String> label;

    /** Soft delete. See {@link StringAttribute#getIsAvailable()}. */
    private Boolean isAvailable;

    /** Optional placeholder. */
    private Boolean defaultValue;
}
