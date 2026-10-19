package com.sportconnect.user.service;

import com.sportconnect.auth.api.service.KeycloakCredentialService;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.email.api.EmailMessage;
import com.sportconnect.email.api.EmailSender;
import com.sportconnect.user.api.dto.ConfirmationCodeResponse;
import com.sportconnect.user.api.dto.ConfirmationPurpose;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Optional;
import java.util.UUID;

/**
 * U24: how a signed-in user proves it is really them before a sensitive account change (deactivating the account,
 * changing the password). Two proofs, exactly one per request:
 *
 * <ul>
 *   <li>the <strong>current password</strong>, which only Keycloak can check ({@link KeycloakCredentialService}); the
 *       backend keeps no password of its own. Wrong answers are counted per user and stop at a limit before Keycloak is
 *       asked again, so the real account is not locked out by someone guessing.</li>
 *   <li>a <strong>code emailed</strong> to the account ({@link ConfirmationCodeStore}: 6 digits, 15 minutes, once,
 *       bound to the purpose), for users with no password (Google or phone sign-in) and for those who forgot it.</li>
 * </ul>
 */
@Component
@RequiredArgsConstructor
@Slf4j
class AccountConfirmationService {

    private final ConfirmationCodeStore store;
    private final KeycloakCredentialService credentials;
    private final EmailSender emailSender;
    private final ConfirmationEmailMessages messages;

    /**
     * Issues a code for {@code purpose} and emails it to {@code email} in the user's language. The email is sent after
     * the code is stored (the send is asynchronous and fire-and-forget, so a delivery failure is only logged).
     *
     * @param language the user's preferred language code, if any; English when there is no bundle for it
     * @throws BadRequestException {@code VERIFICATION_EMAIL_UNAVAILABLE} when the account has no email to send to
     */
    ConfirmationCodeResponse sendCode(UUID userId, String email, ConfirmationPurpose purpose, Optional<String> language) {
        if (email == null || email.isBlank()) {
            throw new BadRequestException("VERIFICATION_EMAIL_UNAVAILABLE", "This account has no email to send a code to", null);
        }
        String code = store.issue(userId, purpose);
        String lang = messages.resolveLanguage(language);
        emailSender.send(EmailMessage.builder()
                .to(email)
                .subject(messages.subject(lang))
                .body(messages.body(lang, purpose, code, store.ttl().toMinutes()))
                .build());
        return ConfirmationCodeResponse.builder()
                .resendAfterSeconds(store.resendInterval().toSeconds())
                .expiresInSeconds(store.ttl().toSeconds())
                .build();
    }

    /**
     * Checks the one proof the caller sent. Returns normally only when it is right; every other outcome throws and the
     * caller must change nothing.
     *
     * @throws BadRequestException {@code CONFIRMATION_REQUIRED} (neither proof, or both), {@code CURRENT_PASSWORD_INCORRECT},
     *         or a {@code VERIFICATION_CODE_*} code
     * @throws com.sportconnect.common.exception.TooManyRequestsException {@code PASSWORD_ATTEMPTS_EXCEEDED}
     * @throws com.sportconnect.common.exception.ServiceUnavailableException when Keycloak or Redis is down
     */
    void confirm(UUID userId, ConfirmationPurpose purpose, String currentPassword, String verificationCode) {
        boolean hasPassword = currentPassword != null && !currentPassword.isBlank();
        boolean hasCode = verificationCode != null && !verificationCode.isBlank();
        if (hasPassword == hasCode) {
            throw new BadRequestException("CONFIRMATION_REQUIRED",
                    "Confirm with your current password or with the emailed code, not both and not neither", null);
        }
        if (hasCode) {
            store.verify(userId, purpose, verificationCode);
            return;
        }
        store.checkPasswordAllowed(userId);
        if (!credentials.verifyPassword(userId, currentPassword)) {
            store.recordPasswordFailure(userId);
            throw new BadRequestException("CURRENT_PASSWORD_INCORRECT", "Current password is incorrect", null);
        }
        store.clearPasswordFailures(userId);
    }
}
