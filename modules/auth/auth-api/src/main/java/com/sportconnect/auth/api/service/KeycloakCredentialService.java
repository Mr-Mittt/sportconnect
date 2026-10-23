package com.sportconnect.auth.api.service;

import java.util.UUID;

/**
 * U24: the user's password lives only in Keycloak, so confirming the current one and setting a new one are asked of
 * Keycloak (the backend keeps no password of its own). Users are identified by the {@code users.id}, which equals the
 * Keycloak user id (the token {@code sub}).
 */
public interface KeycloakCredentialService {

    /**
     * Asks Keycloak whether {@code password} is the user's current password, through a password grant whose tokens are
     * discarded (only the answer is used). A user with no password (a social-only account), an unknown user and a wrong
     * password all answer {@code false}; Keycloak's own brute-force detection counts the failures.
     *
     * @return {@code true} when Keycloak accepted the password
     * @throws com.sportconnect.common.exception.ServiceUnavailableException when Keycloak cannot be reached or this
     *         app's credentials client is misconfigured (nothing the user did, nothing changed)
     */
    boolean verifyPassword(UUID userId, String password);

    /**
     * Sets the user's password in Keycloak (permanent, not a temporary one), replacing the current one or creating the
     * first one for a social-only account. The caller has already confirmed the user's identity.
     *
     * @throws com.sportconnect.common.exception.BadRequestException with {@code NEW_PASSWORD_REJECTED} when the realm's
     *         password policy refuses the value (nothing changed)
     * @throws com.sportconnect.common.exception.ResourceNotFoundException when Keycloak has no such user
     * @throws com.sportconnect.common.exception.ServiceUnavailableException when Keycloak cannot be reached or this
     *         app's credentials client is misconfigured
     */
    void setPassword(UUID userId, String newPassword);
}
