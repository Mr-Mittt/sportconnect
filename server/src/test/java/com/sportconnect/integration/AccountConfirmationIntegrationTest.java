package com.sportconnect.integration;

import com.sportconnect.email.api.EmailMessage;
import com.sportconnect.email.api.EmailSender;
import com.sportconnect.user.api.dto.PhoneStatus;
import com.sportconnect.user.entity.Role;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.RoleRepository;
import com.sportconnect.user.repository.UserPreferenceRepository;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.util.Set;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * U24 end-to-end: the two ways to confirm a sensitive account change, through the real request pipeline, real
 * {@code UserServiceImpl} / {@code ConfirmationCodeStore} on a real Redis and the real Keycloak client talking to
 * {@link TestKeycloak}. The password lives only in Keycloak: {@code TestKeycloak.registerUser} gives a user one (or none,
 * for a social-only account) and {@code passwordOf} shows what a change did to it. Delivery is mocked so the test can
 * read the code that would have been emailed.
 */
class AccountConfirmationIntegrationTest extends RedisBaseIT {

    private static final String PASSWORD = "password123";
    private static final String NEW_PASSWORD = "brand-new-pass";
    private static final Pattern CODE = Pattern.compile("\\b(\\d{6})\\b");

    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserPreferenceRepository userPreferenceRepository;
    @Autowired
    private RoleRepository roleRepository;
    @Autowired
    private StringRedisTemplate redis;
    @MockBean
    private EmailSender emailSender;

    @BeforeEach
    void setUp() {
        clean();
        if (roleRepository.findByName(Role.USER).isEmpty()) {
            roleRepository.save(Role.builder().name(Role.USER).description("test").build());
        }
        TestKeycloak.tokenEndpointAvailable(true);
        TestKeycloak.adminAvailable(true);
    }

    @AfterEach
    void tearDown() {
        TestKeycloak.tokenEndpointAvailable(true);
        TestKeycloak.adminAvailable(true);
        clean();
    }

    private void clean() {
        userPreferenceRepository.deleteAll();
        userRepository.deleteAll();
        var keys = redis.keys("user:confirm:*");
        if (keys != null && !keys.isEmpty()) {
            redis.delete(keys);
        }
    }

    /** An active user with a Keycloak password (or none: {@code password == null}). */
    private User register(String email, String password) {
        Role userRole = roleRepository.findByName(Role.USER).orElseThrow();
        User saved = userRepository.save(User.builder()
                .email(email)
                .firstName("Confirm")
                .lastName("Tester")
                .isActive(true)
                .roles(Set.of(userRole))
                .build());
        TestKeycloak.registerUser(saved.getId(), email, password);
        return saved;
    }

