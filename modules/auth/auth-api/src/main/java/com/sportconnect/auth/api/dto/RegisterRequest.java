package com.sportconnect.auth.api.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RegisterRequest {

    @NotBlank(message = "Email is required")
    @Email(message = "Email must be valid")
    private String email;

    @NotBlank(message = "Password is required")
    @Size(min = 8, message = "Password must be at least 8 characters")
    private String password;

    @NotBlank(message = "Full name is required")
    @Size(max = 200, message = "Full name must not exceed 200 characters")
    private String fullName;

    @Size(max = 20, message = "Phone number must not exceed 20 characters")
    private String phoneNumber;

    // ---- U16: optional geo / language extras. All may be omitted; an old client that sends none is unaffected. ----

    /** A {@code languages.code}, e.g. {@code vi}. An unknown or inactive code is a {@code 400}. Becomes the preference language. */
    @Size(max = 35, message = "Language code must not exceed 35 characters")
    private String languageCode;

    /** {@code countries.id} from {@code GET /api/reference/countries}. */
    private Long countryId;

    /** {@code regions.id}; requires {@link #countryId} and must belong to that country. */
    private Long regionId;

    /** WGS 84 latitude, sent only after an explicit "Use my current location" action. Both-or-neither with longitude. */
    @DecimalMin(value = "-90.0", message = "latitude must be between -90 and 90")
    @DecimalMax(value = "90.0", message = "latitude must be between -90 and 90")
    private Double latitude;

    /** WGS 84 longitude; see {@link #latitude}. */
    @DecimalMin(value = "-180.0", message = "longitude must be between -180 and 180")
    @DecimalMax(value = "180.0", message = "longitude must be between -180 and 180")
    private Double longitude;

    /** Bean-validation hook for the both-or-neither rule. Read-only: never sent by a client. */
    @AssertTrue(message = "latitude and longitude must be provided together")
    public boolean isCoordinatePairComplete() {
        return (latitude == null) == (longitude == null);
    }
}
