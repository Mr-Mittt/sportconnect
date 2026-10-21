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

    /**
     * A33: whether Keycloak holds the user's email as verified (the built-in {@code emailVerified}). Keycloak is the
     * source of truth; {@code users.is_email_verified} is a copy that follows it.
     *
     * @throws com.sportconnect.common.exception.ResourceNotFoundException when Keycloak has no such user
     * @throws com.sportconnect.common.exception.ServiceUnavailableException when Keycloak cannot be reached or this
     *         app's credentials client is misconfigured
     */
    boolean isEmailVerified(UUID userId);

    /**
     * A33: asks Keycloak to email the user its verification link (the realm's themed mail, in the user's locale); opening
     * it sets {@code emailVerified}. The link comes back to the web app and lives {@code app.keycloak.verification-link-lifespan}.
     *
     * @throws com.sportconnect.common.exception.BadRequestException with {@code VERIFICATION_EMAIL_UNAVAILABLE} when
     *         Keycloak has no email for the user
     * @throws com.sportconnect.common.exception.ResourceNotFoundException when Keycloak has no such user
     * @throws com.sportconnect.common.exception.ServiceUnavailableException when Keycloak cannot be reached or this
     *         app's credentials client is misconfigured
     */
    void sendVerificationEmail(UUID userId);

    /**
     * U26: whether another account already holds {@code email}, by the A35 rule: the same mailbox whatever the dots,
     * {@code +tag} or {@code googlemail.com} spelling of a Gmail address (compared by the {@code email_normalized} key),
     * and the exact address for an account that has no key yet. The user's own account is not a clash.
     *
     * @param email the address to check (any case, surrounding blanks ignored)
     * @param exceptUserId the account asking, never counted as a holder
     * @throws com.sportconnect.common.exception.ServiceUnavailableException when Keycloak cannot be reached or this
     *         app's credentials client is misconfigured
     */
    boolean isEmailRegistered(String email, UUID exceptUserId);

    /**
     * U26: moves the account to {@code newEmail} in Keycloak, in one update, and cuts every tie to the old address.
     *
     * <p>Flow: read the user; write back the whole record (an update replaces the attribute map) with the new email,
     * {@code emailVerified=true} (the caller has just proven the mailbox with a code), the recomputed
     * {@code email_normalized} key, no {@code picture} attribute (a Google avatar), and the username moved to the new
     * address when it was the old one (the A35 key decides); then delete every federated identity (the Google link), so
     * two emails cannot sign in to one account. The update goes first because it is the step that can be refused; if the
     * unlink then fails the call fails with a 503 and the account already holds the new address, so a repeat of the same
     * change completes it.
     *
     * @throws com.sportconnect.common.exception.ConflictException with {@code EMAIL_ALREADY_REGISTERED} when Keycloak
     *         refuses the address as taken (exact or by the A35 key)
     * @throws com.sportconnect.common.exception.ResourceNotFoundException when Keycloak has no such user
     * @throws com.sportconnect.common.exception.ServiceUnavailableException when Keycloak cannot be reached, this app's
     *         credentials client is misconfigured, or Keycloak refuses for any other reason
     */
    void replaceEmail(UUID userId, String newEmail);
}
