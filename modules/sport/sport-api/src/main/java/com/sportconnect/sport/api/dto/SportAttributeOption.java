package com.sportconnect.sport.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * One selectable choice on an {@code ENUM} or {@code LIST} attribute (A9).
 *
 * <p>{@code value} is what gets stored on the user's profile and must be unique within its own
 * attribute; {@code label} is display text only and carries no constraint.
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

    private String label;
}
