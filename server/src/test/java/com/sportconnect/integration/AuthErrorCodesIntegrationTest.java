package com.sportconnect.integration;

import com.sportconnect.auth.entity.EmailVerification;
import com.sportconnect.auth.entity.PasswordResetToken;
import com.sportconnect.auth.repository.EmailVerificationRepository;
import com.sportconnect.auth.repository.PasswordResetTokenRepository;
import com.sportconnect.auth.repository.RefreshTokenRepository;
import com.sportconnect.user.entity.Role;
import com.sportconnect.user.repository.RoleRepository;
import com.sportconnect.user.repository.UserPreferenceRepository;
import com.sportconnect.user.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.ResultActions;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.UUID;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A8 — the auth error codes (and the register 400 → 409 move) through the real request pipeline: the real anonymous
 * {@code /api/auth/**} endpoints, the real {@code AuthServiceImpl} / {@code EmailVerificationService} /
 * {@code PasswordResetService}, real H2 token rows, and {@code GlobalExceptionHandler}'s exception-to-status-and-code
 * copy. A Spock spec proves each site throws the right coded exception; only this proves the code and status actually
 * reach the HTTP response body.
 */
class AuthErrorCodesIntegrationTest extends BaseIT {

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
    private EmailVerificationRepository emailVerificationRepository;
    @Autowired
    private PasswordResetTokenRepository passwordResetTokenRepository;

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
        jdbc.update("DELETE FROM email_verifications");
        jdbc.update("DELETE FROM password_reset_tokens");
        refreshTokenRepository.deleteAll();
        userPreferenceRepository.deleteAll();
        userRepository.deleteAll();
    }

    private ResultActions postJson(String path, String body) throws Exception {
        return mockMvc.perform(post(path).with(anonymous()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private ResultActions register(String email) throws Exception {
        return postJson("/api/auth/register",
                "{\"email\": \"" + email + "\", \"password\": \"" + PASSWORD + "\", \"fullName\": \"Auth Tester\"}");
    }

    // ---------- register / login ----------

    @Test
    void register_duplicateEmail_is409_withEmailAlreadyRegistered() throws Exception {
        register("a8-dup@example.com").andExpect(status().isOk());

        register("a8-dup@example.com")
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.message").value("Email already registered"))
                .andExpect(jsonPath("$.errorCode").value("EMAIL_ALREADY_REGISTERED"))
                .andExpect(jsonPath("$.data").doesNotExist());
    }

    @Test
    void login_wrongPassword_is401_withInvalidCredentials() throws Exception {
        register("a8-login@example.com").andExpect(status().isOk());

        postJson("/api/auth/login", "{\"email\": \"a8-login@example.com\", \"password\": \"wrong-password\"}")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid email or password"))
                .andExpect(jsonPath("$.errorCode").value("INVALID_CREDENTIALS"));
    }

    @Test
    void login_unknownEmail_is401_withInvalidCredentials() throws Exception {
        postJson("/api/auth/login", "{\"email\": \"nobody@example.com\", \"password\": \"" + PASSWORD + "\"}")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("INVALID_CREDENTIALS"));
    }

    // ---------- refresh ----------

    @Test
    void refresh_withoutCookie_is401_withRefreshTokenMissing() throws Exception {
        mockMvc.perform(post("/api/auth/refresh").with(anonymous()))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("REFRESH_TOKEN_MISSING"));
    }

    @Test
    void refresh_unknownToken_is401_withRefreshTokenInvalid() throws Exception {
        mockMvc.perform(post("/api/auth/refresh").with(anonymous()).cookie(new Cookie("refreshToken", "not-a-real-token")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.message").value("Invalid refresh token"))
                .andExpect(jsonPath("$.errorCode").value("REFRESH_TOKEN_INVALID"));
    }

    @Test
    void refresh_revokedToken_is401_withRefreshTokenExpiredOrRevoked() throws Exception {
        jdbc.update("INSERT INTO refresh_tokens (user_id, token, expires_at, revoked_at) VALUES (?, ?, ?, ?)",
                UUID.randomUUID(), "revoked-token", Timestamp.valueOf(LocalDateTime.now().plusDays(1)),
                Timestamp.valueOf(LocalDateTime.now().minusMinutes(1)));

        mockMvc.perform(post("/api/auth/refresh").with(anonymous()).cookie(new Cookie("refreshToken", "revoked-token")))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("REFRESH_TOKEN_EXPIRED_OR_REVOKED"));
    }

    // ---------- verify-email ----------

    private void insertVerification(String token, LocalDateTime expiresAt, LocalDateTime verifiedAt) {
        emailVerificationRepository.save(EmailVerification.builder().userId(UUID.randomUUID()).token(token)
                .expiresAt(expiresAt).verifiedAt(verifiedAt).build());
    }

    @Test
    void verifyEmail_unknownToken_is404_withVerificationTokenInvalid() throws Exception {
        postJson("/api/auth/verify-email", "{\"token\": \"nope\"}")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_TOKEN_INVALID"));
    }

    @Test
    void verifyEmail_alreadyVerified_stays400_withEmailAlreadyVerified() throws Exception {
        insertVerification("used-ver", LocalDateTime.now().plusHours(1), LocalDateTime.now().minusMinutes(5));

        postJson("/api/auth/verify-email", "{\"token\": \"used-ver\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Email already verified"))
                .andExpect(jsonPath("$.errorCode").value("EMAIL_ALREADY_VERIFIED"));
    }

    @Test
    void verifyEmail_expiredToken_is400_withVerificationTokenExpired() throws Exception {
        insertVerification("old-ver", LocalDateTime.now().minusMinutes(1), null);

        postJson("/api/auth/verify-email", "{\"token\": \"old-ver\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_TOKEN_EXPIRED"));
    }

    // ---------- reset-password ----------

    private void insertReset(String token, LocalDateTime expiresAt, LocalDateTime usedAt) {
        passwordResetTokenRepository.save(PasswordResetToken.builder().userId(UUID.randomUUID()).token(token)
                .expiresAt(expiresAt).usedAt(usedAt).build());
    }

    private ResultActions reset(String token) throws Exception {
        return postJson("/api/auth/reset-password",
                "{\"token\": \"" + token + "\", \"newPassword\": \"new-password-123\"}");
    }

    @Test
    void resetPassword_unknownToken_is404_withResetTokenInvalid() throws Exception {
        reset("nope")
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("RESET_TOKEN_INVALID"));
    }

    @Test
    void resetPassword_usedToken_stays400_withResetTokenUsed() throws Exception {
        insertReset("used-reset", LocalDateTime.now().plusHours(1), LocalDateTime.now().minusMinutes(5));

        reset("used-reset")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.message").value("Reset token already used"))
                .andExpect(jsonPath("$.errorCode").value("RESET_TOKEN_USED"));
    }

    @Test
    void resetPassword_expiredToken_is400_withResetTokenExpired() throws Exception {
        insertReset("old-reset", LocalDateTime.now().minusMinutes(1), null);

        reset("old-reset")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("RESET_TOKEN_EXPIRED"));
    }
}
