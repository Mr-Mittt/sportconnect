package com.sportconnect.auth.service;

import com.sportconnect.email.api.EmailMessage;
import com.sportconnect.email.api.EmailSender;
import com.sportconnect.user.api.dto.UserResponse;
import com.sportconnect.user.api.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * A28: the welcome email, sent once when a user signs in for the first time (the account was just created from the
 * Keycloak identity). Password reset and email verification are Keycloak's own messages; this is the only email this
 * module still writes.
 *
 * <p>Delivery is the email module's job and is asynchronous, and a failure here is logged and swallowed: a welcome
 * message must never turn a successful sign-in into an error.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class WelcomeEmailService {

    private final EmailSender emailSender;
    private final EmailMessages emailMessages;
    private final UserService userService;

    /**
     * Sends the welcome message to a freshly provisioned user, in their language: their preference (set from the
     * Keycloak {@code locale} claim when provisioning), else their country's default, else English. Does nothing for a
     * user without an email (phone-only and Zalo accounts, A22). A null or blank first name is addressed neutrally.
     */
    public void sendTo(UserResponse user) {
        if (user.getEmail() == null || user.getEmail().isBlank()) {
            return;
        }
        try {
            String language = emailMessages.resolveLanguage(userService.findPreferredLanguageCode(user.getId()));
            emailSender.send(EmailMessage.builder()
                    .to(user.getEmail())
                    .subject(emailMessages.welcomeSubject(language))
                    .body(emailMessages.welcomeBody(language, user.getFirstName()))
                    .build());
        } catch (RuntimeException e) {
            log.warn("Could not send the welcome email to user {}: {}", user.getId(), e.getMessage());
        }
    }
}
