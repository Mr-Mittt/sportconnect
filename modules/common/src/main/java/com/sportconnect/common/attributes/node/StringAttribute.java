package com.sportconnect.common.attributes.node;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * A free-text ({@code STRING}) attribute node. Its {@code defaultValue}, if present, is a plain
 * {@code String}.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public final class StringAttribute implements AttributeNode {

    private String key;

    private Map<String, String> label;

    /** Soft delete. When {@code false} the attribute is not offered on writes; stored values remain readable. */
    private Boolean isAvailable;

    /** Optional placeholder; must be a {@code String} the write path would accept. */
    private String defaultValue;
}
