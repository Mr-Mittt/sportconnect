package com.sportconnect.auth.service;

import com.sportconnect.auth.entity.PasswordResetToken;
import com.sportconnect.auth.repository.PasswordResetTokenRepository;
import com.sportconnect.common.exception.BadRequestException;
import com.sportconnect.common.exception.NotFoundException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class PasswordResetService {

    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final EmailService emailService;

    @Transactional
    public void createAndSendResetToken(UUID userId, String email) {
        passwordResetTokenRepository.deleteByUserId(userId);
        
        String token = UUID.randomUUID().toString();
        
        PasswordResetToken resetToken = PasswordResetToken.builder()
                .userId(userId)
                .token(token)
                .expiresAt(LocalDateTime.now().plusHours(1))
                .build();
        
        passwordResetTokenRepository.save(resetToken);
        emailService.sendPasswordResetEmail(email, token);
        
        log.info("Password reset token sent to user: {}", userId);
    }

    @Transactional
    public UUID validateAndUseToken(String token) {
        PasswordResetToken resetToken = passwordResetTokenRepository.findByToken(token)
                .orElseThrow(() -> new NotFoundException("Invalid reset token"));

        if (resetToken.isUsed()) {
            throw new BadRequestException("Reset token already used");
        }

        if (resetToken.isExpired()) {
            throw new BadRequestException("Reset token has expired");
        }

        resetToken.setUsedAt(LocalDateTime.now());
        passwordResetTokenRepository.save(resetToken);

        log.info("Password reset token validated for user: {}", resetToken.getUserId());
        return resetToken.getUserId();
    }
}
