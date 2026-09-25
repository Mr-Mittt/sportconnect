package com.sportconnect.reference.api.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * What a browser can tell us about where the user is, sent to {@code POST /api/reference/resolve}. Every field is
 * optional; the server matches whatever is present to reference rows and never guesses.
 *
 * <p>Only size and range violations are rejected ({@code 400}). Content that merely fails to match — an
 * unparseable locale tag, an unknown timezone id — is ignored, because a pre-fill must not fail a sign-up.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ResolveGeoRequest {

    /** {@code navigator.languages}, most preferred first, e.g. {@code ["vi-VN", "en-US"]}. At most 10 entries of at most 35 characters. */
    @Size(max = 10, message = "At most 10 locales are accepted")
    private List<@Size(max = 35, message = "A locale must be at most 35 characters") String> locales;

    /** IANA zone id from {@code Intl.DateTimeFormat().resolvedOptions().timeZone}, e.g. {@code Asia/Ho_Chi_Minh}. */
    @Size(max = 64, message = "timeZoneId must be at most 64 characters")
    private String timeZoneId;

    /** WGS 84 latitude in degrees. Send together with {@link #longitude} or not at all. */
    @DecimalMin(value = "-90.0", message = "latitude must be between -90 and 90")
    @DecimalMax(value = "90.0", message = "latitude must be between -90 and 90")
    private Double latitude;

    /** WGS 84 longitude in degrees. Send together with {@link #latitude} or not at all. */
    @DecimalMin(value = "-180.0", message = "longitude must be between -180 and 180")
    @DecimalMax(value = "180.0", message = "longitude must be between -180 and 180")
    private Double longitude;

    /** Bean-validation hook for the both-or-neither rule. Read-only: never sent by a client, and unknown JSON properties are ignored. */
    @AssertTrue(message = "latitude and longitude must be provided together")
    public boolean isCoordinatePairComplete() {
        return (latitude == null) == (longitude == null);
    }
}
