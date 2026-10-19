package com.sportconnect.user.api.dto;

/**
 * U24: what an emailed confirmation code is for. A code is issued for one purpose and only confirms that one, so a code
 * requested to deactivate the account cannot be used to change the password.
 */
public enum ConfirmationPurpose {
    DEACTIVATE,
    CHANGE_PASSWORD
}
