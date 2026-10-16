package com.sportconnect.integration;

import com.sportconnect.user.entity.Role;
import com.sportconnect.user.repository.UserRepository;
import com.sportconnect.user.service.UserServiceImpl;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

import java.io.IOException;
import java.net.ServerSocket;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A11, carried into A25: authentication keeps working, and the active gate stays exact, while Redis is unreachable.
 *
 * <p>Extends {@link BaseIT}, not {@link RedisBaseIT}: no Redis container is started, and the Redis port is pointed
 * at a port nothing listens on, so every {@code StringRedisTemplate} call fails with a connection error. The
 * per-request {@code {isActive, roles}} lookup ({@code UserAccessStateCache}, through {@code CacheGuard}) must then
 * answer from the database: a valid token for an active user still authenticates, and a deactivated user is still
 * refused, rather than every request ending up unauthenticated.
 *
 * <p>Real {@code MockMvc} requests through the real filter chain and a real {@code NimbusJwtDecoder} against
 * {@link TestKeycloak}'s JWKS; the DB (H2 mirror) is the source of truth.
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
    private UserServiceImpl userServiceImpl;

    @AfterEach
    void cleanup() {
        userRepository.deleteAll();
    }

    private UUID createActiveUser() {
        return createUserWithRoles(true, Role.USER);
    }

    @Test
    void aValidToken_stillAuthenticates_whileRedisIsDown() throws Exception {
        UUID userId = createActiveUser();

        mockMvc.perform(get("/api/users/me").header("Authorization", bearer(userId)))
                .andExpect(status().isOk());
    }

    @Test
    void aDeactivatedUsersToken_isStillRejected_whileRedisIsDown() throws Exception {
        UUID userId = createActiveUser();
        String authorization = bearer(userId);

        // The deactivation also tries to evict the cached state; with Redis down that must be skipped, not thrown.
        userServiceImpl.deleteUser(userId);

        mockMvc.perform(get("/api/users/me").header("Authorization", authorization))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aRequestWithNoToken_isStillUnauthenticated_whileRedisIsDown() throws Exception {
        mockMvc.perform(get("/api/users/me")).andExpect(status().isUnauthorized());
    }
}