    private ResultActions asUser(User user, org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder request, String body) throws Exception {
        return mockMvc.perform(request.header("Authorization", bearer(user.getId())).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions requestCode(User user, String purpose) throws Exception {
        return asUser(user, post("/api/users/me/confirmation-code"), "{\"purpose\": \"" + purpose + "\"}");
    }

    private ResultActions deactivate(User user, String body) throws Exception {
        return asUser(user, post("/api/users/me/deactivate"), body);
    }

    private ResultActions changePassword(User user, String body) throws Exception {
        return asUser(user, put("/api/users/me/password"), body);
    }

    /** Requests a code and returns the digits of the email that was "sent". */
    private String issueCode(User user, String purpose) throws Exception {
        Mockito.clearInvocations(emailSender);
        requestCode(user, purpose).andExpect(status().isOk());
        ArgumentCaptor<EmailMessage> sent = ArgumentCaptor.forClass(EmailMessage.class);
        Mockito.verify(emailSender).send(sent.capture());
        Matcher m = CODE.matcher(sent.getValue().getBody());
        assertThat(m.find()).as("a 6-digit code in the email").isTrue();
        return m.group(1);
    }

    /** The resend wait only guards a second request, so a test that needs another code lifts it by hand. */
    private void liftResendWait() {
        var keys = redis.keys("user:confirm:resend:*");
        if (keys != null && !keys.isEmpty()) {
            redis.delete(keys);
        }
    }

    private boolean isActive(String email) {
        return userRepository.findByEmail(email).orElseThrow().getIsActive();
    }

    // ---------- the emailed code ----------

    @Test
    void confirmationCode_isEmailedWithTheCountdown() throws Exception {
        User user = register("u24-send@example.com", PASSWORD);

        requestCode(user, "DEACTIVATE")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.resendAfterSeconds").value(60))
                .andExpect(jsonPath("$.data.expiresInSeconds").value(900));

        ArgumentCaptor<EmailMessage> sent = ArgumentCaptor.forClass(EmailMessage.class);
        Mockito.verify(emailSender).send(sent.capture());
        assertThat(sent.getValue().getTo()).isEqualTo("u24-send@example.com");
        assertThat(sent.getValue().getBody()).containsPattern("\\d{6}").contains("15");
    }

    @Test
    void confirmationCode_asksTheSecondTimeTooSoon_is429WithTheWait_andSendsNothingMore() throws Exception {
        User user = register("u24-resend@example.com", PASSWORD);
        requestCode(user, "DEACTIVATE").andExpect(status().isOk());

        requestCode(user, "DEACTIVATE")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_RESEND_TOO_SOON"))
                .andExpect(jsonPath("$.errorParams.seconds").isNumber());

        Mockito.verify(emailSender, Mockito.times(1)).send(Mockito.any());
        // The other purpose has its own wait.
        requestCode(user, "CHANGE_PASSWORD").andExpect(status().isOk());
    }

    @Test
    void confirmationCode_forAnAccountWithoutEmail_is400() throws Exception {
        Role userRole = roleRepository.findByName(Role.USER).orElseThrow();
        User phoneOnly = userRepository.save(User.builder()
                .phoneNumber("+84901112233").phoneStatus(PhoneStatus.VALID)
                .firstName("Phone").lastName("Only").isActive(true).roles(Set.of(userRole)).build());
        TestKeycloak.registerUser(phoneOnly.getId(), "+84901112233", PASSWORD);

        requestCode(phoneOnly, "DEACTIVATE")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_EMAIL_UNAVAILABLE"));

        Mockito.verify(emailSender, Mockito.never()).send(Mockito.any());
    }

    @Test
    void confirmationCode_withoutAPurpose_is400_validationFailed() throws Exception {
        User user = register("u24-purpose@example.com", PASSWORD);

        asUser(user, post("/api/users/me/confirmation-code"), "{}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"));
    }

    @Test
    void confirmationCode_withoutAToken_is401() throws Exception {
        mockMvc.perform(post("/api/users/me/confirmation-code").with(anonymous())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"purpose\": \"DEACTIVATE\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void confirmationCode_forADeactivatedCaller_is404() throws Exception {
        User user = register("u24-gone@example.com", PASSWORD);
        user.setIsActive(false);
        userRepository.save(user);
        // The per-request gate would already refuse the token (401); authenticating directly reaches the service's own check.
        authenticateAs(user.getId());

        mockMvc.perform(post("/api/users/me/confirmation-code").contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purpose\": \"DEACTIVATE\"}"))
                .andExpect(status().isNotFound());

        Mockito.verify(emailSender, Mockito.never()).send(Mockito.any());
    }

    // ---------- deactivation ----------

    @Test
    void deactivate_withTheEmailedCode_deactivates_andTheCodeWorksOnce() throws Exception {
        User user = register("u24-code@example.com", PASSWORD);
        String code = issueCode(user, "DEACTIVATE");

        deactivate(user, "{\"verificationCode\": \"" + code + "\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        assertThat(isActive("u24-code@example.com")).isFalse();
        assertThat(redis.keys("user:confirm:code:*")).isEmpty();
    }

    @Test
    void deactivate_withTheEmailedCode_worksForAUserWithNoPassword() throws Exception {
        User social = register("u24-social@example.com", null);
        String code = issueCode(social, "DEACTIVATE");

        // The password method has nothing to match for a social-only account...
        deactivate(social, "{\"currentPassword\": \"" + PASSWORD + "\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("CURRENT_PASSWORD_INCORRECT"));
        assertThat(isActive("u24-social@example.com")).isTrue();

        // ...and the emailed code is the way in.
        deactivate(social, "{\"verificationCode\": \"" + code + "\"}").andExpect(status().isOk());
        assertThat(isActive("u24-social@example.com")).isFalse();
    }

    @Test
    void deactivate_withTheRightKeycloakPassword_deactivates() throws Exception {
        User user = register("u24-pass@example.com", PASSWORD);

        deactivate(user, "{\"currentPassword\": \"" + PASSWORD + "\"}").andExpect(status().isOk());

        assertThat(isActive("u24-pass@example.com")).isFalse();
    }

    @Test
    void deactivate_withAWrongCode_is400_andFiveWrongOnesBurnTheCode() throws Exception {
        User user = register("u24-burn@example.com", PASSWORD);
        String code = issueCode(user, "DEACTIVATE");
        String wrong = code.equals("000000") ? "111111" : "000000";

        for (int attempt = 1; attempt <= 4; attempt++) {
            deactivate(user, "{\"verificationCode\": \"" + wrong + "\"}")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errorCode").value("VERIFICATION_CODE_INVALID"));
        }
        deactivate(user, "{\"verificationCode\": \"" + wrong + "\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_CODE_ATTEMPTS_EXCEEDED"));

        // The code is gone: even the right one no longer works, a new one must be asked for.
        deactivate(user, "{\"verificationCode\": \"" + code + "\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_CODE_EXPIRED"));
        assertThat(isActive("u24-burn@example.com")).isTrue();

        liftResendWait();
        String fresh = issueCode(user, "DEACTIVATE");
        deactivate(user, "{\"verificationCode\": \"" + fresh + "\"}").andExpect(status().isOk());
    }

    @Test
    void deactivate_withNoCodeAsked_orAnExpiredOne_is400Expired() throws Exception {
        User user = register("u24-expired@example.com", PASSWORD);

        deactivate(user, "{\"verificationCode\": \"123456\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_CODE_EXPIRED"));

        String code = issueCode(user, "DEACTIVATE");
        redis.delete(redis.keys("user:confirm:code:*")); // what the 15-minute expiry does
        deactivate(user, "{\"verificationCode\": \"" + code + "\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_CODE_EXPIRED"));
        assertThat(isActive("u24-expired@example.com")).isTrue();
    }

    @Test
    void deactivate_aCodeAskedForAPasswordChange_doesNotDeactivate() throws Exception {
        User user = register("u24-purpose2@example.com", PASSWORD);
        String code = issueCode(user, "CHANGE_PASSWORD");

        deactivate(user, "{\"verificationCode\": \"" + code + "\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_CODE_EXPIRED"));

        assertThat(isActive("u24-purpose2@example.com")).isTrue();
        // ...and it is still good for the purpose it was asked for.
        changePassword(user, "{\"verificationCode\": \"" + code + "\", \"newPassword\": \"" + NEW_PASSWORD + "\"}")
                .andExpect(status().isOk());
    }

    @Test
    void deactivate_withBothProofsOrNeither_is400_confirmationRequired() throws Exception {
        User user = register("u24-both@example.com", PASSWORD);
        String code = issueCode(user, "DEACTIVATE");

        deactivate(user, "{\"currentPassword\": \"" + PASSWORD + "\", \"verificationCode\": \"" + code + "\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("CONFIRMATION_REQUIRED"));
        deactivate(user, "{}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("CONFIRMATION_REQUIRED"));

        assertThat(isActive("u24-both@example.com")).isTrue();
    }

    @Test
    void deactivate_afterFiveWrongPasswords_isRefusedWithoutAskingKeycloak_evenWithTheRightOne() throws Exception {
        User user = register("u24-lock@example.com", PASSWORD);

        for (int attempt = 1; attempt <= 5; attempt++) {
            deactivate(user, "{\"currentPassword\": \"wrong-" + attempt + "\"}")
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errorCode").value("CURRENT_PASSWORD_INCORRECT"));
        }
        deactivate(user, "{\"currentPassword\": \"" + PASSWORD + "\"}")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.errorCode").value("PASSWORD_ATTEMPTS_EXCEEDED"))
                .andExpect(jsonPath("$.errorParams.seconds").isNumber());
        assertThat(isActive("u24-lock@example.com")).isTrue();

        // The emailed code is not behind that limit.
        String code = issueCode(user, "DEACTIVATE");
        deactivate(user, "{\"verificationCode\": \"" + code + "\"}").andExpect(status().isOk());
    }

    @Test
    void deactivate_whileKeycloakIsDown_is503_andNothingChanges() throws Exception {
        User user = register("u24-down@example.com", PASSWORD);
        TestKeycloak.tokenEndpointAvailable(false);

        deactivate(user, "{\"currentPassword\": \"" + PASSWORD + "\"}")
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.errorCode").value("SERVICE_UNAVAILABLE"));

        assertThat(isActive("u24-down@example.com")).isTrue();
    }

    // ---------- password change ----------

    @Test
    void changePassword_withTheCurrentPassword_setsTheNewOneInKeycloak() throws Exception {
        User user = register("u24-chg@example.com", PASSWORD);

        changePassword(user, "{\"currentPassword\": \"" + PASSWORD + "\", \"newPassword\": \"" + NEW_PASSWORD + "\"}")
                .andExpect(status().isOk());

        assertThat(TestKeycloak.passwordOf(user.getId())).isEqualTo(NEW_PASSWORD);
    }

    @Test
    void changePassword_withTheEmailedCode_setsTheNewOne_evenForAUserWhoHadNone() throws Exception {
        User social = register("u24-first@example.com", null);
        String code = issueCode(social, "CHANGE_PASSWORD");

        changePassword(social, "{\"verificationCode\": \"" + code + "\", \"newPassword\": \"" + NEW_PASSWORD + "\"}")
                .andExpect(status().isOk());

        assertThat(TestKeycloak.passwordOf(social.getId())).isEqualTo(NEW_PASSWORD);
        // The code was consumed.
        changePassword(social, "{\"verificationCode\": \"" + code + "\", \"newPassword\": \"another-pass-1\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_CODE_EXPIRED"));
        assertThat(TestKeycloak.passwordOf(social.getId())).isEqualTo(NEW_PASSWORD);
    }

    @Test
    void changePassword_withAWrongCurrentPassword_is400_andChangesNothing() throws Exception {
        User user = register("u24-chgwrong@example.com", PASSWORD);

        changePassword(user, "{\"currentPassword\": \"nope\", \"newPassword\": \"" + NEW_PASSWORD + "\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("CURRENT_PASSWORD_INCORRECT"));

        assertThat(TestKeycloak.passwordOf(user.getId())).isEqualTo(PASSWORD);
    }

    @Test
    void changePassword_theRealmRefusesTheNewValue_is400_andThePasswordIsUnchanged() throws Exception {
        User user = register("u24-policy@example.com", PASSWORD);

        changePassword(user, "{\"currentPassword\": \"" + PASSWORD + "\", \"newPassword\": \"" + TestKeycloak.POLICY_REJECTED_PASSWORD + "\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("NEW_PASSWORD_REJECTED"));

        assertThat(TestKeycloak.passwordOf(user.getId())).isEqualTo(PASSWORD);
    }

    @Test
    void changePassword_withAShortNewPassword_is400_validationFailed() throws Exception {
        User user = register("u24-short@example.com", PASSWORD);

        changePassword(user, "{\"currentPassword\": \"" + PASSWORD + "\", \"newPassword\": \"short\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"));

        assertThat(TestKeycloak.passwordOf(user.getId())).isEqualTo(PASSWORD);
    }

    @Test
    void changePassword_whenTheKeycloakAdminApiIsDown_is503_andThePasswordIsUnchanged() throws Exception {
        User user = register("u24-admin@example.com", PASSWORD);
        TestKeycloak.adminAvailable(false);

        changePassword(user, "{\"currentPassword\": \"" + PASSWORD + "\", \"newPassword\": \"" + NEW_PASSWORD + "\"}")
                .andExpect(status().isServiceUnavailable());

        TestKeycloak.adminAvailable(true);
        assertThat(TestKeycloak.passwordOf(user.getId())).isEqualTo(PASSWORD);
    }

    @Test
    void changePassword_withoutAToken_is401() throws Exception {
        mockMvc.perform(put("/api/users/me/password").with(anonymous()).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\": \"x\", \"newPassword\": \"" + NEW_PASSWORD + "\"}"))
                .andExpect(status().isUnauthorized());
    }
}
