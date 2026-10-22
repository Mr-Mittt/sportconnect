package com.sportconnect.user.api.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.UUID;

/**
 * A26: who Keycloak says a user is, as read from a verified access token, handed to
 * {@code UserService.provisionExternalUser} at the first sign-in. Every field except {@link #id} may be absent.
 *
 * <p>{@code id} is the token's {@code sub}; it becomes {@code users.id}, so the token subject resolves to the row with
 * no mapping table.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ExternalIdentity {
    private UUID id;
    private String email;
    /** The token's {@code email_verified}; becomes {@code users.is_email_verified}. */
    private boolean emailVerified;
    /** The token's {@code preferred_username}. */
    private String username;
    private String firstName;
    private String lastName;
    /** The token's {@code name}; split into first and last name only when both are absent. */
    private String fullName;
    /** Any text: a number that parses is stored as E.164 (VALID), anything else as typed (INVALID, U25), never a failure. */
    private String phoneNumber;
    /** The token's {@code locale}; kept as the language preference only when it is an active language. */
    private String languageCode;
    /**
     * A32: the token's {@code country_id} ({@code countries.id}), set by the register page. Untrusted: an unknown or
     * inactive country is ignored, never a failure (see {@code UserService.provisionExternalUser}).
     */
    private Long countryId;
    /** A32: the token's {@code region_id}; kept only with a valid {@link #countryId} it belongs to. */
    private Long regionId;
    /** A32: the token's {@code latitude}; kept only as an in-range pair with {@link #longitude}. */
    private Double latitude;
    /** A32: the token's {@code longitude} (WGS 84). */
    private Double longitude;
}
