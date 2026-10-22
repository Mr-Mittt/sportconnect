package com.sportconnect.integration;

import com.sportconnect.user.entity.Role;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import com.sportconnect.user.service.UserServiceImpl;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * U12, rewritten for A25: deactivating a user must lock out both their refresh tokens and any access token they already
 * hold, even though the access token's signature and {@code exp} remain perfectly valid. Real {@code MockMvc} requests
 * through the real {@code JwtAuthenticationFilter} and the real per-request gate ({@code UserService.getAccessState},
 * cached in a real Redis via {@link RedisBaseIT}), with a real {@code UserServiceImpl.deleteUser()} and
 * {@code reactivateUser()}.
 *
 * <p>What changed from the HS256 era: an access token is no longer revoked by a watermark stamped on
 * {@code refresh_tokens}; the gate looks at the user's current {@code is_active}, so a deactivation takes effect on the
 * very next request (the cached state is evicted after commit) and a reactivation takes effect just as fast.
 */
class UserDeactivationSessionRevocationIntegrationTest extends RedisBaseIT {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private UserServiceImpl userServiceImpl;

    @Autowired
    private StringRedisTemplate stringRedisTemplate;

    @AfterEach
    void cleanup() {
        userRepository.deleteAll();
    }

    private User createActiveUser() {
        return userRepository.findById(createUserWithRoles(true, Role.USER)).orElseThrow();
    }

    private static String cacheKey(UUID userId) {
        return "user:access-state:" + userId;
    }

    @Test
    void activeUser_accessTokenWorks() throws Exception {
        UUID userId = createActiveUser().getId();

        mockMvc.perform(get("/api/users/me").header("Authorization", bearer(userId)))
                .andExpect(status().isOk());
    }

    @Test
    void deactivation_refreshWithAPreDeactivationTokenFails_andEndsTheKeycloakSession() throws Exception {
        User user = createActiveUser();
        // A26: the session is Keycloak's; the cookie holds its refresh token.
        String refreshToken = TestKeycloak.startSession(TestKeycloak.Identity.of(user.getId()).email(user.getEmail()));

        userServiceImpl.deleteUser(user.getId());

        mockMvc.perform(post("/api/auth/refresh")
                        .cookie(new Cookie("refreshToken", refreshToken)))
                .andExpect(status().isUnauthorized());
        assertThat(TestKeycloak.sessionEnded(refreshToken)).isTrue();
    }

    @Test
    void deactivation_rejectsAnAlreadyIssuedAccessToken() throws Exception {
        UUID userId = createActiveUser().getId();
        String authorization = bearer(userId);

        userServiceImpl.deleteUser(userId);

        mockMvc.perform(get("/api/users/me").header("Authorization", authorization))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void deactivation_rejectsTheToken_evenAfterARequestCachedTheActiveState() throws Exception {
        UUID userId = createActiveUser().getId();
        String authorization = bearer(userId);

        // Populates user:access-state:<id> with "active".
        mockMvc.perform(get("/api/users/me").header("Authorization", authorization)).andExpect(status().isOk());
        assertThat(stringRedisTemplate.opsForValue().get(cacheKey(userId))).startsWith("1|");

        userServiceImpl.deleteUser(userId);

        // The deactivation evicted the cached state, so this request reloads "inactive" instead of trusting "active".
        assertThat(stringRedisTemplate.hasKey(cacheKey(userId))).isFalse();
        mockMvc.perform(get("/api/users/me").header("Authorization", authorization))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void deactivation_thenReactivation_theSameTokenWorksAgainAtOnce() throws Exception {
        User user = createActiveUser();
        String authorization = bearer(user.getId());

        mockMvc.perform(get("/api/users/me").header("Authorization", authorization)).andExpect(status().isOk());
        userServiceImpl.deleteUser(user.getId());
        mockMvc.perform(get("/api/users/me").header("Authorization", authorization)).andExpect(status().isUnauthorized());
        // The 401 above cached "inactive"; reactivating must evict it, not wait for the TTL.
        assertThat(stringRedisTemplate.opsForValue().get(cacheKey(user.getId()))).startsWith("0|");

        userServiceImpl.reactivateUser(user.getId());

        mockMvc.perform(get("/api/users/me").header("Authorization", authorization)).andExpect(status().isOk());
    }

    @Test
    void deactivation_stillRejects_whenRedisHasNothingCached() throws Exception {
        UUID userId = createActiveUser().getId();
        String authorization = bearer(userId);

        userServiceImpl.deleteUser(userId);
        // Simulates Redis having lost its data entirely: the gate must fall back to the database, not pass through.
        stringRedisTemplate.delete(cacheKey(userId));

        mockMvc.perform(get("/api/users/me").header("Authorization", authorization))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void theCachedState_expiresOnItsOwn_withinTheConfiguredTtl() throws Exception {
        UUID userId = createActiveUser().getId();

        mockMvc.perform(get("/api/users/me").header("Authorization", bearer(userId))).andExpect(status().isOk());

        // app.user.access-state-ttl defaults to 60 s: the bound on a stale entry surviving the evict-vs-reload race.
        assertThat(stringRedisTemplate.getExpire(cacheKey(userId))).isBetween(1L, 60L);
    }
}
