package com.sportconnect.integration;

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
import org.springframework.mail.MailSendException;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.test.context.TestPropertySource;

import javax.sql.DataSource;
import java.time.Duration;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.after;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A13, rewritten by A28: the email module end to end through real Spring wiring. The welcome email is sent by the first
 * sign-in ({@code POST /api/auth/callback} creating the {@code users} row); auth renders the text in the user's language
 * and hands it to {@code email-api}, {@code SmtpEmailSender} delivers it on the async executor to the
 * {@code JavaMailSender}, which is the one collaborator replaced here so the sent message can be read.
 * <ul>
 *   <li>the first sign-in sends the welcome email, in Vietnamese for a user whose Keycloak {@code locale} is {@code vi},
 *       greeting them by first name; in English for one with no language;</li>
 *   <li>the second sign-in sends nothing (once per account);</li>
 *   <li>an account with no email (phone only) gets nothing and signs in fine;</li>
 *   <li>a failing mail server never fails the sign-in.</li>
 * </ul>
 * Password reset and verification emails are Keycloak's own now (its email theme), so they are not tested here.
 */
// The actuator mail health indicator needs a real JavaMailSenderImpl; dev disables it too (application-dev.yml).
@TestPropertySource(properties = "management.health.mail.enabled=false")
class EmailModuleIntegrationTest extends RedisBaseIT {

    private static final String VERIFIER = "v".repeat(43);

    @MockBean
    private JavaMailSender mailSender;

    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserPreferenceRepository userPreferenceRepository;
    @Autowired
    private RoleRepository roleRepository;
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
        userPreferenceRepository.deleteAll();
        userRepository.deleteAll();
    }

    private org.springframework.test.web.servlet.ResultActions signIn(TestKeycloak.Identity identity) throws Exception {
        String code = TestKeycloak.issueCode(identity, VERIFIER);
        return mockMvc.perform(post("/api/auth/callback").with(anonymous()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\": \"" + code + "\", \"codeVerifier\": \"" + VERIFIER + "\"}"));
    }

    /** The one mail {@code SmtpEmailSender} handed to the mail sender, waiting for the async executor. */
    private SimpleMailMessage sentMail() {
        ArgumentCaptor<SimpleMailMessage> captor = ArgumentCaptor.forClass(SimpleMailMessage.class);
        await().atMost(Duration.ofSeconds(5)).untilAsserted(() -> verify(mailSender, atLeastOnce()).send(captor.capture()));
        return captor.getValue();
    }

    @Test
    void firstSignIn_sendsTheWelcomeEmailInTheUsersLanguage_greetingByFirstName() throws Exception {
        signIn(TestKeycloak.Identity.of(UUID.randomUUID()).email("a28-vi@example.com").names("Lan", "Nguyen").locale("vi"))
                .andExpect(status().isOk());

        SimpleMailMessage mail = sentMail();
        assertThat(mail.getTo()).containsExactly("a28-vi@example.com");
        assertThat(mail.getFrom()).isNotBlank();
        assertThat(mail.getSubject()).isEqualTo("Chào mừng bạn đến với SportConnect!");
        assertThat(mail.getText()).startsWith("Xin chào Lan,");
    }

    @Test
    void firstSignIn_isEnglish_whenTheUserHasNoLanguage() throws Exception {
        signIn(TestKeycloak.Identity.of(UUID.randomUUID()).email("a28-en@example.com").names("Sam", "Lee"))
                .andExpect(status().isOk());

        SimpleMailMessage mail = sentMail();
        assertThat(mail.getSubject()).isEqualTo("Welcome to SportConnect!");
        assertThat(mail.getText()).startsWith("Hi Sam,");
    }

    @Test
    void secondSignIn_sendsNothing() throws Exception {
        UUID sub = UUID.randomUUID();
        signIn(TestKeycloak.Identity.of(sub).email("a28-twice@example.com").names("Twice", "Over")).andExpect(status().isOk());
        sentMail();

        signIn(TestKeycloak.Identity.of(sub).email("a28-twice@example.com").names("Twice", "Over")).andExpect(status().isOk());

        // Give the async executor time to deliver a (wrong) second message before asserting there is only the first.
        verify(mailSender, after(1000).times(1)).send(any(SimpleMailMessage.class));
    }

    @Test
    void firstSignIn_ofAPhoneOnlyAccount_sendsNothingAndSucceeds() throws Exception {
        signIn(TestKeycloak.Identity.of(UUID.randomUUID()).phone("0901234567").names("Phone", "Only"))
                .andExpect(status().isOk());

        verify(mailSender, after(1000).times(0)).send(any(SimpleMailMessage.class));
    }

    @Test
    void aFailingMailServer_neverFailsTheSignIn() throws Exception {
        doThrow(new MailSendException("smtp down")).when(mailSender).send(any(SimpleMailMessage.class));

        signIn(TestKeycloak.Identity.of(UUID.randomUUID()).email("a28-down@example.com").names("Down", "Stream"))
                .andExpect(status().isOk());

        verify(mailSender, after(1000).atLeastOnce()).send(any(SimpleMailMessage.class));
    }
}
