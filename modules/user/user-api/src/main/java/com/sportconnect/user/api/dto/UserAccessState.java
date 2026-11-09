package com.sportconnect.user.api.dto;

/**
 * A25: what the per-request authentication gate needs to know about a user from our own database, and nothing else.
 *
 * <p>A37: roles are no longer part of it. They come from the verified Keycloak access token
 * ({@code realm_access.roles}); only the active flag is ours, because Keycloak knows nothing about a deactivated account.
 *
 * @param isActive {@code false} for a deactivated account, which must not be authenticated
 */
public record UserAccessState(boolean isActive) {
}
