package com.sportconnect.auth.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class EmailService {

    private final JavaMailSender mailSender;

    @Value("${app.email.from}")
    private String fromEmail;

    @Value("${app.email.verification-url}")
    private String verificationUrl;

    @Value("${app.email.reset-password-url}")
    private String resetPasswordUrl;

    @Async
    public void sendVerificationEmail(String toEmail, String token) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(toEmail);
            message.setSubject("Verify Your Email - SportConnect");
            
            String verificationLink = verificationUrl + "?token=" + token;
            String emailBody = String.format(
                "Welcome to SportConnect!\n\n" +
                "Please verify your email address by clicking the link below:\n\n" +
                "%s\n\n" +
                "This link will expire in 24 hours.\n\n" +
                "If you didn't create an account, please ignore this email.\n\n" +
                "Best regards,\n" +
                "SportConnect Team",
                verificationLink
            );
            
            message.setText(emailBody);
            mailSender.send(message);
            
            log.info("Verification email sent to: {}", toEmail);
        } catch (Exception e) {
            log.error("Failed to send verification email to: {}", toEmail, e);
        }
    }

    @Async
    public void sendPasswordResetEmail(String toEmail, String token) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(toEmail);
            message.setSubject("Reset Your Password - SportConnect");
            
            String resetLink = resetPasswordUrl + "?token=" + token;
            String emailBody = String.format(
                "Hello,\n\n" +
                "We received a request to reset your password for your SportConnect account.\n\n" +
                "Click the link below to reset your password:\n\n" +
                "%s\n\n" +
                "This link will expire in 1 hour.\n\n" +
                "If you didn't request a password reset, please ignore this email.\n\n" +
                "Best regards,\n" +
                "SportConnect Team",
                resetLink
            );
            
            message.setText(emailBody);
            mailSender.send(message);
            
            log.info("Password reset email sent to: {}", toEmail);
        } catch (Exception e) {
            log.error("Failed to send password reset email to: {}", toEmail, e);
        }
    }

    @Async
    public void sendWelcomeEmail(String toEmail, String firstName) {
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(fromEmail);
            message.setTo(toEmail);
            message.setSubject("Welcome to SportConnect!");
            
            String emailBody = String.format(
                "Hi %s,\n\n" +
                "Welcome to SportConnect! Your email has been verified successfully.\n\n" +
                "You can now:\n" +
                "- Find sports partners\n" +
                "- Book facilities\n" +
                "- Share your sports moments\n" +
                "- Connect with the sports community\n\n" +
                "Get started by completing your profile and adding your favorite sports!\n\n" +
                "Best regards,\n" +
                "SportConnect Team",
                firstName != null ? firstName : "there"
            );
            
            message.setText(emailBody);
            mailSender.send(message);
            
            log.info("Welcome email sent to: {}", toEmail);
        } catch (Exception e) {
            log.error("Failed to send welcome email to: {}", toEmail, e);
        }
    }
}
