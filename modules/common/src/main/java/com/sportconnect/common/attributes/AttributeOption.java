package com.sportconnect.common.attributes;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * One selectable choice on an {@code ENUM} or {@code LIST} node (or field).
 *
 * <p>{@code value} is what gets stored and must be unique within its own node; {@code label} is
 * display text only. Options are additive by policy — removing one that stored values may hold is
 * unsafe; retire the whole node via {@code isAvailable} instead.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class AttributeOption {

    private String value;

    /** Locale (BCP 47) → display text. Must carry an entry for the schema's {@code defaultLocale}. */
    private Map<String, String> label;
}
