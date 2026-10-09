package com.sportconnect.auth.service;

import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Optional;

/**
 * The localised text of the emails this module sends (A10: the password-reset email; A13 adds the other two).
 *
 * <p>Bundles live at {@code email/<name>_<language>.properties} (UTF-8) and are the only place a language is
 * "supported" for email: a language that is active in the reference data but has no bundle here is not usable, so
 * {@link #resolveLanguage} falls back to English instead of failing at send time.
 */
@Component
public class EmailMessages {

    static final String DEFAULT_LANGUAGE = "en";
    private static final String BUNDLE_DIR = "email/";

    private final ResourceBundleMessageSource messages = new ResourceBundleMessageSource();

    public EmailMessages() {
        messages.setBasenames(BUNDLE_DIR + "reset-password");
        messages.setDefaultEncoding("UTF-8");
        messages.setFallbackToSystemLocale(false);
    }

    /**
     * Picks the language to send in: the candidate's primary subtag ({@code vi-VN} → {@code vi}) when an email
     * bundle exists for it, otherwise English. Never returns a language without a bundle.
     */
    public String resolveLanguage(Optional<String> candidate) {
        return candidate
                .map(code -> code.trim().toLowerCase(Locale.ROOT))
                .map(code -> code.split("[-_]", 2)[0])
                .filter(this::hasBundle)
                .orElse(DEFAULT_LANGUAGE);
    }

    /** Subject of the password-reset email in {@code language} (a value returned by {@link #resolveLanguage}). */
    public String resetPasswordSubject(String language) {
        return messages.getMessage("subject", null, Locale.forLanguageTag(language));
    }

    /** Body of the password-reset email in {@code language}; {@code minutes} is how long the link stays valid. */
    public String resetPasswordBody(String language, String resetLink, long minutes) {
        return messages.getMessage("body", new Object[]{resetLink, String.valueOf(minutes)},
                Locale.forLanguageTag(language));
    }

    private boolean hasBundle(String language) {
        return new ClassPathResource(BUNDLE_DIR + "reset-password_" + language + ".properties").exists();
    }
}
