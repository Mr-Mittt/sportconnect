package com.sportconnect.user.service;

import com.google.i18n.phonenumbers.NumberParseException;
import com.google.i18n.phonenumbers.PhoneNumberUtil;
import com.google.i18n.phonenumbers.Phonenumber.PhoneNumber;
import com.sportconnect.common.exception.BadRequestException;

/**
 * U23: the one place a user-typed phone number becomes the value stored in {@code users.phone_number}.
 *
 * <p>The stored form is E.164 ({@code +84901234567}). A number typed without a country code is read as Vietnamese
 * (region {@code VN}), so {@code 0901234567}, {@code 090 123 4567} and {@code +84901234567} are the same number and
 * therefore collide on the unique column. A foreign number needs its leading {@code +}. A27's Keycloak validator is
 * meant to apply the same rule.
 */
final class PhoneNumbers {

    static final String DEFAULT_REGION = "VN";

    private static final PhoneNumberUtil UTIL = PhoneNumberUtil.getInstance();

    private PhoneNumbers() {
    }

    /**
     * @param raw what the caller typed; {@code null} or blank means "no phone"
     * @return the E.164 form, or {@code null} for {@code null}/blank input
     * @throws BadRequestException {@code INVALID_PHONE_NUMBER} when the text does not parse or is not a valid number
     *                             for its region
     */
    static String normalize(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            PhoneNumber parsed = UTIL.parse(raw.trim(), DEFAULT_REGION);
            if (!UTIL.isValidNumber(parsed)) {
                throw invalid();
            }
            return UTIL.format(parsed, PhoneNumberUtil.PhoneNumberFormat.E164);
        } catch (NumberParseException e) {
            throw invalid();
        }
    }

    private static BadRequestException invalid() {
        return new BadRequestException("INVALID_PHONE_NUMBER", "Phone number is not valid", null);
    }
}
