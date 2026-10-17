package com.sportconnect.integration;

import com.sportconnect.user.api.dto.PhoneStatus;
import com.sportconnect.user.entity.Role;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.RoleRepository;
import com.sportconnect.user.repository.UserPreferenceRepository;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * U23 — a user is identified by an email, a phone (stored as E.164, unique), or both. Through the real request
 * pipeline (the first sign-in {@code POST /api/auth/callback} that provisions the user, A28: the register endpoint is
 * gone; {@code PUT /api/users/{id}/profile}; {@code GlobalExceptionHandler}) and real H2 writes against the
 * {@code schema.sql} mirror of {@code V079}.
 *
 * <p>What a mocked Spock spec cannot prove and this does: that the phone is stored normalised and that the same number
 * typed in another format collides on the real unique column; that the {@code PHONE_ALREADY_USED} /
 * {@code INVALID_PHONE_NUMBER} / {@code IDENTIFIER_REQUIRED} codes reach the client with the right HTTP status; and that
 * the database itself (not only the service) rejects a row with neither identifier and a duplicate phone, while letting
 * any number of rows have no email.
 */
class UserIdentifierConstraintsIntegrationTest extends RedisBaseIT {

    private static final String VERIFIER = "v".repeat(43);

    @Autowired
    private JdbcTemplate jdbc;
    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserPreferenceRepository userPreferenceRepository;
    @Autowired
    private RoleRepository roleRepository;

    @BeforeEach
    void setUp() {
        clean();
        if (roleRepository.findByName(Role.USER).isEmpty()) {
            roleRepository.save(Role.builder().name(Role.USER).description("test").build());
        }
    }

    @AfterEach
    void tearDown() {
        clean();
    }

    private void clean() {
        userPreferenceRepository.deleteAll();
        userRepository.deleteAll();
    }

    /** The first sign-in of a new Keycloak identity: provisions the {@code users} row. */
    private ResultActions firstSignIn(String email, String phone) throws Exception {
        TestKeycloak.Identity identity = TestKeycloak.Identity.of(UUID.randomUUID()).email(email).names("Phone", "Tester");
        if (phone != null) {
            identity = identity.phone(phone);
        }
        String code = TestKeycloak.issueCode(identity, VERIFIER);
        return mockMvc.perform(post("/api/auth/callback").with(anonymous()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\": \"" + code + "\", \"codeVerifier\": \"" + VERIFIER + "\"}"));
    }

    /** An existing user, as an earlier sign-in would have stored them ({@code phone} already in E.164, or null). */
    private User existingUser(String email, String phone) {
        Role userRole = roleRepository.findByName(Role.USER).orElseThrow();
        return userRepository.save(User.builder()
                .email(email)
                .phoneNumber(phone)
                .phoneStatus(phone == null ? null : PhoneStatus.VALID)
                .firstName("Phone")
                .lastName("Tester")
                .isActive(true)
                .roles(Set.of(userRole))
                .build());
    }

