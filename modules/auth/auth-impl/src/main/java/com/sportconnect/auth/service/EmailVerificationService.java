package com.sportconnect.auth.service;

import com.sportconnect.auth.entity.EmailVerification;
import com.sportconnect.auth.repository.EmailVerificationRepository;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.NotFoundException;
import com.sportconnect.email.api.EmailMessage;
import com.sportconnect.email.api.EmailSender;
import com.sportconnect.user.api.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailVerificationService {

    // The link lifetime is stated in the email text, so the expiry and the text both read this one constant.
    static final long VERIFICATION_VALIDITY_HOURS = 24;

    private final EmailVerificationRepository emailVerificationRepository;
    private final EmailSender emailSender;
    private final EmailMessages emailMessages;
    private final UserService userService;

    @Value("${app.email.verification-url}")
    private String verificationUrl;

    /**
     * Issues a fresh verification token for the user (replacing any earlier one) and emails the link in the user's
     * language: their preference, else their country's default, else English (A13). The send is handed to the async
     * email module and never fails this call. Not called from registration yet (A17).
     */
    @Transactional
    public void createAndSendVerification(UUID userId, String email) {
        emailVerificationRepository.deleteByUserId(userId);

        String token = UUID.randomUUID().toString();

        EmailVerification verification = EmailVerification.builder()
                .userId(userId)
                .token(token)
                .expiresAt(LocalDateTime.now().plusHours(VERIFICATION_VALIDITY_HOURS))
                .build();

        emailVerificationRepository.save(verification);

        String language = resolveLanguage(userId);
        emailSender.send(EmailMessage.builder()
                .to(email)
                .subject(emailMessages.verificationSubject(language))
                .body(emailMessages.verificationBody(language, verificationUrl + "?token=" + token,
                        VERIFICATION_VALIDITY_HOURS))
                .build());

        log.info("Email verification sent to user: {}", userId);
    }

    /**
     * Emails the welcome message in the user's language (A13). Not called yet: A17 wires it to {@code verifyEmail}
     * and decides that a deactivated user gets none. A null or blank {@code firstName} is addressed neutrally.
     */
    public void sendWelcomeEmail(UUID userId, String email, String firstName) {
        String language = resolveLanguage(userId);
        emailSender.send(EmailMessage.builder()
                .to(email)
                .subject(emailMessages.welcomeSubject(language))
                .body(emailMessages.welcomeBody(language, firstName))
                .build());
    }

    @Transactional
    public void verifyEmail(String token) {
        EmailVerification verification = emailVerificationRepository.findByToken(token)
                .orElseThrow(() -> new NotFoundException("VERIFICATION_TOKEN_INVALID", "Invalid verification token", null));

        if (verification.isVerified()) {
            throw new BadRequestException("EMAIL_ALREADY_VERIFIED", "Email already verified", null);
        }

        if (verification.isExpired()) {
            throw new BadRequestException("VERIFICATION_TOKEN_EXPIRED", "Verification token has expired", null);
        }

        verification.setVerifiedAt(LocalDateTime.now());
        emailVerificationRepository.save(verification);

        log.info("Email verified for user: {}", verification.getUserId());
    }

    public boolean isEmailVerified(UUID userId) {
        return emailVerificationRepository.findByUserId(userId)
                .map(EmailVerification::isVerified)
                .orElse(false);
    }

    private String resolveLanguage(UUID userId) {
        return emailMessages.resolveLanguage(userService.findPreferredLanguageCode(userId));
    }
}
