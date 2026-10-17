package com.sportconnect.keycloak;

import com.google.i18n.phonenumbers.NumberParseException;
import com.google.i18n.phonenumbers.PhoneNumberUtil;
import com.google.i18n.phonenumbers.Phonenumber.PhoneNumber;

/**
 * A27: the phone rule of the realm, the same as the backend's {@code PhoneNumbers} (U23, U25): libphonenumber with
 * default region {@code VN}, so {@code 0901234567} and {@code +84901234567} are one number.
 *
 * <p>Nothing here refuses a phone for its format. A number that parses is replaced by its E.164 form; one that does
 * not is kept as the user typed it (trimmed), and that raw text is what gets compared for uniqueness. The backend
 * saves such a phone as {@code INVALID} at first sign-in, and an {@code INVALID} phone is not an identifier.
 */
public final class PhoneRules {

    public static final String ATTRIBUTE = "phoneNumber";
    static final String DEFAULT_REGION = "VN";

    private static final PhoneNumberUtil UTIL = PhoneNumberUtil.getInstance();

    private PhoneRules() {
    }

    /** E.164 when {@code raw} is a valid number, otherwise {@code null}. */
    public static String toE164(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            PhoneNumber parsed = UTIL.parse(raw.trim(), DEFAULT_REGION);
            return UTIL.isValidNumber(parsed) ? UTIL.format(parsed, PhoneNumberUtil.PhoneNumberFormat.E164) : null;
        } catch (NumberParseException e) {
            return null;
        }
    }

    /** What is stored and compared: the E.164 form if the number parses, else the trimmed raw text; {@code null} if blank. */
    public static String canonical(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String e164 = toE164(raw);
        return e164 != null ? e164 : raw.trim();
    }

    /** True when the text is a number the backend would accept as an identifier. */
    public static boolean isUsableIdentifier(String raw) {
        return toE164(raw) != null;
    }
}
