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
 * The localised text of the emails this module sends. Since A28 that is only the welcome email (A13): password reset
 * and email verification are Keycloak's own messages (its email theme, en and vi). Auth owns the wording and the
 * language choice; delivery is the email module's job ({@code EmailSender}).
 *
 * <p>Bundles live at {@code email/<name>_<language>.properties} (UTF-8) and are the only place a language is
 * "supported" for email: a language that is active in the reference data but is missing a bundle here is
 * not usable, so {@link #resolveLanguage} falls back to English instead of failing at send time.
 */
@Component
public class EmailMessages {

    static final String DEFAULT_LANGUAGE = "en";
    private static final String BUNDLE_DIR = "email/";
    private static final String WELCOME = "welcome";
    private static final List<String> BUNDLES = List.of(WELCOME);

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
