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
import jakarta.servlet.http.Cookie;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A9 end-to-end: a deactivated account can come back by the user's own confirmation.
 * <ul>
 *   <li>login with the right password answers {@code ACCOUNT_DEACTIVATED} (no tokens, no cookie); with a wrong
 *       password it still answers {@code INVALID_CREDENTIALS};</li>
 *   <li>{@code POST /api/auth/reactivate} re-verifies the credentials, re-activates, and logs in; the access token
 *       it returns works, while one issued before the deactivation stays revoked (U12);</li>
 *   <li>refresh for a deactivated user is the generic {@code REFRESH_TOKEN_EXPIRED_OR_REVOKED}, never a 404 that
 *       leaks the user id and never {@code ACCOUNT_DEACTIVATED};</li>
 *   <li>a deactivated email still counts as registered, and a password reset works for a deactivated user without
 *       re-activating them.</li>
 * </ul>
 * Real {@code UserServiceImpl.deleteUser()} for the deactivation, real Redis (the JWT filter's revocation check).
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

    private static String accessTokenOf(MvcResult result) throws Exception {
        return JsonPath.read(result.getResponse().getContentAsString(), "$.data.accessToken");
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

    // ---------- reactivate ----------

    @Test
    void reactivate_withCorrectCredentials_reactivatesAndLogsIn_withAWorkingAccessToken() throws Exception {
        MvcResult registered = registerAndDeactivate("a9-react@example.com");
        // The access token's iat has one-second resolution and a token issued at or before the revocation watermark
        // is rejected, so wait out the second deactivation landed in.
        Thread.sleep(1100);

        MvcResult result = postJson("/api/auth/reactivate", credentials("a9-react@example.com", PASSWORD))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.accessToken").isNotEmpty())
                .andReturn();

        assertThat(isActive("a9-react@example.com")).isTrue();
        assertThat(result.getResponse().getCookie("refreshToken")).isNotNull();

        mockMvc.perform(get("/api/users/me").header("Authorization", "Bearer " + accessTokenOf(result)))
                .andExpect(status().isOk());
        // The session from before the deactivation stays revoked: re-activation does not resurrect it.
        mockMvc.perform(get("/api/users/me").header("Authorization", "Bearer " + accessTokenOf(registered)))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void reactivate_withAWrongPassword_isInvalidCredentials_andTheAccountStaysDeactivated() throws Exception {
        registerAndDeactivate("a9-nope@example.com");

        postJson("/api/auth/reactivate", credentials("a9-nope@example.com", "not-the-password"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("INVALID_CREDENTIALS"));

        assertThat(isActive("a9-nope@example.com")).isFalse();
    }

    @Test
    void reactivate_forAnUnknownEmail_isInvalidCredentials() throws Exception {
        postJson("/api/auth/reactivate", credentials("nobody@example.com", PASSWORD))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("INVALID_CREDENTIALS"));
    }

    @Test
    void reactivate_forAnAlreadyActiveAccount_justLogsIn() throws Exception {
        register("a9-live@example.com");

        postJson("/api/auth/reactivate", credentials("a9-live@example.com", PASSWORD))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accessToken").isNotEmpty());

        assertThat(isActive("a9-live@example.com")).isTrue();
    }

    // ---------- refresh ----------

    @Test
    void refresh_forADeactivatedUserWithAnUnrevokedToken_isTheGeneric401_withNoUserIdLeak() throws Exception {
        MvcResult registered = register("a9-refresh@example.com");
        String userId = userIdOf(registered);
        String refreshToken = registered.getResponse().getCookie("refreshToken").getValue();
        // Deactivate WITHOUT revoking the refresh token (the race U12 closed, or a token that slipped through).
        jdbc.update("UPDATE users SET is_active = FALSE WHERE id = ?", UUID.fromString(userId));

        MvcResult result = mockMvc.perform(post("/api/auth/refresh").with(anonymous())
                        .cookie(new Cookie("refreshToken", refreshToken)))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("REFRESH_TOKEN_EXPIRED_OR_REVOKED"))
                .andReturn();

        assertThat(result.getResponse().getContentAsString()).doesNotContain(userId);
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
