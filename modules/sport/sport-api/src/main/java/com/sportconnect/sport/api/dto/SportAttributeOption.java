package com.sportconnect.sport.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * One selectable choice on an {@code ENUM} or {@code LIST} attribute (A9).
 *
 * <p>{@code value} is what gets stored on the user's profile and must be unique within its own
 * attribute; {@code label} is display text only and carries no constraint beyond locale coverage.
 *
 * <p>Options are additive by policy: adding one is always safe, removing one that profiles may
 * already hold is not — retire the whole attribute via {@code isAvailable} instead.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SportAttributeOption {

    private String value;

    /**
     * Locale (BCP 47) → display text (A13). Must carry an entry for the enclosing schema's
     * {@code defaultLocale}.
     */
    private Map<String, String> label;
}
