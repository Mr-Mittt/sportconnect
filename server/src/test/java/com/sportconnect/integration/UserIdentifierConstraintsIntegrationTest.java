package com.sportconnect.integration;

import com.jayway.jsonpath.JsonPath;
import com.sportconnect.auth.repository.RefreshTokenRepository;
import com.sportconnect.user.entity.Role;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

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
 * pipeline ({@code POST /api/auth/register}, {@code PUT /api/users/{id}/profile}, {@code GlobalExceptionHandler}) and
 * real H2 writes against the {@code schema.sql} mirror of {@code V079}.
 *
 * <p>What a mocked Spock spec cannot prove and this does: that the phone is stored normalised and that the same number
 * typed in another format collides on the real unique column; that the {@code PHONE_ALREADY_USED} /
 * {@code INVALID_PHONE_NUMBER} / {@code IDENTIFIER_REQUIRED} codes reach the client with the right HTTP status; and that
 * the database itself (not only the service) rejects a row with neither identifier and a duplicate phone, while letting
 * any number of rows have no email.
 */
class UserIdentifierConstraintsIntegrationTest extends RedisBaseIT {

    private static final String PASSWORD = "password123";

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
        refreshTokenRepository.deleteAll();
        userPreferenceRepository.deleteAll();
        userRepository.deleteAll();
    }

    private ResultActions register(String email, String phoneJson) throws Exception {
        String body = "{\"email\": \"" + email + "\", \"password\": \"" + PASSWORD + "\", \"fullName\": \"Phone Tester\""
                + (phoneJson == null ? "" : ", \"phoneNumber\": " + phoneJson) + "}";
        return mockMvc.perform(post("/api/auth/register").with(anonymous())
                .contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private MvcResult registerOk(String email, String phoneJson) throws Exception {
        return register(email, phoneJson).andExpect(status().isOk()).andReturn();
    }

    private ResultActions updateProfile(MvcResult session, String json) throws Exception {
        String token = accessTokenOf(session);
        String userId = JsonPath.read(session.getResponse().getContentAsString(), "$.data.user.id");
        return mockMvc.perform(put("/api/users/{id}/profile", userId)
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON).content(json));
    }

    private String storedPhone(String email) {
        return userRepository.findByEmail(email).orElseThrow().getPhoneNumber();
    }

    private void insertRaw(String email, String phone) {
        jdbc.update("INSERT INTO users (id, email, phone_number, is_active, created_at) VALUES (?, ?, ?, TRUE, CURRENT_TIMESTAMP)",
                UUID.randomUUID(), email, phone);
    }

    // ---------- through the request pipeline ----------

    @Test
    void register_withANationalFormatPhone_storesE164() throws Exception {
        register("u23-national@example.com", "\"0901234567\"")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.phoneNumber").value("+84901234567"));

        assertThat(storedPhone("u23-national@example.com")).isEqualTo("+84901234567");
    }

    @Test
    void register_withAPhoneAnotherAccountHoldsInAnotherFormat_isRejectedAndCreatesNoUser() throws Exception {
        registerOk("u23-first@example.com", "\"+84901234567\"");

        register("u23-second@example.com", "\"0901 234 567\"")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("PHONE_ALREADY_USED"));

        assertThat(userRepository.findByEmail("u23-second@example.com")).isEmpty();
    }

    @Test
    void register_withAnInvalidPhone_isABadRequestAndCreatesNoUser() throws Exception {
        register("u23-bad@example.com", "\"555-0100\"")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("INVALID_PHONE_NUMBER"));

        assertThat(userRepository.findByEmail("u23-bad@example.com")).isEmpty();
    }

    @Test
    void register_withNoPhone_leavesItNull() throws Exception {
        registerOk("u23-nophone@example.com", null);

        assertThat(storedPhone("u23-nophone@example.com")).isNull();
    }

    @Test
    void updateProfile_withAPhoneAnotherAccountHolds_isRejectedWithPhoneAlreadyUsed() throws Exception {
        registerOk("u23-holder@example.com", "\"+84901234567\"");
        MvcResult other = registerOk("u23-other@example.com", null);

        updateProfile(other, "{\"phoneNumber\": \"0901234567\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("PHONE_ALREADY_USED"));

        assertThat(storedPhone("u23-other@example.com")).isNull();
    }

    @Test
    void updateProfile_resendingTheCallersOwnNumberInAnotherFormat_succeeds() throws Exception {
        MvcResult me = registerOk("u23-own@example.com", "\"+84901234567\"");

        updateProfile(me, "{\"phoneNumber\": \"0901234567\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.phoneNumber").value("+84901234567"));
    }

    @Test
    void updateProfile_withABlankPhone_clearsItWhenTheAccountHasAnEmail() throws Exception {
        MvcResult me = registerOk("u23-clear@example.com", "\"+84901234567\"");

        updateProfile(me, "{\"phoneNumber\": \"\"}").andExpect(status().isOk());

        assertThat(storedPhone("u23-clear@example.com")).isNull();
    }

    @Test
    void updateProfile_clearingTheOnlyIdentifierOfAnEmaillessAccount_isRejectedWithIdentifierRequired() throws Exception {
        // A phone-only account cannot be created through the legacy register endpoint (it still requires an email),
        // so take the email away from a registered account the way A26's provisioning will leave it.
        MvcResult me = registerOk("u23-phoneonly@example.com", "\"+84901234567\"");
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
