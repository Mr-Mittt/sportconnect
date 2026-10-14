package com.sportconnect.auth.service;

/**
 * A26: what Keycloak's token endpoint returned for a code exchange or a refresh.
 *
 * @param accessToken      the RS256 access token (the API credential, 5 minutes)
 * @param refreshToken     the refresh token, held by the browser only in the httpOnly cookie
 * @param expiresIn        access token lifetime in seconds
 * @param refreshExpiresIn refresh token lifetime in seconds (drives the cookie's {@code Max-Age})
 */
record KeycloakTokens(String accessToken, String refreshToken, long expiresIn, long refreshExpiresIn) {
}
