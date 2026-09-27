package com.sportconnect.user.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * The optional extras a user can supply at sign-up (U16), passed from {@code AuthService.register} to
 * {@code UserService.createUser}. Every field is optional; an all-null instance is the same as none.
 *
 * <p>{@code countryId}/{@code regionId} are reference-domain ids and are validated by {@code createUser}
 * ({@code ReferenceService.requireValidSelection}); {@code languageCode} must be an active language code. The
 * coordinates come from an explicit "Use my current location" action in the client, are both-or-neither, and are
 * saved to the profile's location point. They are <em>not</em> required to agree with the chosen country and
 * region (a traveller may sign up abroad) — the dropdown choices win.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UserRegistrationDetails {

    /** A {@code languages.code}; becomes the user's {@code UserPreference.language}. */
    private String languageCode;

    private Long countryId;

    private Long regionId;

    private Double latitude;

    private Double longitude;
}
