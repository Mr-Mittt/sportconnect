package com.sportconnect.email.service;

import com.sportconnect.email.api.EmailMessage;
import com.sportconnect.email.api.EmailSender;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/** SMTP implementation of {@link EmailSender}, sending as {@code app.email.from} on the {@code @Async} executor. */
@Slf4j
@Service
@RequiredArgsConstructor
public class SmtpEmailSender implements EmailSender {

    private final JavaMailSender mailSender;

    @Value("${app.email.from}")
    private String fromEmail;

    /** {@inheritDoc} Failures (including a null or blank field) are logged with the recipient and swallowed. */
    @Override
    @Async
    public void send(EmailMessage message) {
        try {
            SimpleMailMessage mail = new SimpleMailMessage();
            mail.setFrom(fromEmail);
            mail.setTo(message.getTo());
            mail.setSubject(message.getSubject());
            mail.setText(message.getBody());
            mailSender.send(mail);

            log.info("Email sent to: {}", message.getTo());
        } catch (Exception e) {
            log.error("Failed to send email to: {}", message.getTo(), e);
        }
    }
}
