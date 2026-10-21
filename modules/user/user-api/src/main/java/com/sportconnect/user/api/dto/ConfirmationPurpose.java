package com.sportconnect.user.api.dto;

/**
 * U24: what an emailed confirmation code is for. A code is issued for one purpose and only confirms that one, so a code
 * requested to deactivate the account cannot be used to change the password.
 *
 * <p>{@link #CHANGE_EMAIL} (U26) is the proof of the caller for an email change, mailed to the current address through
 * {@code POST /me/confirmation-code}. {@link #NEW_EMAIL} is the proof of the new mailbox, mailed to the new address by
 * {@code POST /me/email-change-code} only; the generic endpoint refuses it.
 */
public enum ConfirmationPurpose {
    DEACTIVATE,
    CHANGE_PASSWORD,
    CHANGE_EMAIL,
    NEW_EMAIL
}
