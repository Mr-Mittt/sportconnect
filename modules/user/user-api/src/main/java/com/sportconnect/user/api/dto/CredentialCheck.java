package com.sportconnect.user.api.dto;

/**
 * Outcome of {@code UserService.verifyCredentials}. {@code MATCH_INACTIVE} is only ever returned for a
 * correct password, so a caller can offer re-activation without revealing an account's state to someone
 * who does not hold the password.
 */
public enum CredentialCheck {
    /** Unknown email or wrong password. */
    NO_MATCH,
    /** Correct password, active account. */
    MATCH,
    /** Correct password, but the account is deactivated. */
    MATCH_INACTIVE
}
