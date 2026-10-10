package com.sportconnect.integration;

import com.jayway.jsonpath.JsonPath;
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
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import javax.sql.DataSource;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A10 end-to-end: {@code forgot-password} issues a real token and {@code reset-password} consumes it — the path
 * that, before A10, had never run (forgot-password was a placeholder).
 * <ul>
 *   <li>register → forgot-password → read the saved token row → reset-password → log in with the new password;</li>
 *   <li>the 200 body is byte-identical for an active, a deactivated and an unknown email (no enumeration), and
 *       only the two real accounts get a token row;</li>
 *   <li>a deactivated account that resets its password stays deactivated;</li>
 *   <li>expired and reused tokens are rejected with {@code RESET_TOKEN_EXPIRED} / {@code RESET_TOKEN_USED};</li>
 *   <li>the reset revokes the user's refresh tokens, and an access token issued before it stops working even
 *       after an earlier request cached "never revoked" for the user (A12 evicts that entry after commit);</li>
 *   <li>a second forgot-password replaces the first token (the old link dies), and the database itself refuses a
 *       second row for the same user (V078).</li>
 * </ul>
 * Real Spring wiring, real Redis (the JWT filter's revocation check), real {@code UserServiceImpl.deleteUser()} for
 * the deactivation. The reset email is {@code @Async} and its sender is unconfigured here, so a send failure is
 * swallowed by {@code EmailService}; the tests read the token from the table instead of the mail.
 */
class PasswordResetIntegrationTest extends RedisBaseIT {

    private static final String PASSWORD = "password123";
    private static final String NEW_PASSWORD = "brand-new-pass-456";

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
                "{\"email\": \"" + email + "\", \"password\": \"" + PASSWORD + "\", \"fullName\": \"Reset Tester\"}")
                .andExpect(status().isOk()).andReturn();
    }

    private static String accessTokenOf(MvcResult result) throws Exception {
        return JsonPath.read(result.getResponse().getContentAsString(), "$.data.accessToken");
    }

    private static UUID userIdOf(MvcResult result) throws Exception {
        return UUID.fromString(JsonPath.read(result.getResponse().getContentAsString(), "$.data.user.id"));
    }

    private String forgot(String email) throws Exception {
        return postJson("/api/auth/forgot-password", "{\"email\": \"" + email + "\"}")
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
    }

    private ResultActions reset(String token, String newPassword) throws Exception {
        return postJson("/api/auth/reset-password",
                "{\"token\": \"" + token + "\", \"newPassword\": \"" + newPassword + "\"}");
    }

    private static String withoutTimestamp(String responseBody) {
        return responseBody.replaceAll("\"timestamp\":\"[^\"]*\"", "\"timestamp\":\"-\"");
    }

    private String tokenOf(UUID userId) {
        return jdbc.queryForObject("SELECT token FROM password_reset_tokens WHERE user_id = ?", String.class, userId);
    }

    private int tokenCount(UUID userId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM password_reset_tokens WHERE user_id = ?", Integer.class, userId);
    }

    private boolean isActive(String email) {
        return userRepository.findByEmail(email).orElseThrow().getIsActive();
    }

    @Test
    void forgotThenReset_changesThePassword_endToEnd() throws Exception {
        UUID userId = userIdOf(register("a10-flow@example.com"));

        forgot("a10-flow@example.com");
        reset(tokenOf(userId), NEW_PASSWORD).andExpect(status().isOk());

        postJson("/api/auth/login", credentials("a10-flow@example.com", NEW_PASSWORD)).andExpect(status().isOk());
        postJson("/api/auth/login", credentials("a10-flow@example.com", PASSWORD))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("INVALID_CREDENTIALS"));
    }

    @Test
    void forgotPassword_answersIdentically_forActiveDeactivatedAndUnknownEmails() throws Exception {
        UUID activeId = userIdOf(register("a10-active@example.com"));
        UUID deactivatedId = userIdOf(register("a10-inactive@example.com"));
        userServiceImpl.deleteUser(deactivatedId);

        String forActive = forgot("a10-active@example.com");
        String forDeactivated = forgot("a10-inactive@example.com");
        String forUnknown = forgot("a10-nobody@example.com");

        // The body carries a server timestamp, so compare everything except it.
        assertThat(withoutTimestamp(forDeactivated)).isEqualTo(withoutTimestamp(forActive));
        assertThat(withoutTimestamp(forUnknown)).isEqualTo(withoutTimestamp(forActive));
        assertThat(tokenCount(activeId)).isEqualTo(1);
        assertThat(tokenCount(deactivatedId)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM password_reset_tokens", Integer.class)).isEqualTo(2);
    }

    @Test
    void aDeactivatedUser_canResetTheirPassword_andStaysDeactivated() throws Exception {
        UUID userId = userIdOf(register("a10-deact@example.com"));
        userServiceImpl.deleteUser(userId);

        forgot("a10-deact@example.com");
        reset(tokenOf(userId), NEW_PASSWORD).andExpect(status().isOk());

        assertThat(isActive("a10-deact@example.com")).isFalse();
        // The new password is the one that matches, and login still withholds tokens (A9).
        postJson("/api/auth/login", credentials("a10-deact@example.com", NEW_PASSWORD))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("ACCOUNT_DEACTIVATED"));
    }

    @Test
    void anExpiredToken_isRejected_withResetTokenExpired() throws Exception {
        UUID userId = userIdOf(register("a10-expired@example.com"));
        forgot("a10-expired@example.com");
        // Written through the repository (same mapping and clock as PasswordResetToken.isExpired()), not raw JDBC.
        var token = passwordResetTokenRepository.findByToken(tokenOf(userId)).orElseThrow();
        token.setExpiresAt(LocalDateTime.now().minusMinutes(1));
        passwordResetTokenRepository.save(token);

        reset(tokenOf(userId), NEW_PASSWORD)
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("RESET_TOKEN_EXPIRED"));
        postJson("/api/auth/login", credentials("a10-expired@example.com", PASSWORD)).andExpect(status().isOk());
    }

    @Test
    void aTokenCannotBeUsedTwice() throws Exception {
        UUID userId = userIdOf(register("a10-twice@example.com"));
        forgot("a10-twice@example.com");
        String token = tokenOf(userId);

        reset(token, NEW_PASSWORD).andExpect(status().isOk());
        reset(token, "yet-another-pass-789")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("RESET_TOKEN_USED"));
        postJson("/api/auth/login", credentials("a10-twice@example.com", NEW_PASSWORD)).andExpect(status().isOk());
    }

    @Test
    void resettingThePassword_revokesRefreshTokens_andAnEarlierAccessToken() throws Exception {
        MvcResult registered = register("a10-revoke@example.com");
        UUID userId = userIdOf(registered);
        String oldAccessToken = accessTokenOf(registered);
        // A12: an authenticated request first, so Redis caches "never revoked" for this user. Before A12 the reset
        // did not evict that entry and the old token stayed valid until it expired.
        mockMvc.perform(get("/api/users/me").header("Authorization", "Bearer " + oldAccessToken))
                .andExpect(status().isOk());
        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL", Integer.class, userId))
                .isPositive();

        forgot("a10-revoke@example.com");
        // Make sure the access token was issued strictly before the revocation instant.
        Thread.sleep(1100);
        reset(tokenOf(userId), NEW_PASSWORD).andExpect(status().isOk());

        assertThat(jdbc.queryForObject(
                "SELECT COUNT(*) FROM refresh_tokens WHERE user_id = ? AND revoked_at IS NULL", Integer.class, userId))
                .isZero();
        mockMvc.perform(get("/api/users/me").header("Authorization", "Bearer " + oldAccessToken))
                .andExpect(status().isUnauthorized());
    }


    // ---------- email language (A10 scope change) ----------

    private long vietnamId() {
        return jdbc.queryForObject("SELECT id FROM countries WHERE iso2 = 'VN'", Long.class);
    }

    private void setCountry(UUID userId, long countryId) {
        jdbc.update("UPDATE users SET country_id = ? WHERE id = ?", countryId, userId);
    }

    private void setPreferredLanguage(UUID userId, String code) {
        jdbc.update("INSERT INTO user_preferences (user_id, language, created_at, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)", userId, code);
    }

    @Test
    void emailLanguage_fallsBackToTheCountryDefault_whenThereIsNoPreference_evenForADeactivatedUser() throws Exception {
        UUID userId = userIdOf(register("a10-lang-country@example.com"));
        setCountry(userId, vietnamId());
        userServiceImpl.deleteUser(userId);

        assertThat(userServiceImpl.findPreferredLanguageCode(userId)).contains("vi");
        // The whole request path runs: language resolved from real rows, Vietnamese bundle rendered, token saved.
        forgot("a10-lang-country@example.com");
        assertThat(tokenCount(userId)).isEqualTo(1);
    }

    @Test
    void emailLanguage_aStoredPreferenceWinsOverTheCountryDefault() throws Exception {
        UUID userId = userIdOf(register("a10-lang-pref@example.com"));
        setCountry(userId, vietnamId());
        setPreferredLanguage(userId, "en");

        assertThat(userServiceImpl.findPreferredLanguageCode(userId)).contains("en");
    }

    @Test
    void emailLanguage_isEmpty_withNoPreferenceAndNoCountry_andAnInactiveLanguageIsSkipped() throws Exception {
        UUID bare = userIdOf(register("a10-lang-bare@example.com"));
        assertThat(userServiceImpl.findPreferredLanguageCode(bare)).isEmpty();

        UUID userId = userIdOf(register("a10-lang-inactive@example.com"));
        setCountry(userId, vietnamId());
        setPreferredLanguage(userId, "vi");
        jdbc.update("UPDATE languages SET is_active = FALSE WHERE code = 'vi'");

        assertThat(userServiceImpl.findPreferredLanguageCode(userId)).isEmpty();
    }
    @Test
    void aSecondRequest_replacesTheFirstToken_andTheDatabaseKeepsOneRowPerUser() throws Exception {
        UUID userId = userIdOf(register("a10-replace@example.com"));

        forgot("a10-replace@example.com");
        String first = tokenOf(userId);
        forgot("a10-replace@example.com");
        String second = tokenOf(userId);

        assertThat(second).isNotEqualTo(first);
        assertThat(tokenCount(userId)).isEqualTo(1);
        reset(first, NEW_PASSWORD)
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("RESET_TOKEN_INVALID"));

        // V078: the invariant is the database's, not just the service's delete-then-insert.
        assertThatThrownBy(() -> jdbc.update(
                "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, 'dup', CURRENT_TIMESTAMP)", userId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }
}
