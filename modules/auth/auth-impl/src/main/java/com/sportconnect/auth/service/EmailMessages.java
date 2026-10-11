package com.sportconnect.auth.service;

import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Locale;
import java.util.Optional;

/**
 * The localised text of the emails this module sends: password reset (A10), email verification and welcome (A13).
 * Auth owns the wording and the language choice; delivery is the email module's job ({@code EmailSender}).
 *
 * <p>Bundles live at {@code email/<name>_<language>.properties} (UTF-8) and are the only place a language is
 * "supported" for email: a language that is active in the reference data but is missing any of the bundles here is
 * not usable, so {@link #resolveLanguage} falls back to English instead of failing at send time.
 */
@Component
public class EmailMessages {

    static final String DEFAULT_LANGUAGE = "en";
    private static final String BUNDLE_DIR = "email/";
    private static final String RESET_PASSWORD = "reset-password";
    private static final String VERIFY_EMAIL = "verify-email";
    private static final String WELCOME = "welcome";
    private static final List<String> BUNDLES = List.of(RESET_PASSWORD, VERIFY_EMAIL, WELCOME);

    // One source per bundle: every bundle defines "subject" and "body", so a shared source would let the first win.
    private final Map<String, ResourceBundleMessageSource> sources = new HashMap<>();

    public EmailMessages() {
        for (String bundle : BUNDLES) {
            ResourceBundleMessageSource source = new ResourceBundleMessageSource();
            source.setBasename(BUNDLE_DIR + bundle);
            source.setDefaultEncoding("UTF-8");
            source.setFallbackToSystemLocale(false);
            sources.put(bundle, source);
        }
    }

    /**
     * Picks the language to send in: the candidate's primary subtag ({@code vi-VN} → {@code vi}) when every email
     * bundle exists for it, otherwise English. Never returns a language without all bundles.
     */
    public String resolveLanguage(Optional<String> candidate) {
        return candidate
                .map(code -> code.trim().toLowerCase(Locale.ROOT))
                .map(code -> code.split("[-_]", 2)[0])
                .filter(this::hasAllBundles)
                .orElse(DEFAULT_LANGUAGE);
    }

    /** Subject of the password-reset email in {@code language} (a value returned by {@link #resolveLanguage}). */
    public String resetPasswordSubject(String language) {
        return text(RESET_PASSWORD, "subject", language);
    }

    /** Body of the password-reset email in {@code language}; {@code minutes} is how long the link stays valid. */
    public String resetPasswordBody(String language, String resetLink, long minutes) {
        return text(RESET_PASSWORD, "body", language, resetLink, String.valueOf(minutes));
    }

    /** Subject of the email-verification email in {@code language}. */
    public String verificationSubject(String language) {
        return text(VERIFY_EMAIL, "subject", language);
    }

    /** Body of the email-verification email; {@code hours} is how long the link stays valid. */
    public String verificationBody(String language, String verificationLink, long hours) {
        return text(VERIFY_EMAIL, "body", language, verificationLink, String.valueOf(hours));
    }

    /** Subject of the welcome email in {@code language}. */
    public String welcomeSubject(String language) {
        return text(WELCOME, "subject", language);
    }

    /** Body of the welcome email; a null or blank {@code firstName} becomes the language's neutral address ("there"). */
    public String welcomeBody(String language, String firstName) {
        String name = firstName == null || firstName.isBlank() ? text(WELCOME, "name.fallback", language) : firstName;
        return text(WELCOME, "body", language, name);
    }

    private String text(String bundle, String key, String language, Object... args) {
        return sources.get(bundle).getMessage(key, args, Locale.forLanguageTag(language));
    }

    private boolean hasAllBundles(String language) {
        return BUNDLES.stream()
                .allMatch(bundle -> new ClassPathResource(BUNDLE_DIR + bundle + "_" + language + ".properties").exists());
    }
}
