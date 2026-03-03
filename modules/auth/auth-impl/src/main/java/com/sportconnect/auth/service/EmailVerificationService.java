package com.sportconnect.auth.service;

import com.sportconnect.auth.entity.EmailVerification;
import com.sportconnect.auth.repository.EmailVerificationRepository;
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
public class EmailVerificationService {

    private final EmailVerificationRepository emailVerificationRepository;
    private final EmailService emailService;

    @Transactional
    public void createAndSendVerification(UUID userId, String email) {
        emailVerificationRepository.deleteByUserId(userId);
        
        String token = UUID.randomUUID().toString();
        
        EmailVerification verification = EmailVerification.builder()
                .userId(userId)
                .token(token)
                .expiresAt(LocalDateTime.now().plusHours(24))
                .build();
        
        emailVerificationRepository.save(verification);
        emailService.sendVerificationEmail(email, token);
        
        log.info("Email verification sent to user: {}", userId);
    }

    @Transactional
    public void verifyEmail(String token) {
        EmailVerification verification = emailVerificationRepository.findByToken(token)
                .orElseThrow(() -> new NotFoundException("Invalid verification token"));

        if (verification.isVerified()) {
            throw new BadRequestException("Email already verified");
        }

        if (verification.isExpired()) {
            throw new BadRequestException("Verification token has expired");
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
}
