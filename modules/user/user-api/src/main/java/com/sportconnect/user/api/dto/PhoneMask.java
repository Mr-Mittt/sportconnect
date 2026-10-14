package com.sportconnect.user.api.dto;

/**
 * U23: last-resort display text for a user who has no name, username or email (a phone-only account). Shows the
 * leading country code and the last two digits only, so a number is recognisable to its owner but is not shown to
 * other users in full.
 */
public final class PhoneMask {

    private static final int KEEP_PREFIX = 3;
    private static final int KEEP_SUFFIX = 2;

    private PhoneMask() {
    }

    /**
     * @param phone an E.164 number such as {@code +84901234567}
     * @return {@code +84•••••••67}; {@code null} for {@code null}/blank; the input unchanged when it is too short to mask
     */
    public static String mask(String phone) {
        if (phone == null || phone.isBlank()) {
            return null;
        }
        if (phone.length() <= KEEP_PREFIX + KEEP_SUFFIX) {
            return phone;
        }
        return phone.substring(0, KEEP_PREFIX)
                + "\u2022".repeat(phone.length() - KEEP_PREFIX - KEEP_SUFFIX)
                + phone.substring(phone.length() - KEEP_SUFFIX);
    }
}
