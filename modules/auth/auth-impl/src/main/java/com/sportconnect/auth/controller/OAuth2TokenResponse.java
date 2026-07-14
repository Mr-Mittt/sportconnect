package com.sportconnect.auth.controller;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Standard OAuth2 password-grant token response shape (RFC 6749 §5.1) — snake_case field names
 * are the spec's wire format, not this codebase's usual camelCase convention. Swagger UI's OAuth2
 * Authorize dialog parses exactly this shape after {@link SwaggerOAuth2TokenController} responds;
 * nothing else in the app ever produces or consumes this type.
 */
record OAuth2TokenResponse(
        @JsonProperty("access_token") String accessToken,
        @JsonProperty("token_type") String tokenType,
        @JsonProperty("expires_in") long expiresIn) {
}
