package com.sportconnect.integration;

import com.jayway.jsonpath.JsonPath;
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
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * U22 end-to-end: {@code POST /api/users/me/deactivate} through the real request pipeline, real
 * {@code UserServiceImpl} / {@code AuthServiceImpl} and real Redis (the JWT filter's revocation check).
 * A wrong password changes nothing; the right one deactivates the account, kills the caller's own sessions (access
 * token and refresh cookie), makes login answer {@code ACCOUNT_DEACTIVATED}, and leaves the A9 re-activation path open.
 */
class SelfDeactivationIntegrationTest extends RedisBaseIT {

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

    private ResultActions postJson(String path, String body) throws Exception {
        return mockMvc.perform(post(path).with(anonymous()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    private MvcResult register(String email) throws Exception {
        return postJson("/api/auth/register",
                "{\"email\": \"" + email + "\", \"password\": \"" + PASSWORD + "\", \"fullName\": \"Auth Tester\"}")
                .andExpect(status().isOk()).andReturn();
    }

    private ResultActions deactivate(MvcResult session, String body) throws Exception {
        return mockMvc.perform(post("/api/users/me/deactivate")
                .header("Authorization", "Bearer " + accessTokenOf(session))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private boolean isActive(String email) {
        return userRepository.findByEmail(email).orElseThrow().getIsActive();
    }

    @Test
    void deactivate_withTheRightPassword_deactivatesAndRevokesTheCallersSessions() throws Exception {
        MvcResult session = register("u22-ok@example.com");
        String refreshToken = session.getResponse().getCookie("refreshToken").getValue();

        deactivate(session, "{\"currentPassword\": \"" + PASSWORD + "\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        assertThat(isActive("u22-ok@example.com")).isFalse();
        // The access token the caller used is dead, and so is the refresh cookie.
        mockMvc.perform(get("/api/users/me").header("Authorization", "Bearer " + accessTokenOf(session)))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/auth/refresh").with(anonymous()).cookie(new Cookie("refreshToken", refreshToken)))
                .andExpect(status().isUnauthorized());
        // Login withholds tokens and says why, which is what opens the A9 re-activation offer.
        postJson("/api/auth/login", "{\"email\": \"u22-ok@example.com\", \"password\": \"" + PASSWORD + "\"}")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("ACCOUNT_DEACTIVATED"));
    }

    @Test
    void deactivate_thenReactivate_bringsTheAccountBack() throws Exception {
        MvcResult session = register("u22-back@example.com");
        deactivate(session, "{\"currentPassword\": \"" + PASSWORD + "\"}").andExpect(status().isOk());

        postJson("/api/auth/reactivate", "{\"email\": \"u22-back@example.com\", \"password\": \"" + PASSWORD + "\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accessToken").isNotEmpty());

        assertThat(isActive("u22-back@example.com")).isTrue();
    }

    @Test
    void deactivate_withAWrongPassword_is400_andNothingChanges() throws Exception {
        MvcResult session = register("u22-wrong@example.com");

        deactivate(session, "{\"currentPassword\": \"not-the-password\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("CURRENT_PASSWORD_INCORRECT"));

        assertThat(isActive("u22-wrong@example.com")).isTrue();
        mockMvc.perform(get("/api/users/me").header("Authorization", "Bearer " + accessTokenOf(session)))
                .andExpect(status().isOk());
    }

    @Test
    void deactivate_withABlankPassword_is400_validationFailed() throws Exception {
        MvcResult session = register("u22-blank@example.com");

        deactivate(session, "{\"currentPassword\": \"\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("VALIDATION_FAILED"));

        assertThat(isActive("u22-blank@example.com")).isTrue();
    }

    @Test
    void deactivate_withoutAToken_is401() throws Exception {
        mockMvc.perform(post("/api/users/me/deactivate").with(anonymous())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"currentPassword\": \"" + PASSWORD + "\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void deactivate_onlyAffectsTheCaller() throws Exception {
        MvcResult caller = register("u22-me@example.com");
        MvcResult other = register("u22-other@example.com");

        deactivate(caller, "{\"currentPassword\": \"" + PASSWORD + "\"}").andExpect(status().isOk());

        assertThat(isActive("u22-other@example.com")).isTrue();
        mockMvc.perform(get("/api/users/me").header("Authorization", "Bearer " + accessTokenOf(other)))
                .andExpect(status().isOk());
    }
}
