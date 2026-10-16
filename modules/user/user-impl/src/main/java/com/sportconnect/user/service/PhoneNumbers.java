package com.sportconnect.user.service;

import com.google.i18n.phonenumbers.NumberParseException;
import com.google.i18n.phonenumbers.PhoneNumberUtil;
import com.google.i18n.phonenumbers.Phonenumber.PhoneNumber;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.user.api.dto.PhoneStatus;

/**
 * U23: the one place a user-typed phone number becomes the value stored in {@code users.phone_number}.
 *
 * <p>The stored form is E.164 ({@code +84901234567}). A number typed without a country code is read as Vietnamese
 * (region {@code VN}), so {@code 0901234567}, {@code 090 123 4567} and {@code +84901234567} are the same number and
 * therefore collide on the unique column. A foreign number needs its leading {@code +}. A27's Keycloak validator is
 * meant to apply the same rule.
 *
 * <p>Two entry points. {@link #normalize} is strict (throws) and is for a caller that can still ask the user again.
 * {@link #classify} never throws: a number that does not parse is kept as typed with {@link PhoneStatus#INVALID}, which
 * is how first sign-in (the Keycloak account already exists) and Account Settings accept it.
 */
final class PhoneNumbers {

    static final String DEFAULT_REGION = "VN";

    /** {@code users.phone_number} is VARCHAR(20); an invalid value is cut to fit rather than refused. */
    static final int MAX_STORED_LENGTH = 20;

    private static final PhoneNumberUtil UTIL = PhoneNumberUtil.getInstance();

    private PhoneNumbers() {
    }

    /** What to store for a phone: the value and how far it can be trusted. */
    record Classified(String number, PhoneStatus status) {
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
        String e164 = parseE164(raw);
        if (e164 == null) {
            throw invalid();
        }
        return e164;
    }

    /**
     * @param raw what the caller typed; {@code null} or blank means "no phone"
     * @return {@code null} for no phone; otherwise E.164 with {@link PhoneStatus#VALID}, or the trimmed text (cut to
     *         {@link #MAX_STORED_LENGTH}) with {@link PhoneStatus#INVALID}. Never throws.
     */
    static Classified classify(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String e164 = parseE164(raw);
        if (e164 != null) {
            return new Classified(e164, PhoneStatus.VALID);
        }
        String kept = raw.trim();
        if (kept.length() > MAX_STORED_LENGTH) {
            kept = kept.substring(0, MAX_STORED_LENGTH);
        }
        return new Classified(kept, PhoneStatus.INVALID);
    }

    private static String parseE164(String raw) {
        try {
            PhoneNumber parsed = UTIL.parse(raw.trim(), DEFAULT_REGION);
            return UTIL.isValidNumber(parsed) ? UTIL.format(parsed, PhoneNumberUtil.PhoneNumberFormat.E164) : null;
        } catch (NumberParseException e) {
            return null;
        }
    }

    private static BadRequestException invalid() {
        return new BadRequestException("INVALID_PHONE_NUMBER", "Phone number is not valid", null);
    }
}
