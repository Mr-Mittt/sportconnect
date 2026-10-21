package com.sportconnect.auth.service;

import java.util.Locale;
import java.util.Set;

/**
 * U26: the backend's copy of the A35 email rule, which lives in the Keycloak extensions JAR
 * ({@code com.sportconnect.keycloak.email.EmailRules}). The JAR is a separate Gradle project and cannot import the app's
 * modules, so the rule is written twice and pinned by one shared table of examples
 * ({@code infra/keycloak-extensions/src/test/resources/email-rules-examples.csv}, read by both specs).
 *
 * <p>{@link #normalized} is the comparison key kept in the Keycloak {@code email_normalized} attribute: lowercase for every
 * domain, and for the Google domains also without dots and {@code +tag} in the local part, {@code googlemail.com} read as
 * {@code gmail.com}. Other providers keep dots and {@code +} significant. The registered address is never changed.
 */
final class EmailRules {

    /** The Keycloak user attribute that holds the key. */
    static final String ATTRIBUTE = "email_normalized";

    private static final Set<String> GOOGLE_DOMAINS = Set.of("gmail.com", "googlemail.com");
    private static final String GOOGLE_CANONICAL_DOMAIN = "gmail.com";

    private EmailRules() {
    }

    /** The comparison key for {@code raw}, or {@code null} for a blank value or one that is not {@code local@domain}. */
    static String normalized(String raw) {
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
