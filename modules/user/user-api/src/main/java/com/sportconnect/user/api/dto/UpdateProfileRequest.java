package com.sportconnect.user.api.dto;

import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class UpdateProfileRequest {

    @Size(max = 100, message = "First name must not exceed 100 characters")
    private String firstName;

    @Size(max = 100, message = "Last name must not exceed 100 characters")
    private String lastName;

    @Size(min = 3, max = 50, message = "Username must be between 3 and 50 characters")
    private String username;

    @Size(max = 20, message = "Phone number must not exceed 20 characters")
    private String phoneNumber;

    private LocalDate dateOfBirth;

    /**
     * One of {@link Gender}'s names ({@code "MALE"}, {@code "FEMALE"}), exact upper-case. {@code null} skips the
     * field; the empty string clears it (stored as {@code NULL}); anything else is a {@code 400}. Kept a
     * {@code String} rather than the enum type so {@code ""} and {@code null} stay distinguishable - binding an enum
     * would collapse both (or reject {@code ""}).
     */
    private String gender;

    @Size(max = 500, message = "Bio must not exceed 500 characters")
    private String bio;

    private String avatarUrl;

    private String coverUrl;

    private LocationRequest location;

    private String city;

    /**
     * {@code countries.id} from the reference domain. Replaces the free-text {@code country} field this request
     * used to carry (U16): an old client that still sends {@code "country"} has it silently ignored, not rejected.
     *
     * <p>When present, {@link #regionId} <strong>replaces</strong> the stored region — so an absent {@code regionId}
     * clears it; send both together. Validated by {@code ReferenceService.requireValidSelection} ({@code 400}).
     * Clearing a country once set is not supported.
     */
    private Long countryId;

    /**
     * {@code regions.id}. With {@link #countryId} it is the new region (nullable = none). Alone, it is validated
     * against the user's stored country ({@code 400} if there is none or the region belongs elsewhere).
     */
    private Long regionId;

    private Integer heightCm;

    private BigDecimal weightKg;

    private Integer shoeSizeCm;
}
