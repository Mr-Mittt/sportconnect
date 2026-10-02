package com.sportconnect.user.api.dto;

import java.util.Optional;

/**
 * The closed set of values {@code users.gender} may hold (U20). On the wire and in the column it stays a plain
 * string (the {@link #name()}), so the JSON contract and {@code UserResponse.gender} are unchanged; this enum is the
 * server-side definition of which strings are legal.
 *
 * <p>More options (non-binary, prefer-not-to-say) are a product decision, not part of this type yet.
 */
public enum Gender {
    MALE,
    FEMALE;

    /**
     * Parses a wire value strictly: exact, upper-case match only ({@code "male"} and {@code " MALE"} are not
     * accepted - the client sends the upper-case names, so a lenient parse would only hide caller bugs).
     *
     * @param value the raw string from a request; may be {@code null}
     * @return the matching constant, or empty if {@code value} is {@code null} or not one of the names
     */
    public static Optional<Gender> fromWire(String value) {
        if (value == null) {
            return Optional.empty();
        }
        for (Gender gender : values()) {
            if (gender.name().equals(value)) {
                return Optional.of(gender);
            }
        }
        return Optional.empty();
    }
}
