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
import org.springframework.data.domain.Range;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import java.util.List;
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
 * U26 end-to-end: changing the account's email, through the real request pipeline, the real {@code UserServiceImpl},
 * {@code ConfirmationCodeStore} on a real Redis and the real Keycloak client talking to {@link TestKeycloak}, which
 * answers the admin user calls (search, record update with the realm's duplicate and username refusals, identity links)
 * the way the realm does. Delivery is mocked so the test reads the codes that would have been emailed.
 *
 * <p>Every requirement of the ticket has a case here: the two steps, both proofs, the duplicate rule (exact address and
 * the A35 spellings, held in the database or only in Keycloak), the effect (new email, verified, key, username, Google
 * unlinked, Google picture cleared, other attributes kept), what is dropped (pending codes, the cooldown) and every
 * refusal leaving the account exactly as it was.
 */
class ChangeEmailIntegrationTest extends RedisBaseIT {

    private static final String PASSWORD = "password123";
    private static final String GOOGLE_PICTURE = "https://lh3.googleusercontent.com/a/pic";
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
        TestKeycloak.resetIdentities();
        TestKeycloak.adminAvailable(true);
    }

    @AfterEach
    void tearDown() {
        TestKeycloak.resetIdentities();
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

    /** An active user in the database and in Keycloak (username = email, as a registration leaves it). */
    private User register(String email, String password) {
        Role userRole = roleRepository.findByName(Role.USER).orElseThrow();
        User saved = userRepository.save(User.builder()
                .email(email).firstName("Change").lastName("Tester").isActive(true).isEmailVerified(false)
                .roles(Set.of(userRole)).build());
        TestKeycloak.registerUser(saved.getId(), email, email, password);
        return saved;
    }

    private ResultActions as(User user, MockHttpServletRequestBuilder request, String body) throws Exception {
        return mockMvc.perform(request.header("Authorization", bearer(user.getId())).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions requestNewEmailCode(User user, String newEmail) throws Exception {
        return as(user, post("/api/users/me/email-change-code"), "{\"newEmail\": \"" + newEmail + "\"}");
    }

    private ResultActions requestOwnCode(User user) throws Exception {
        return as(user, post("/api/users/me/confirmation-code"), "{\"purpose\": \"CHANGE_EMAIL\"}");
    }

    private ResultActions changeEmail(User user, String body) throws Exception {
        return as(user, put("/api/users/me/email"), body);
    }

    private static String body(String newEmail, String newEmailCode, String proofField, String proofValue) {
        String proof = proofField == null ? "" : ", \"" + proofField + "\": \"" + proofValue + "\"";
        return "{\"newEmail\": \"" + newEmail + "\", \"newEmailCode\": \"" + newEmailCode + "\"" + proof + "}";
    }

    /** Asks for the new-address code and returns the digits of the mail that was "sent" to {@code newEmail}. */
    private String issueNewEmailCode(User user, String newEmail) throws Exception {
        Mockito.clearInvocations(emailSender);
        requestNewEmailCode(user, newEmail).andExpect(status().isOk());
        return codeSentTo(newEmail);
    }

    /** Asks for the CHANGE_EMAIL proof code (mailed to the current address) and returns its digits. */
    private String issueOwnCode(User user) throws Exception {
        Mockito.clearInvocations(emailSender);
        requestOwnCode(user).andExpect(status().isOk());
        return codeSentTo(user.getEmail());
    }

    private String codeSentTo(String address) {
        ArgumentCaptor<EmailMessage> sent = ArgumentCaptor.forClass(EmailMessage.class);
        Mockito.verify(emailSender).send(sent.capture());
        assertThat(sent.getValue().getTo()).isEqualTo(address.toLowerCase());
        Matcher m = CODE.matcher(sent.getValue().getBody());
        assertThat(m.find()).as("a 6-digit code in the email").isTrue();
        return m.group(1);
    }

    private void liftResendWait() {
        var keys = redis.keys("user:confirm:resend:*");
        if (keys != null && !keys.isEmpty()) {
            redis.delete(keys);
        }
    }

    private User reload(User user) {
        return userRepository.findById(user.getId()).orElseThrow();
    }

    /** The account is exactly as it was: database copy, and what Keycloak holds. */
    private void assertUntouched(User user, String email, boolean verified, int links) {
        User stored = reload(user);
        assertThat(stored.getEmail()).isEqualTo(email);
        assertThat(stored.getIsEmailVerified()).isEqualTo(verified);
        assertThat(TestKeycloak.emailOf(user.getId())).isEqualTo(email);
        assertThat(TestKeycloak.isEmailVerified(user.getId())).isEqualTo(verified);
        assertThat(TestKeycloak.identityLinks(user.getId())).hasSize(links);
    }

    // ---------- step 1: the code to the new address ----------

    @Test
    void step1_mailsTheCodeToTheNewAddress_withTheCountdown_andChangesNothing() throws Exception {
        User user = register("u26-a@example.com", PASSWORD);

        requestNewEmailCode(user, "U26-New@Example.com")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.resendAfterSeconds").value(60))
                .andExpect(jsonPath("$.data.expiresInSeconds").value(900));

        ArgumentCaptor<EmailMessage> sent = ArgumentCaptor.forClass(EmailMessage.class);
        Mockito.verify(emailSender).send(sent.capture());
        assertThat(sent.getValue().getTo()).isEqualTo("u26-new@example.com");
        assertThat(sent.getValue().getBody()).containsPattern("\\d{6}").contains("15");
        assertUntouched(user, "u26-a@example.com", false, 0);
    }

    @Test
    void step1_anAddressAnotherAccountHolds_is409_andNothingIsMailed() throws Exception {
        User user = register("u26-b@example.com", PASSWORD);
        register("u26-taken@example.com", PASSWORD);

        requestNewEmailCode(user, "U26-Taken@example.com")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("EMAIL_ALREADY_REGISTERED"));

        Mockito.verify(emailSender, Mockito.never()).send(Mockito.any());
    }

    @Test
    void step1_aGmailSpellingOfAMailboxOnlyKeycloakKnows_is409_byTheA35Key() throws Exception {
        User user = register("u26-c@example.com", PASSWORD);
        // Only Keycloak holds it (no row in our table): the answer can only come from the search by email_normalized.
        TestKeycloak.registerUser(UUID.randomUUID(), "u26jdoe@gmail.com", "u26jdoe@gmail.com", PASSWORD);

        for (String spelling : List.of("u26.jdoe@gmail.com", "u26jdoe+shop@gmail.com", "U26.JDoe@googlemail.com")) {
            requestNewEmailCode(user, spelling)
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.errorCode").value("EMAIL_ALREADY_REGISTERED"));
        }
        Mockito.verify(emailSender, Mockito.never()).send(Mockito.any());
        // A different mailbox on the same provider is free.
        requestNewEmailCode(user, "u26other@gmail.com").andExpect(status().isOk());
    }

    @Test
    void step1_theAccountsOwnAddress_is400_sameAsCurrent() throws Exception {
        User user = register("u26-d@example.com", PASSWORD);

        requestNewEmailCode(user, "U26-D@Example.com")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("NEW_EMAIL_SAME_AS_CURRENT"));

        Mockito.verify(emailSender, Mockito.never()).send(Mockito.any());
    }

    @Test
    void step1_notAnEmail_orNoAddress_is400_validationFailed() throws Exception {
        User user = register("u26-e@example.com", PASSWORD);

        requestNewEmailCode(user, "not-an-email").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"));
        as(user, post("/api/users/me/email-change-code"), "{}").andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"));
    }

    @Test
    void step1_asksTheSecondTimeTooSoon_is429WithTheWait_andTheDailyLimitIsEnforced() throws Exception {
        User user = register("u26-f@example.com", PASSWORD);
        requestNewEmailCode(user, "u26-f1@example.com").andExpect(status().isOk());

        requestNewEmailCode(user, "u26-f2@example.com")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_RESEND_TOO_SOON"))
                .andExpect(jsonPath("$.errorParams.seconds").isNumber());
        Mockito.verify(emailSender, Mockito.times(1)).send(Mockito.any());

        liftResendWait();
        redis.opsForValue().set("user:confirm:new-email-day:" + user.getId(), "10");
        requestNewEmailCode(user, "u26-f3@example.com")
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.errorCode").value("NEW_EMAIL_CODE_LIMIT_REACHED"))
                .andExpect(jsonPath("$.errorParams.seconds").isNumber());
        Mockito.verify(emailSender, Mockito.times(1)).send(Mockito.any());
    }

    @Test
    void step1_theGenericCodeEndpointRefusesTheNewEmailPurpose() throws Exception {
        User user = register("u26-g@example.com", PASSWORD);

        as(user, post("/api/users/me/confirmation-code"), "{\"purpose\": \"NEW_EMAIL\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"));

        Mockito.verify(emailSender, Mockito.never()).send(Mockito.any());
    }

    private User deactivatedUser(String email) {
        User user = register(email, PASSWORD);
        user.setIsActive(false);
        return userRepository.save(user);
    }

    @Test
    void bothSteps_forADeactivatedCaller_areRefusedAtTheGate_401() throws Exception {
        User user = deactivatedUser("u26-h@example.com");

        requestNewEmailCode(user, "u26-h-new@example.com").andExpect(status().isUnauthorized());
        changeEmail(user, body("u26-h-new@example.com", "123456", "currentPassword", PASSWORD)).andExpect(status().isUnauthorized());

        Mockito.verify(emailSender, Mockito.never()).send(Mockito.any());
        assertThat(TestKeycloak.emailOf(user.getId())).isEqualTo("u26-h@example.com");
    }

    // The two cases below authenticate directly, past the gate, to reach the service's own active check (one per test method:
    // the filter chain clears the context after a request).
    @Test
    void step1_forADeactivatedCaller_is404InTheService_andNothingIsMailed() throws Exception {
        User user = deactivatedUser("u26-h2@example.com");
        authenticateAs(user.getId());

        mockMvc.perform(post("/api/users/me/email-change-code").contentType(MediaType.APPLICATION_JSON)
                .content("{\"newEmail\": \"u26-h2-new@example.com\"}")).andExpect(status().isNotFound());

        Mockito.verify(emailSender, Mockito.never()).send(Mockito.any());
    }

    @Test
    void step2_forADeactivatedCaller_is404InTheService_andNothingIsChanged() throws Exception {
        User user = deactivatedUser("u26-h3@example.com");
        authenticateAs(user.getId());

        mockMvc.perform(put("/api/users/me/email").contentType(MediaType.APPLICATION_JSON)
                .content(body("u26-h3-new@example.com", "123456", "currentPassword", PASSWORD))).andExpect(status().isNotFound());

        assertThat(TestKeycloak.emailOf(user.getId())).isEqualTo("u26-h3@example.com");
        assertThat(reload(user).getEmail()).isEqualTo("u26-h3@example.com");
    }

    @Test
    void bothSteps_withoutAToken_are401() throws Exception {
        mockMvc.perform(post("/api/users/me/email-change-code").with(anonymous())
                .contentType(MediaType.APPLICATION_JSON).content("{\"newEmail\": \"x@example.com\"}")).andExpect(status().isUnauthorized());
        mockMvc.perform(put("/api/users/me/email").with(anonymous())
                .contentType(MediaType.APPLICATION_JSON).content(body("x@example.com", "123456", "currentPassword", PASSWORD)))
                .andExpect(status().isUnauthorized());
    }

    // ---------- step 2: the change ----------

    @Test
    void change_withThePassword_movesTheAccount_inKeycloakAndInTheDatabase() throws Exception {
        User user = register("u26-i@example.com", PASSWORD);
        TestKeycloak.setAttribute(user.getId(), "country", "VN");
        String code = issueNewEmailCode(user, "U26-I-New@example.com");

        changeEmail(user, body("u26-i-new@example.com", code, "currentPassword", PASSWORD)).andExpect(status().isOk());

        User stored = reload(user);
        assertThat(stored.getEmail()).isEqualTo("u26-i-new@example.com");
        assertThat(stored.getIsEmailVerified()).isTrue();
        assertThat(TestKeycloak.emailOf(user.getId())).isEqualTo("u26-i-new@example.com");
        assertThat(TestKeycloak.isEmailVerified(user.getId())).isTrue();
        assertThat(TestKeycloak.attributesOf(user.getId()).get("email_normalized")).containsExactly("u26-i-new@example.com");
        // an update replaces the attribute map: the others must have been sent back
        assertThat(TestKeycloak.attributesOf(user.getId()).get("country")).containsExactly("VN");
    }

    @Test
    void change_theUsernameFollowsTheEmail_whenItWasTheOldEmail_andTheOldAddressNoLongerSignsIn() throws Exception {
        User user = register("u26-j@example.com", PASSWORD);
        String code = issueNewEmailCode(user, "u26-j-new@example.com");

        changeEmail(user, body("u26-j-new@example.com", code, "currentPassword", PASSWORD)).andExpect(status().isOk());

        assertThat(TestKeycloak.usernameOf(user.getId())).isEqualTo("u26-j-new@example.com");
        // the credentials client's password grant (what the backend and the login use) knows only the new username
        assertThat(passwordGrant("u26-j@example.com", PASSWORD)).isEqualTo(401);
        assertThat(passwordGrant("u26-j-new@example.com", PASSWORD)).isEqualTo(200);
    }

    @Test
    void change_anyOtherUsername_isLeftAlone() throws Exception {
        Role userRole = roleRepository.findByName(Role.USER).orElseThrow();
        User user = userRepository.save(User.builder().email("u26-k@example.com").firstName("K").lastName("K")
                .isActive(true).roles(Set.of(userRole)).build());
        TestKeycloak.registerUser(user.getId(), "janedoe", "u26-k@example.com", PASSWORD);
        String code = issueNewEmailCode(user, "u26-k-new@example.com");

        changeEmail(user, body("u26-k-new@example.com", code, "currentPassword", PASSWORD)).andExpect(status().isOk());

        assertThat(TestKeycloak.usernameOf(user.getId())).isEqualTo("janedoe");
        assertThat(reload(user).getEmail()).isEqualTo("u26-k-new@example.com");
    }

    @Test
    void change_withTheCodeMailedToTheCurrentAddress_worksForAGoogleOnlyAccount_andUnlinksGoogleAndClearsItsPicture() throws Exception {
        User user = register("u26-l@example.com", null); // no password: a Google-only account
        user.setAvatarUrl(GOOGLE_PICTURE);
        user.setGoogleAvatarCheckedAt(java.time.LocalDateTime.now());
        userRepository.save(user);
        TestKeycloak.linkIdentity(user.getId(), "google");
        TestKeycloak.setAttribute(user.getId(), "picture", GOOGLE_PICTURE);
        String ownCode = issueOwnCode(user);
        String newCode = issueNewEmailCode(user, "u26-l-new@example.com");

        changeEmail(user, body("u26-l-new@example.com", newCode, "verificationCode", ownCode)).andExpect(status().isOk());

        assertThat(TestKeycloak.identityLinks(user.getId())).isEmpty();
        assertThat(TestKeycloak.attributesOf(user.getId())).doesNotContainKey("picture");
        User stored = reload(user);
        assertThat(stored.getAvatarUrl()).isNull();
        assertThat(stored.getGoogleAvatarCheckedAt()).isNull();
        assertThat(stored.getEmail()).isEqualTo("u26-l-new@example.com");
        // the chat service's copy of the avatar follows
        var events = redis.opsForStream().range("sportconnect:domain-events", Range.unbounded());
        assertThat(events).anySatisfy(record -> {
            assertThat(record.getValue().get("event_type")).isEqualTo("user.profile_updated");
            assertThat(String.valueOf(record.getValue().get("payload"))).contains(user.getId().toString()).contains("\"avatar_url\":\"\"");
        });
    }

    @Test
    void change_anAvatarTheUserSetThemselves_isKept_whenGoogleIsUnlinked() throws Exception {
        User user = register("u26-m@example.com", PASSWORD);
        user.setAvatarUrl("https://cdn.example.com/own.png");
        userRepository.save(user);
        TestKeycloak.linkIdentity(user.getId(), "google");
        String code = issueNewEmailCode(user, "u26-m-new@example.com");

        changeEmail(user, body("u26-m-new@example.com", code, "currentPassword", PASSWORD)).andExpect(status().isOk());

        assertThat(reload(user).getAvatarUrl()).isEqualTo("https://cdn.example.com/own.png");
        assertThat(TestKeycloak.identityLinks(user.getId())).isEmpty();
    }

    @Test
    void change_dropsTheCodesThatWerePending_andTheVerificationCooldown() throws Exception {
        User user = register("u26-n@example.com", PASSWORD);
        String stale = issueOwnCode(user); // mailed to the old address, would stay valid 15 minutes
        liftResendWait();
        requestAnyCode(user, "DEACTIVATE");
        redis.opsForValue().set("user:confirm:email-verify-resend:" + user.getId(), "1");
        String code = issueNewEmailCode(user, "u26-n-new@example.com");

        changeEmail(user, body("u26-n-new@example.com", code, "currentPassword", PASSWORD)).andExpect(status().isOk());

        var left = redis.keys("user:confirm:code:*" + user.getId());
        assertThat(left).isNullOrEmpty();
        assertThat(redis.hasKey("user:confirm:email-verify-resend:" + user.getId())).isFalse();
        // and a stale code of the old address no longer deactivates the account
        as(user, post("/api/users/me/deactivate"), "{\"verificationCode\": \"" + stale + "\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_CODE_EXPIRED"));
        assertThat(reload(user).getIsActive()).isTrue();
    }

    private void requestAnyCode(User user, String purpose) throws Exception {
        as(user, post("/api/users/me/confirmation-code"), "{\"purpose\": \"" + purpose + "\"}").andExpect(status().isOk());
    }

    @Test
    void change_forAPhoneOnlyAccount_addsItsFirstEmail_withThePassword() throws Exception {
        Role userRole = roleRepository.findByName(Role.USER).orElseThrow();
        User user = userRepository.save(User.builder().phoneNumber("+84901112244").phoneStatus(PhoneStatus.VALID)
                .firstName("Phone").lastName("Only").isActive(true).roles(Set.of(userRole)).build());
        TestKeycloak.registerUser(user.getId(), "+84901112244", PASSWORD);
        String code = issueNewEmailCode(user, "u26-o-first@example.com");

        changeEmail(user, body("u26-o-first@example.com", code, "currentPassword", PASSWORD)).andExpect(status().isOk());

        assertThat(reload(user).getEmail()).isEqualTo("u26-o-first@example.com");
        assertThat(TestKeycloak.usernameOf(user.getId())).isEqualTo("+84901112244");
        assertThat(TestKeycloak.emailOf(user.getId())).isEqualTo("u26-o-first@example.com");
    }

    // ---------- every refusal leaves the account as it was ----------

    @Test
    void refusal_aWrongPassword_isCurrentPasswordIncorrect_andTheNewAddressCodeIsNotSpent() throws Exception {
        User user = register("u26-p@example.com", PASSWORD);
        String code = issueNewEmailCode(user, "u26-p-new@example.com");

        changeEmail(user, body("u26-p-new@example.com", code, "currentPassword", "wrong-password"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("CURRENT_PASSWORD_INCORRECT"));
        assertUntouched(user, "u26-p@example.com", false, 0);

        // the same new-address code still works with the right password
        changeEmail(user, body("u26-p-new@example.com", code, "currentPassword", PASSWORD)).andExpect(status().isOk());
    }

    @Test
    void refusal_neitherOrBothProofs_isConfirmationRequired() throws Exception {
        User user = register("u26-q@example.com", PASSWORD);
        String code = issueNewEmailCode(user, "u26-q-new@example.com");

        changeEmail(user, body("u26-q-new@example.com", code, null, null))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errorCode").value("CONFIRMATION_REQUIRED"));
        changeEmail(user, "{\"newEmail\": \"u26-q-new@example.com\", \"newEmailCode\": \"" + code
                + "\", \"currentPassword\": \"" + PASSWORD + "\", \"verificationCode\": \"123456\"}")
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.errorCode").value("CONFIRMATION_REQUIRED"));
        assertUntouched(user, "u26-q@example.com", false, 0);
    }

    @Test
    void refusal_aWrongNewAddressCode_isVerificationCodeInvalid() throws Exception {
        User user = register("u26-r@example.com", PASSWORD);
        String code = issueNewEmailCode(user, "u26-r-new@example.com");
        String wrong = code.equals("000000") ? "000001" : "000000";

        changeEmail(user, body("u26-r-new@example.com", wrong, "currentPassword", PASSWORD))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_CODE_INVALID"))
                .andExpect(jsonPath("$.errorParams.purpose").value("NEW_EMAIL"));
        assertUntouched(user, "u26-r@example.com", false, 0);
    }

    @Test
    void refusal_aCodeMailedToOneAddressCannotChangeTheEmailToAnother() throws Exception {
        User user = register("u26-s@example.com", PASSWORD);
        String code = issueNewEmailCode(user, "u26-s-mine@example.com");

        changeEmail(user, body("u26-s-other@example.com", code, "currentPassword", PASSWORD))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_CODE_INVALID"));
        assertUntouched(user, "u26-s@example.com", false, 0);
    }

    @Test
    void refusal_aNewCodeForAnotherAddressReplacesThePendingOne() throws Exception {
        User user = register("u26-t@example.com", PASSWORD);
        String first = issueNewEmailCode(user, "u26-t-first@example.com");
        liftResendWait();
        String second = issueNewEmailCode(user, "u26-t-second@example.com");

        changeEmail(user, body("u26-t-first@example.com", first, "currentPassword", PASSWORD))
                .andExpect(status().isBadRequest());
        changeEmail(user, body("u26-t-second@example.com", second, "currentPassword", PASSWORD)).andExpect(status().isOk());
    }

    @Test
    void refusal_aNewAddressCodeBurnsAfterFiveWrongTries_andAnExpiredOneIsRefused() throws Exception {
        User user = register("u26-u@example.com", PASSWORD);
        String code = issueNewEmailCode(user, "u26-u-new@example.com");
        String wrong = code.equals("000000") ? "000001" : "000000";

        for (int i = 0; i < 4; i++) {
            changeEmail(user, body("u26-u-new@example.com", wrong, "currentPassword", PASSWORD))
                    .andExpect(jsonPath("$.errorCode").value("VERIFICATION_CODE_INVALID"));
        }
        changeEmail(user, body("u26-u-new@example.com", wrong, "currentPassword", PASSWORD))
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_CODE_ATTEMPTS_EXCEEDED"))
                .andExpect(jsonPath("$.errorParams.purpose").value("NEW_EMAIL"));
        changeEmail(user, body("u26-u-new@example.com", code, "currentPassword", PASSWORD))
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_CODE_EXPIRED"));
        assertUntouched(user, "u26-u@example.com", false, 0);
    }

    @Test
    void refusal_anAddressTakenSinceTheCodeWasSent_is409_andNothingChanges() throws Exception {
        User user = register("u26-v@example.com", PASSWORD);
        TestKeycloak.linkIdentity(user.getId(), "google");
        String code = issueNewEmailCode(user, "u26v.race@gmail.com");
        // someone registers another spelling of that mailbox (dots do not count at Gmail) in the meantime
        TestKeycloak.registerUser(UUID.randomUUID(), "u26vrace@gmail.com", "u26vrace@gmail.com", PASSWORD);

        changeEmail(user, body("u26v.race@gmail.com", code, "currentPassword", PASSWORD))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("EMAIL_ALREADY_REGISTERED"));
        assertUntouched(user, "u26-v@example.com", false, 1);
    }

    @Test
    void refusal_theAccountsOwnAddress_is400_andNoProofIsSpent() throws Exception {
        User user = register("u26-w@example.com", PASSWORD);
        String own = issueOwnCode(user);

        changeEmail(user, body("U26-W@example.com", "123456", "verificationCode", own))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("NEW_EMAIL_SAME_AS_CURRENT"));

        // the proof code was not consumed by the refused request
        String newCode = issueNewEmailCode(user, "u26-w-new@example.com");
        changeEmail(user, body("u26-w-new@example.com", newCode, "verificationCode", own)).andExpect(status().isOk());
    }

    @Test
    void refusal_keycloakDown_is503_andTheDatabaseCopyIsUntouched() throws Exception {
        User user = register("u26-x@example.com", PASSWORD);
        TestKeycloak.linkIdentity(user.getId(), "google");
        String code = issueNewEmailCode(user, "u26-x-new@example.com");

        TestKeycloak.adminAvailable(false);
        changeEmail(user, body("u26-x-new@example.com", code, "currentPassword", PASSWORD)).andExpect(status().isServiceUnavailable());
        TestKeycloak.adminAvailable(true);

        assertThat(reload(user).getEmail()).isEqualTo("u26-x@example.com");
        assertThat(TestKeycloak.emailOf(user.getId())).isEqualTo("u26-x@example.com");
        assertThat(TestKeycloak.identityLinks(user.getId())).hasSize(1);
    }

    @Test
    void refusal_aRealmThatDoesNotAllowUsernameChanges_is503_andNothingChanges() throws Exception {
        User user = register("u26-y@example.com", PASSWORD);
        String code = issueNewEmailCode(user, "u26-y-new@example.com");

        TestKeycloak.editUsernameAllowed(false);
        changeEmail(user, body("u26-y-new@example.com", code, "currentPassword", PASSWORD)).andExpect(status().isServiceUnavailable());

        assertThat(reload(user).getEmail()).isEqualTo("u26-y@example.com");
        assertThat(TestKeycloak.emailOf(user.getId())).isEqualTo("u26-y@example.com");
        assertThat(TestKeycloak.usernameOf(user.getId())).isEqualTo("u26-y@example.com");
    }

    @Test
    void afterTheChange_theOldAddressIsFree_andTheNewOneIsTaken() throws Exception {
        User user = register("u26-z@example.com", PASSWORD);
        User other = register("u26-z-other@example.com", PASSWORD);
        String code = issueNewEmailCode(user, "u26-z-new@example.com");
        changeEmail(user, body("u26-z-new@example.com", code, "currentPassword", PASSWORD)).andExpect(status().isOk());
        liftResendWait();

        // the old address can now be claimed by someone else, the new one cannot
        requestNewEmailCode(other, "u26-z@example.com").andExpect(status().isOk());
        liftResendWait();
        requestNewEmailCode(other, "u26-z-new@example.com").andExpect(status().isConflict());
    }

    // ---------- a refusal does not cost the user a code they typed correctly ----------

    @Test
    void refusal_aWrongOrExpiredNewAddressCode_keepsTheCodeMailedToTheCurrentAddressUsable() throws Exception {
        User user = register("u26-aa@example.com", PASSWORD);
        String own = issueOwnCode(user);
        String code = issueNewEmailCode(user, "u26-aa-new@example.com");
        String wrong = code.equals("000000") ? "000001" : "000000";

        changeEmail(user, body("u26-aa-new@example.com", wrong, "verificationCode", own))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_CODE_INVALID"))
                .andExpect(jsonPath("$.errorParams.purpose").value("NEW_EMAIL"));
        // the new-address code expires (Redis drops it)
        redis.delete("user:confirm:code:NEW_EMAIL:" + user.getId());
        changeEmail(user, body("u26-aa-new@example.com", code, "verificationCode", own))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_CODE_EXPIRED"))
                .andExpect(jsonPath("$.errorParams.purpose").value("NEW_EMAIL"));
        assertUntouched(user, "u26-aa@example.com", false, 0);
        assertThat(redis.hasKey("user:confirm:code:CHANGE_EMAIL:" + user.getId())).isTrue();

        // a fresh new-address code and the SAME code from the current address complete the change
        liftResendWait();
        String fresh = issueNewEmailCode(user, "u26-aa-new@example.com");
        changeEmail(user, body("u26-aa-new@example.com", fresh, "verificationCode", own)).andExpect(status().isOk());
        assertThat(TestKeycloak.emailOf(user.getId())).isEqualTo("u26-aa-new@example.com");
    }

    @Test
    void refusal_aWrongCodeFromTheCurrentAddress_keepsTheNewAddressCodeUsable() throws Exception {
        User user = register("u26-ab@example.com", PASSWORD);
        String own = issueOwnCode(user);
        String wrongOwn = own.equals("000000") ? "000001" : "000000";
        String code = issueNewEmailCode(user, "u26-ab-new@example.com");

        changeEmail(user, body("u26-ab-new@example.com", code, "verificationCode", wrongOwn))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_CODE_INVALID"))
                .andExpect(jsonPath("$.errorParams.purpose").value("CHANGE_EMAIL"));
        assertThat(redis.hasKey("user:confirm:code:NEW_EMAIL:" + user.getId())).isTrue();

        changeEmail(user, body("u26-ab-new@example.com", code, "verificationCode", own)).andExpect(status().isOk());
    }

    @Test
    void refusal_anAddressTakenSinceTheCodeWasSent_dropsTheNewAddressCode_butKeepsTheCurrentAddressCode() throws Exception {
        User user = register("u26-ac@example.com", PASSWORD);
        String own = issueOwnCode(user);
        String code = issueNewEmailCode(user, "u26ac.race@gmail.com");
        TestKeycloak.registerUser(UUID.randomUUID(), "u26acrace@gmail.com", "u26acrace@gmail.com", PASSWORD);

        changeEmail(user, body("u26ac.race@gmail.com", code, "verificationCode", own))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("EMAIL_ALREADY_REGISTERED"));

        assertThat(redis.hasKey("user:confirm:code:NEW_EMAIL:" + user.getId())).isFalse();
        assertThat(redis.hasKey("user:confirm:code:CHANGE_EMAIL:" + user.getId())).isTrue();
        // the taken address's code is gone for good, even for the same address
        changeEmail(user, body("u26ac.race@gmail.com", code, "verificationCode", own))
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_CODE_EXPIRED"));

        // another address needs its own verification, and the same code from the current address still counts
        liftResendWait();
        String other = issueNewEmailCode(user, "u26-ac-other@example.com");
        changeEmail(user, body("u26-ac-other@example.com", other, "verificationCode", own)).andExpect(status().isOk());
    }

    @Test
    void refusal_keycloakDown_is503_andBothCodesStayUsable() throws Exception {
        User user = register("u26-ad@example.com", PASSWORD);
        String own = issueOwnCode(user);
        String code = issueNewEmailCode(user, "u26-ad-new@example.com");

        TestKeycloak.adminAvailable(false);
        try {
            changeEmail(user, body("u26-ad-new@example.com", code, "verificationCode", own)).andExpect(status().isServiceUnavailable());
        } finally {
            TestKeycloak.adminAvailable(true);
        }
        assertThat(redis.hasKey("user:confirm:code:NEW_EMAIL:" + user.getId())).isTrue();
        assertThat(redis.hasKey("user:confirm:code:CHANGE_EMAIL:" + user.getId())).isTrue();

        changeEmail(user, body("u26-ad-new@example.com", code, "verificationCode", own)).andExpect(status().isOk());
        assertThat(TestKeycloak.emailOf(user.getId())).isEqualTo("u26-ad-new@example.com");
    }

    @Test
    void change_spendsBothCodes_soTheyCannotBeUsedAgain() throws Exception {
        User user = register("u26-ae@example.com", PASSWORD);
        String own = issueOwnCode(user);
        String code = issueNewEmailCode(user, "u26-ae-new@example.com");
        changeEmail(user, body("u26-ae-new@example.com", code, "verificationCode", own)).andExpect(status().isOk());

        assertThat(redis.hasKey("user:confirm:code:NEW_EMAIL:" + user.getId())).isFalse();
        assertThat(redis.hasKey("user:confirm:code:CHANGE_EMAIL:" + user.getId())).isFalse();
    }

    /** The credentials client's password grant against {@link TestKeycloak}, the way the backend checks a password. */
    private int passwordGrant(String username, String password) throws Exception {
        var request = java.net.http.HttpRequest.newBuilder(java.net.URI.create(TestKeycloak.TOKEN_URI))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(java.net.http.HttpRequest.BodyPublishers.ofString(
                        "grant_type=password&client_id=sportconnect-credentials&client_secret=" + credentialsSecret()
                                + "&username=" + java.net.URLEncoder.encode(username, java.nio.charset.StandardCharsets.UTF_8)
                                + "&password=" + password))
                .build();
        return java.net.http.HttpClient.newHttpClient().send(request, java.net.http.HttpResponse.BodyHandlers.discarding()).statusCode();
    }

    @org.springframework.beans.factory.annotation.Value("${app.keycloak.credentials-client-secret}")
    private String credentialsClientSecret;

    private String credentialsSecret() {
        return credentialsClientSecret;
    }
}
