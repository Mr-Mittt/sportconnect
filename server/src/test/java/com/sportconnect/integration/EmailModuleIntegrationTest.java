package com.sportconnect.integration;

import com.jayway.jsonpath.JsonPath;
import com.sportconnect.auth.repository.EmailVerificationRepository;
import com.sportconnect.auth.repository.PasswordResetTokenRepository;
import com.sportconnect.auth.repository.RefreshTokenRepository;
import com.sportconnect.auth.service.EmailVerificationService;
import com.sportconnect.user.entity.Role;
import com.sportconnect.user.repository.RoleRepository;
import com.sportconnect.user.repository.UserPreferenceRepository;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MvcResult;

import javax.sql.DataSource;
import java.time.Duration;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A13: the new email module end to end through real Spring wiring. Auth renders the text (language resolved from real
 * user and reference rows) and hands it to {@code email-api}; {@code SmtpEmailSender} delivers it on the async
 * executor to the {@code JavaMailSender}, which is the one collaborator replaced here so the sent message can be read.
 * <ul>
 *   <li>context startup with the new {@code email-impl} module and its cross-module wiring from auth;</li>
 *   <li>forgot-password (a real request) sends the reset email, in Vietnamese for a Vietnam-country user, with the
 *       token that was saved;</li>
 *   <li>the verification and welcome emails render in the user's stored language, and in English without one.</li>
 * </ul>
 * The verification and welcome emails have no production trigger yet (A17), so those tests call
 * {@link EmailVerificationService} directly.
 */
// The actuator mail health indicator needs a real JavaMailSenderImpl; dev disables it too (application-dev.yml).
@TestPropertySource(properties = "management.health.mail.enabled=false")
class EmailModuleIntegrationTest extends RedisBaseIT {

    private static final String PASSWORD = "password123";

    @MockBean
    private JavaMailSender mailSender;

    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserPreferenceRepository userPreferenceRepository;
    @Autowired
    private RefreshTokenRepository refreshTokenRepository;
    @Autowired
    private RoleRepository roleRepository;
    @Autowired
    private PasswordResetTokenRepository passwordResetTokenRepository;
    @Autowired
    private EmailVerificationRepository emailVerificationRepository;
    @Autowired
    private EmailVerificationService emailVerificationService;
    @Autowired
    private DataSource dataSource;

    @BeforeEach
    void setUp() {
        clean();
        ReferenceTestData.reseed(dataSource);
        if (roleRepository.findByName(Role.USER).isEmpty()) {
            roleRepository.save(Role.builder().name(Role.USER).description("test").build());
        }
    }

    @AfterEach
    void tearDown() {
        clean();
        ReferenceTestData.clear(dataSource);
    }

    private void clean() {
        jdbc.update("DELETE FROM password_reset_tokens");
        emailVerificationRepository.deleteAll();
        refreshTokenRepository.deleteAll();
        userPreferenceRepository.deleteAll();
        userRepository.deleteAll();
    }

    private UUID register(String email) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/register").with(anonymous())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\": \"" + email + "\", \"password\": \"" + PASSWORD
                                + "\", \"fullName\": \"Mail Tester\"}"))
                .andExpect(status().isOk())
                .andReturn();
        return UUID.fromString(JsonPath.read(result.getResponse().getContentAsString(), "$.data.user.id"));
    }

    private void setPreferredLanguage(UUID userId, String code) {
        jdbc.update("INSERT INTO user_preferences (user_id, language, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", userId, code);
    }

    /** The one mail {@code SmtpEmailSender} handed to the mail sender, waiting for the async executor. */
    private SimpleMailMessage sentMail() {
        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> verify(mailSender, atLeastOnce()).send(captor.capture()));
        return captor.getValue();
    }

    @Test
    void forgotPassword_sendsTheResetEmailInTheUsersLanguage_withTheSavedToken() throws Exception {
        UUID userId = register("a13-reset@example.com");
        setPreferredLanguage(userId, "vi");

        mockMvc.perform(post("/api/auth/forgot-password").with(anonymous()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"email\": \"a13-reset@example.com\"}"))
                .andExpect(status().isOk());

        String token = jdbc.queryForObject("SELECT token FROM password_reset_tokens WHERE user_id = ?", String.class, userId);
        SimpleMailMessage mail = sentMail();
        assertThat(mail.getTo()).containsExactly("a13-reset@example.com");
        assertThat(mail.getFrom()).isNotBlank();
        assertThat(mail.getSubject()).isEqualTo("Đặt lại mật khẩu - SportConnect");
        assertThat(mail.getText()).contains("/reset-password?token=" + token);
    }

    @Test
    void verificationEmail_isInTheStoredLanguage_andCarriesTheSavedToken() throws Exception {
        UUID userId = register("a13-verify-vi@example.com");
        setPreferredLanguage(userId, "vi");

        emailVerificationService.createAndSendVerification(userId, "a13-verify-vi@example.com");

        String token = emailVerificationRepository.findByUserId(userId).orElseThrow().getToken();
        SimpleMailMessage mail = sentMail();
        assertThat(mail.getTo()).containsExactly("a13-verify-vi@example.com");
        assertThat(mail.getSubject()).isEqualTo("Xác minh email của bạn - SportConnect");
        assertThat(mail.getText()).contains("/verify-email?token=" + token).contains("24 giờ");
    }

    @Test
    void verificationEmail_isEnglish_whenTheUserHasNoLanguage() throws Exception {
        UUID userId = register("a13-verify-en@example.com");

        emailVerificationService.createAndSendVerification(userId, "a13-verify-en@example.com");

        SimpleMailMessage mail = sentMail();
        assertThat(mail.getSubject()).isEqualTo("Verify Your Email - SportConnect");
        assertThat(mail.getText()).contains("This link will expire in 24 hours.");
    }

    @Test
    void welcomeEmail_isInTheStoredLanguage_andGreetsByFirstName() throws Exception {
        UUID userId = register("a13-welcome@example.com");
        setPreferredLanguage(userId, "vi");

        emailVerificationService.sendWelcomeEmail(userId, "a13-welcome@example.com", "Lan");

        SimpleMailMessage mail = sentMail();
        assertThat(mail.getSubject()).isEqualTo("Chào mừng bạn đến với SportConnect!");
        assertThat(mail.getText()).startsWith("Xin chào Lan,");
    }
}
