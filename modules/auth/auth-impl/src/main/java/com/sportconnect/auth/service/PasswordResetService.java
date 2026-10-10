package com.sportconnect.auth.service;

import com.sportconnect.auth.entity.PasswordResetToken;
import com.sportconnect.auth.repository.PasswordResetTokenRepository;
import com.sportconnect.auth.repository.RefreshTokenRepository;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.NotFoundException;
import com.sportconnect.user.api.service.UserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final EmailService emailService;
    private final EmailMessages emailMessages;
    private final UserService userService;
    private final PasswordEncoder passwordEncoder;
    private final PlatformTransactionManager transactionManager;
    private final TokenRevocationChecker tokenRevocationChecker;

    @Value("${app.password-reset.expiration-minutes:60}")
    private long expirationMinutes;

    /**
     * Issues a password-reset token for the account with this email and emails the link (A10).
     *
     * <p>Flow: resolve the user id (deactivated accounts included — a deactivated user may reset their password,
     * and doing so neither re-activates the account nor issues tokens); in one short transaction replace any
     * earlier token with a fresh one; only <em>after</em> that commit hand the email to the async sender, so a
     * rolled-back token never gets a link mailed out, in the user's language (preference, else their country's
     * default, else English; see {@link UserService#findPreferredLanguageCode}).
     *
     * <p>Never reveals whether the email exists: an unknown email returns silently, exactly like a known one. The
     * small remaining timing difference (a delete + insert + commit on the known path) is accepted; the slow part,
     * the SMTP send, is {@code @Async}.
     *
     * <p>The unique key on {@code password_reset_tokens.user_id} (V078) means two concurrent requests for the
     * same user can collide on insert. The loser's transaction is rolled back, which is why the catch sits
     * <em>outside</em> the {@link TransactionTemplate} (a caught exception inside a participating transaction
     * would leave it rollback-only). The winner's token and email stand; the loser sends nothing.
     */
    public void requestReset(String email) {
        Optional<UUID> userId = userService.findUserIdByEmail(email);
        if (userId.isEmpty()) {
            log.debug("Password reset requested for an unknown email");
            return;
        }

        String token;
        try {
            token = new TransactionTemplate(transactionManager).execute(status -> replaceToken(userId.get()));
        } catch (DataIntegrityViolationException e) {
            log.info("Concurrent password reset request for user {}; keeping the other request's token", userId.get());
            return;
        }

        String language = emailMessages.resolveLanguage(userService.findPreferredLanguageCode(userId.get()));
        emailService.sendPasswordResetEmail(email, token, language);
        log.info("Password reset token sent to user: {}", userId.get());
    }

    private String replaceToken(UUID userId) {
        passwordResetTokenRepository.deleteByUserId(userId);
        // deleteByUserId is a derived delete (load, then remove); flush it so the delete reaches the database
        // before the insert, otherwise Hibernate may order the insert first and trip the unique key on user_id.
        passwordResetTokenRepository.flush();

        String token = UUID.randomUUID().toString();
        passwordResetTokenRepository.saveAndFlush(PasswordResetToken.builder()
                .userId(userId)
                .token(token)
                .expiresAt(LocalDateTime.now().plusMinutes(expirationMinutes))
                .build());
        return token;
    }

    @Transactional
    public UUID validateAndUseToken(String token) {
        PasswordResetToken resetToken = passwordResetTokenRepository.findByToken(token)
                .orElseThrow(() -> new NotFoundException("RESET_TOKEN_INVALID", "Invalid reset token", null));

        if (resetToken.isUsed()) {
            throw new BadRequestException("RESET_TOKEN_USED", "Reset token already used", null);
        }

        if (resetToken.isExpired()) {
            throw new BadRequestException("RESET_TOKEN_EXPIRED", "Reset token has expired", null);
        }

        resetToken.setUsedAt(LocalDateTime.now());
        passwordResetTokenRepository.save(resetToken);

        log.info("Password reset token validated for user: {}", resetToken.getUserId());
        return resetToken.getUserId();
    }

    /**
     * Sets the new (already validated) password and revokes all of the user's refresh tokens, so a session
     * that was open before the reset (for example a stolen one) does not outlive it (A10). Does not touch
     * {@code isActive}: a deactivated account stays deactivated.
     * Evicts the cached revocation watermark after commit so the revoked tokens stop working immediately (A12).
     */
    @Transactional
    public void resetPassword(UUID userId, String newPassword) {
        String encodedPassword = passwordEncoder.encode(newPassword);
        userService.updateUserPassword(userId, encodedPassword);
        refreshTokenRepository.revokeAllUserTokens(userId, LocalDateTime.now());
        tokenRevocationChecker.evictAfterCommit(userId);
        log.info("Password reset completed for user: {}", userId);
    }
}
