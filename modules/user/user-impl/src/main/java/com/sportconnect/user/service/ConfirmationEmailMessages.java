package com.sportconnect.user.service;

import com.sportconnect.user.api.dto.ConfirmationPurpose;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.util.Locale;
import java.util.Optional;

/**
 * U24: the localised text of the confirmation-code email ({@code email/confirm_code_<language>.properties}, UTF-8).
 * The user module owns the wording; delivery is the email module's job. A language without a bundle falls back to
 * English, like the welcome email (auth {@code EmailMessages}).
 */
@Component
class ConfirmationEmailMessages {

    private static final String DEFAULT_LANGUAGE = "en";
    private static final String BUNDLE = "email/confirm_code";

    private final ResourceBundleMessageSource source = new ResourceBundleMessageSource();

    ConfirmationEmailMessages() {
        source.setBasename(BUNDLE);
        source.setDefaultEncoding("UTF-8");
        source.setFallbackToSystemLocale(false);
    }

    /** The candidate's primary subtag ({@code vi-VN} becomes {@code vi}) when a bundle exists for it, else English. */
    String resolveLanguage(Optional<String> candidate) {
        return candidate
                .map(code -> code.trim().toLowerCase(Locale.ROOT))
                .map(code -> code.split("[-_]", 2)[0])
                .filter(code -> new ClassPathResource(BUNDLE + "_" + code + ".properties").exists())
                .orElse(DEFAULT_LANGUAGE);
    }

    String subject(String language) {
        return source.getMessage("subject", null, Locale.forLanguageTag(language));
    }

    /** {0} is the code, {1} its lifetime in minutes. */
    String body(String language, ConfirmationPurpose purpose, String code, long minutes) {
        return source.getMessage("body." + purpose.name().toLowerCase(Locale.ROOT), new Object[] {code, minutes},
                Locale.forLanguageTag(language));
    }
}
