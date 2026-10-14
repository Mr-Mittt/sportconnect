package com.sportconnect.integration;

import com.jayway.jsonpath.JsonPath;
import com.sportconnect.auth.entity.PasswordResetToken;
import com.sportconnect.auth.repository.PasswordResetTokenRepository;
import com.sportconnect.auth.repository.RefreshTokenRepository;
import com.sportconnect.user.entity.Role;
import com.sportconnect.user.repository.RoleRepository;
import com.sportconnect.user.repository.UserPreferenceRepository;
import com.sportconnect.user.repository.UserRepository;
import com.sportconnect.user.service.UserServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A9's legacy password endpoints for a deactivated account (retired by A28).
 * <ul>
 *   <li>login with the right password answers {@code ACCOUNT_DEACTIVATED} (no tokens, no cookie); with a wrong
 *       password it still answers {@code INVALID_CREDENTIALS};</li>
 *   <li>a deactivated email still counts as registered, and a password reset works for a deactivated user without
 *       re-activating them.</li>
 * </ul>
 * Real {@code UserServiceImpl.deleteUser()} for the deactivation, real Redis.
 *
 * <p>A26 moved the rest of what this class used to cover: re-activation is now the ticket flow (confirm, cancel, expiry,
 * social auto-reactivate) and refresh of a deactivated user is a Keycloak refresh, both in
 * {@link KeycloakCallbackIntegrationTest}.
 */
class AccountReactivationIntegrationTest extends RedisBaseIT {

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
    @Autowired
    private PasswordResetTokenRepository passwordResetTokenRepository;
    @Autowired
    private UserServiceImpl userServiceImpl;

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
        jdbc.update("DELETE FROM password_reset_tokens");
        refreshTokenRepository.deleteAll();
        userPreferenceRepository.deleteAll();
        userRepository.deleteAll();
    }

    private ResultActions postJson(String path, String body) throws Exception {
        return mockMvc.perform(post(path).with(anonymous()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private static String credentials(String email, String password) {
        return "{\"email\": \"" + email + "\", \"password\": \"" + password + "\"}";
    }

    private MvcResult register(String email) throws Exception {
        return postJson("/api/auth/register",
                "{\"email\": \"" + email + "\", \"password\": \"" + PASSWORD + "\", \"fullName\": \"Auth Tester\"}")
                .andExpect(status().isOk()).andReturn();
    }

    private static String userIdOf(MvcResult result) throws Exception {
        return JsonPath.read(result.getResponse().getContentAsString(), "$.data.user.id");
    }

    /** Registers a user and deactivates them through the real deleteUser (which revokes their sessions). */
    private MvcResult registerAndDeactivate(String email) throws Exception {
        MvcResult registered = register(email);
        userServiceImpl.deleteUser(UUID.fromString(userIdOf(registered)));
        return registered;
    }

    private boolean isActive(String email) {
        return userRepository.findByEmail(email).orElseThrow().getIsActive();
    }

    // ---------- login ----------

    @Test
    void login_correctPasswordOnADeactivatedAccount_is401_withAccountDeactivated_andNoTokens() throws Exception {
        registerAndDeactivate("a9-login@example.com");

        MvcResult result = postJson("/api/auth/login", credentials("a9-login@example.com", PASSWORD))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.errorCode").value("ACCOUNT_DEACTIVATED"))
                .andExpect(jsonPath("$.data").doesNotExist())
                .andReturn();

        assertThat(result.getResponse().getCookie("refreshToken")).isNull();
        assertThat(isActive("a9-login@example.com")).isFalse();
    }

    @Test
    void login_wrongPasswordOnADeactivatedAccount_isInvalidCredentials_notAccountDeactivated() throws Exception {
        registerAndDeactivate("a9-wrong@example.com");

        postJson("/api/auth/login", credentials("a9-wrong@example.com", "not-the-password"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("INVALID_CREDENTIALS"));
    }

    // ---------- register / forgot-reset interplay ----------

    @Test
    void register_withADeactivatedAccountsEmail_isStillTheDuplicateEmail409() throws Exception {
        registerAndDeactivate("a9-dup@example.com");

        postJson("/api/auth/register",
                "{\"email\": \"a9-dup@example.com\", \"password\": \"" + PASSWORD + "\", \"fullName\": \"Someone Else\"}")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.errorCode").value("EMAIL_ALREADY_REGISTERED"));
    }

    @Test
    void resetPassword_forADeactivatedUser_changesThePassword_andLeavesTheAccountDeactivated() throws Exception {
        MvcResult registered = registerAndDeactivate("a9-reset@example.com");
        passwordResetTokenRepository.save(PasswordResetToken.builder()
                .userId(UUID.fromString(userIdOf(registered)))
                .token("a9-reset-token")
                .expiresAt(LocalDateTime.now().plusHours(1))
                .build());

        postJson("/api/auth/reset-password", "{\"token\": \"a9-reset-token\", \"newPassword\": \"new-password-123\"}")
                .andExpect(status().isOk());

        assertThat(isActive("a9-reset@example.com")).isFalse();
        // The new password is the one that now matches (the old one does not), and login still withholds tokens.
        postJson("/api/auth/login", credentials("a9-reset@example.com", "new-password-123"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("ACCOUNT_DEACTIVATED"));
        postJson("/api/auth/login", credentials("a9-reset@example.com", PASSWORD))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("INVALID_CREDENTIALS"));
    }
}
