package com.sportconnect.integration;

import com.sportconnect.auth.api.service.JwtTokenService;
import com.sportconnect.auth.entity.RefreshToken;
import com.sportconnect.auth.repository.RefreshTokenRepository;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import com.sportconnect.user.service.UserServiceImpl;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * U12 end-to-end coverage: deactivating a user must revoke both their refresh tokens (Fix 1) and
 * any access token they already hold (Fix 2), even though the access token's own signature and
 * {@code exp} remain perfectly valid — real {@code MockMvc} requests through the real
 * {@code JwtAuthenticationFilter}, real {@code UserServiceImpl.deleteUser()}, and a real Redis
 * (via {@link RedisBaseIT}), not mocked collaborators. {@code UserServiceImplSpec}/
 * {@code AuthServiceImplSpec}/{@code TokenRevocationCheckerSpec} cover the branch logic in
 * isolation; this class exists because only a real request proves the filter actually rejects a
 * live, still-unexpired access token — the exact thing that had no coverage at all before this
 * ticket.
 *
 * <p>The concurrent-transaction race this ticket's locking closes (a refresh racing a deactivation
 * for the same user) is covered by design/reasoning in U12's implementation doc, not by a
 * deterministic test here — reliably reproducing that exact interleaving needs an artificial
 * synchronization hook this codebase doesn't have, which isn't proportionate to add for this
 * ticket alone.
 */
class UserDeactivationSessionRevocationIntegrationTest extends RedisBaseIT {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private RefreshTokenRepository refreshTokenRepository;

    @Autowired
    private JwtTokenService jwtTokenService;

    @Autowired
    private UserServiceImpl userServiceImpl;

    @Autowired
    private StringRedisTemplate stringRedisTemplate;

    @AfterEach
    void cleanup() {
        refreshTokenRepository.deleteAll();
        userRepository.deleteAll();
    }

    private UUID createActiveUser() {
        return userRepository.save(User.builder()
                .email("u12-" + UUID.randomUUID() + "@example.com")
                .passwordHash("hash")
                .firstName("U12")
                .lastName("Tester")
                .username("u12tester" + System.nanoTime())
                .isActive(true)
                .build()).getId();
    }

    private String mintAccessToken(UUID userId) {
        Map<String, Object> userData = Map.of(
                "id", userId,
                "email", "it-test-" + userId + "@example.com",
                "username", "it-test-" + userId,
                "roles", List.of("USER"));
        return jwtTokenService.generateAccessToken(userData);
    }

    // Every real access token is minted alongside a refresh_tokens row (register/login/refresh
    // all call createRefreshToken in the same breath) — deleteUser()'s revoke only updates
    // existing rows, so a test that skips this doesn't actually model a real issued session.
    private void mintRefreshToken(UUID userId) {
        refreshTokenRepository.save(RefreshToken.builder()
                .userId(userId)
                .token("u12-refresh-" + UUID.randomUUID())
                .expiresAt(LocalDateTime.now().plusDays(7))
                .build());
    }

    @Test
    void activeUser_accessTokenStillWorks() throws Exception {
        UUID userId = createActiveUser();
        String accessToken = mintAccessToken(userId);

        mockMvc.perform(get("/api/users/me")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isOk());
    }

    @Test
    void deactivation_revokesRefreshTokens_refreshWithAPreDeactivationTokenFails() throws Exception {
        UUID userId = createActiveUser();
        RefreshToken refreshToken = refreshTokenRepository.save(RefreshToken.builder()
                .userId(userId)
                .token("u12-refresh-" + UUID.randomUUID())
                .expiresAt(LocalDateTime.now().plusDays(7))
                .build());

        userServiceImpl.deleteUser(userId);

        mockMvc.perform(post("/api/auth/refresh")
                        .cookie(new Cookie("refreshToken", refreshToken.getToken())))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void deactivation_rejectsAnAlreadyIssuedAccessToken_viaTheRedisDenyList() throws Exception {
        UUID userId = createActiveUser();
        String accessToken = mintAccessToken(userId);
        mintRefreshToken(userId);

        userServiceImpl.deleteUser(userId);

        mockMvc.perform(get("/api/users/me")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void deactivation_stillRejectsAnAlreadyIssuedAccessToken_whenRedisHasNothingCached() throws Exception {
        UUID userId = createActiveUser();
        String accessToken = mintAccessToken(userId);
        mintRefreshToken(userId);

        userServiceImpl.deleteUser(userId);

        // Simulates Redis having lost its data entirely (or never having cached this user yet) —
        // the filter must fall back to the durable Postgres watermark and still reject, not just
        // pass through because the cache is empty.
        stringRedisTemplate.delete("auth:revoked-before:" + userId);

        mockMvc.perform(get("/api/users/me")
                        .header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isUnauthorized());
    }
}
