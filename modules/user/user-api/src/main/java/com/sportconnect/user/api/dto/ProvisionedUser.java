package com.sportconnect.user.api.dto;

/**
 * A28: the outcome of {@code UserService.provisionExternalUser}.
 *
 * @param user    the account, as it is stored
 * @param created {@code true} only for the call that inserted the row; a sign-in that finds an existing account (including
 *                the loser of a first-sign-in race, which re-reads the winner's row) gets {@code false}. This is what lets
 *                the caller do something exactly once per account, such as the welcome email.
 */
public record ProvisionedUser(UserResponse user, boolean created) {
}