    private ResultActions updateProfile(User user, String json) throws Exception {
        return mockMvc.perform(put("/api/users/{id}/profile", user.getId())
                .header("Authorization", bearer(user.getId()))
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private String storedPhone(String email) {
        return userRepository.findByEmail(email).orElseThrow().getPhoneNumber();
    }

    private void insertRaw(String email, String phone) {
        insertRaw(email, phone, phone == null ? null : "VALID");
    }

    private void insertRaw(String email, String phone, String phoneStatus) {
        jdbc.update("INSERT INTO users (id, email, phone_number, phone_status, is_active, created_at) VALUES (?, ?, ?, ?, TRUE, CURRENT_TIMESTAMP)",
                UUID.randomUUID(), email, phone, phoneStatus);
    }

    // ---------- through the request pipeline ----------

    /** A27: a phone-only Keycloak account has the E.164 number as its username; it must not become the public username. */
    @Test
    void firstSignIn_ofAPhoneOnlyAccount_neverCopiesThePhoneUsernameToThePublicUsername() throws Exception {
        String phone = "+84901234567";
        UUID sub = UUID.randomUUID();
        TestKeycloak.Identity identity = TestKeycloak.Identity.of(sub).names("Phone", "Only").phone(phone).username(phone);
        String code = TestKeycloak.issueCode(identity, VERIFIER);

        mockMvc.perform(post("/api/auth/callback").with(anonymous()).contentType(MediaType.APPLICATION_JSON)
                .content("{\"code\": \"" + code + "\", \"codeVerifier\": \"" + VERIFIER + "\"}"))
                .andExpect(status().isOk());

        User saved = userRepository.findById(sub).orElseThrow();
        assertThat(saved.getEmail()).isNull();
        assertThat(saved.getPhoneStatus()).isEqualTo(PhoneStatus.VALID);
        assertThat(saved.getUsername()).isNull();
    }

    @Test
    void firstSignIn_withANationalFormatPhone_storesE164() throws Exception {
        firstSignIn("u23-national@example.com", "0901234567").andExpect(status().isOk());

        assertThat(storedPhone("u23-national@example.com")).isEqualTo("+84901234567");
    }

    @Test
    void firstSignIn_withAPhoneAnotherAccountHoldsInAnotherFormat_isRejectedAndCreatesNoUser() throws Exception {
        existingUser("u23-first@example.com", "+84901234567");

        firstSignIn("u23-second@example.com", "0901 234 567")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("PHONE_ALREADY_USED"));

        assertThat(userRepository.findByEmail("u23-second@example.com")).isEmpty();
    }

    @Test
    void firstSignIn_withAPhoneThatDoesNotParse_isProvisionedWithStatusInvalid_notRefused() throws Exception {
        // U25: the Keycloak account already exists, so a 400 would lock the user out for good.
        firstSignIn("u23-bad@example.com", "555-0100").andExpect(status().isOk());

        User saved = userRepository.findByEmail("u23-bad@example.com").orElseThrow();
        assertThat(saved.getPhoneNumber()).isEqualTo("555-0100");
        assertThat(saved.getPhoneStatus()).isEqualTo(PhoneStatus.INVALID);
    }

    @Test
    void firstSignIn_withNoPhone_leavesItNull() throws Exception {
        firstSignIn("u23-nophone@example.com", null).andExpect(status().isOk());

        assertThat(storedPhone("u23-nophone@example.com")).isNull();
    }

    @Test
    void updateProfile_withAPhoneAnotherAccountHolds_isRejectedWithPhoneAlreadyUsed() throws Exception {
        existingUser("u23-holder@example.com", "+84901234567");
        User other = existingUser("u23-other@example.com", null);

        updateProfile(other, "{\"phoneNumber\": \"0901234567\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("PHONE_ALREADY_USED"));

        assertThat(storedPhone("u23-other@example.com")).isNull();
    }

    @Test
    void updateProfile_resendingTheCallersOwnNumberInAnotherFormat_succeeds() throws Exception {
        User me = existingUser("u23-own@example.com", "+84901234567");

        updateProfile(me, "{\"phoneNumber\": \"0901234567\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.phoneNumber").value("+84901234567"));
    }

    @Test
    void updateProfile_withAPhoneThatDoesNotParse_isSavedAsTypedWithStatusInvalid() throws Exception {
        User me = existingUser("u25-invalid@example.com", "+84901234567");

        updateProfile(me, "{\"phoneNumber\": \"555-0100\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.phoneNumber").value("555-0100"))
                .andExpect(jsonPath("$.data.phoneStatus").value("INVALID"));

        assertThat(storedPhone("u25-invalid@example.com")).isEqualTo("555-0100");

        updateProfile(me, "{\"phoneNumber\": \"0901234567\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.phoneStatus").value("VALID"));
    }

    @Test
    void updateProfile_aPhoneThatDoesNotParse_neverCollidesWithAnotherAccount() throws Exception {
        User first = existingUser("u25-bad-a@example.com", null);
        updateProfile(first, "{\"phoneNumber\": \"not-a-number\"}").andExpect(status().isOk());

        // PHONE_ALREADY_USED is about usable numbers only: a valid number is not blocked by someone's invalid text.
        User second = existingUser("u25-bad-b@example.com", null);
        updateProfile(second, "{\"phoneNumber\": \"0901234567\"}").andExpect(status().isOk());
    }

    @Test
    void updateProfile_replacingTheOnlyIdentifierOfAnEmaillessAccountWithAnInvalidPhone_isRejected() throws Exception {
        User me = existingUser("u25-phoneonly@example.com", "+84901234567");
        jdbc.update("UPDATE users SET email = NULL WHERE phone_number = ?", "+84901234567");

        updateProfile(me, "{\"phoneNumber\": \"555-0100\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("IDENTIFIER_REQUIRED"));
    }

    @Test
    void updateProfile_withABlankPhone_clearsItWhenTheAccountHasAnEmail() throws Exception {
        User me = existingUser("u23-clear@example.com", "+84901234567");

        updateProfile(me, "{\"phoneNumber\": \"\"}").andExpect(status().isOk());

        assertThat(storedPhone("u23-clear@example.com")).isNull();
    }

    @Test
    void updateProfile_clearingTheOnlyIdentifierOfAnEmaillessAccount_isRejectedWithIdentifierRequired() throws Exception {
        // Take the email away from an account the way a phone-only first sign-in would have left it.
        User me = existingUser("u23-phoneonly@example.com", "+84901234567");
        jdbc.update("UPDATE users SET email = NULL WHERE email = ?", "u23-phoneonly@example.com");

        updateProfile(me, "{\"phoneNumber\": \"\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("IDENTIFIER_REQUIRED"));

        Integer withPhone = jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE phone_number = '+84901234567'", Integer.class);
        assertThat(withPhone).isEqualTo(1);
    }

    // ---------- the database itself ----------

    @Test
    void database_rejectsARowWithNeitherEmailNorPhone() {
        assertThatThrownBy(() -> insertRaw(null, null)).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void database_anInvalidPhoneIsNotAnIdentifier() {
        assertThatThrownBy(() -> insertRaw(null, "555-0100", "INVALID")).isInstanceOf(DataIntegrityViolationException.class);
        // with an email it is fine
        insertRaw("u25-db-invalid@example.com", "555-0100", "INVALID");
    }

    @Test
    void database_aPhoneNeedsAStatusAndAStatusNeedsAPhone() {
        assertThatThrownBy(() -> insertRaw("u25-db-a@example.com", "+84901234567", null)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertRaw("u25-db-b@example.com", null, "VALID")).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertRaw("u25-db-c@example.com", "+84901234567", "MAYBE")).isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void database_rejectsADuplicatePhone() {
        insertRaw("u23-dup-a@example.com", "+84901234567");

        assertThatThrownBy(() -> insertRaw("u23-dup-b@example.com", "+84901234567"))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void database_allowsAnyNumberOfRowsWithoutAnEmail_andAnyNumberWithoutAPhone() {
        insertRaw(null, "+84901111111");
        insertRaw(null, "+84902222222");
        insertRaw("u23-nophone-a@example.com", null);
        insertRaw("u23-nophone-b@example.com", null);

        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class)).isEqualTo(4);
    }
}
