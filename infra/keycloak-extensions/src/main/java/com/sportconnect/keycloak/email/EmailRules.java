package com.sportconnect.keycloak.email;

import java.util.Locale;
import java.util.Set;

/**
 * A35: the email rule of the realm. Keycloak compares emails as exact lowercase strings, but Gmail delivers
 * {@code bao.nguyen.dangit@gmail.com}, {@code baonguyendangit+x@gmail.com} and {@code baonguyendangit@googlemail.com}
 * to one mailbox, so a Google sign-in would not find the password account of the same person.
 *
 * <p>{@link #normalized} is the comparison key stored in the {@code email_normalized} attribute: lowercase for every
 * domain, and for the Google domains only also without dots and {@code +tag} in the local part, {@code googlemail.com}
 * read as {@code gmail.com}. Other providers keep dots and {@code +} significant (a.b@outlook.com and ab@outlook.com are
 * different people), so nothing else is stripped; widening the table is a one-line change after checking a provider's
 * own documentation. The registered email itself is never changed.
 */
public final class EmailRules {

    public static final String ATTRIBUTE = "email_normalized";

    /** Domains whose local part ignores dots and {@code +tag}; all are one mailbox namespace. */
    private static final Set<String> GOOGLE_DOMAINS = Set.of("gmail.com", "googlemail.com");
    private static final String GOOGLE_CANONICAL_DOMAIN = "gmail.com";

    private EmailRules() {
    }

    /** The comparison key for {@code raw}, or {@code null} for a blank value or one that is not {@code local@domain}. */
    public static String normalized(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String email = raw.trim().toLowerCase(Locale.ROOT);
        int at = email.lastIndexOf('@');
        if (at <= 0 || at == email.length() - 1) {
            return null;
        }
        String local = email.substring(0, at);
        String domain = email.substring(at + 1);
        if (!GOOGLE_DOMAINS.contains(domain)) {
            return email;
        }
        int plus = local.indexOf('+');
        if (plus >= 0) {
            local = local.substring(0, plus);
        }
        local = local.replace(".", "");
        // "+x@gmail.com" or "..@gmail.com" would collapse to nothing: keep the plain lowercase form, never an empty key
        return local.isEmpty() ? email : local + "@" + GOOGLE_CANONICAL_DOMAIN;
    }
}
