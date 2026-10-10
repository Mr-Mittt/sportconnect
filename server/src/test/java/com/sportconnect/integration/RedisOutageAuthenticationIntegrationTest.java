package com.sportconnect.integration;

import com.sportconnect.auth.api.service.AuthService;
import com.sportconnect.auth.api.service.JwtTokenService;
import com.sportconnect.auth.entity.RefreshToken;
import com.sportconnect.auth.repository.RefreshTokenRepository;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import com.sportconnect.user.service.UserServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.net.ServerSocket;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A11 end-to-end: authentication keeps working, and revocation stays exact, while Redis is unreachable.
 *
 * <p>Extends {@link BaseIT}, not {@link RedisBaseIT}: no Redis container is started, and the Redis port is pointed
 * at a port nothing listens on, so every {@code StringRedisTemplate} call fails with a connection error. Before A11
 * that exception escaped {@code TokenRevocationChecker}, {@code JwtAuthenticationFilter} swallowed it, and every
 * authenticated request ended up unauthenticated (401), even with a perfectly valid token.
 *
 * <p>Real {@code MockMvc} requests through the real filter chain; the DB (H2 mirror) is the source of truth the
 * checker falls back to. The "revoked" cases use the real {@code AuthService.logout} and
 * {@code UserServiceImpl.deleteUser()}, the same writes that stamp {@code refresh_tokens.revoked_at} in production.
 */
class RedisOutageAuthenticationIntegrationTest extends BaseIT {

    @DynamicPropertySource
    static void redisIsUnreachable(DynamicPropertyRegistry registry) throws IOException {
        int closedPort;
        try (ServerSocket socket = new ServerSocket(0)) {
            closedPort = socket.getLocalPort();
        }
        registry.add("spring.data.redis.host", () -> "127.0.0.1");
        registry.add("spring.data.redis.port", () -> closedPort);
    }

    @Autowired
    private UserRepository userRepository;
    @Autowired
    private RefreshTokenRepository refreshTokenRepository;
    @Autowired
    private JwtTokenService jwtTokenService;
    @Autowired
    private AuthService authService;
    @Autowired
    private UserServiceImpl userServiceImpl;

    @AfterEach
    void cleanup() {
        refreshTokenRepository.deleteAll();
        userRepository.deleteAll();
    }

    private UUID createActiveUser() {
        return userRepository.save(User.builder()
                .email("a11-" + UUID.randomUUID() + "@example.com")
                .passwordHash("hash")
                .firstName("A11")
                .lastName("Tester")
                .username("a11tester" + System.nanoTime())
                .isActive(true)
                .build()).getId();
    }

    private String mintAccessToken(UUID userId) {
        return jwtTokenService.generateAccessToken(Map.of(
                "id", userId,
                "email", "it-test-" + userId + "@example.com",
                "username", "it-test-" + userId,
                "roles", List.of("USER")));
    }

    /** Every real access token is issued alongside a refresh_tokens row; revocation only stamps existing rows. */
    private void mintRefreshToken(UUID userId) {
        refreshTokenRepository.save(RefreshToken.builder()
                .userId(userId)
                .token("a11-refresh-" + UUID.randomUUID())
                .expiresAt(LocalDateTime.now().plusDays(7))
                .build());
    }

    @Test
    void aValidToken_stillAuthenticates_whileRedisIsDown() throws Exception {
        UUID userId = createActiveUser();
        mintRefreshToken(userId);

        mockMvc.perform(get("/api/users/me").header("Authorization", "Bearer " + mintAccessToken(userId)))
                .andExpect(status().isOk());
    }

    @Test
    void aTokenIssuedBeforeALogout_isStillRejected_whileRedisIsDown() throws Exception {
        UUID userId = createActiveUser();
        mintRefreshToken(userId);
        String accessToken = mintAccessToken(userId);

        // A12: logout also tries to evict the Redis watermark; with Redis down that must be skipped, not thrown.
        authService.logout(userId);

        mockMvc.perform(get("/api/users/me").header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aDeactivatedUsersToken_isStillRejected_whileRedisIsDown() throws Exception {
        UUID userId = createActiveUser();
        mintRefreshToken(userId);
        String accessToken = mintAccessToken(userId);

        userServiceImpl.deleteUser(userId);

        mockMvc.perform(get("/api/users/me").header("Authorization", "Bearer " + accessToken))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aRequestWithNoToken_isStillUnauthenticated_whileRedisIsDown() throws Exception {
        mockMvc.perform(get("/api/users/me")).andExpect(status().isUnauthorized());
    }
}
