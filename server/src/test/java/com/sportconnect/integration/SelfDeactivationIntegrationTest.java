package com.sportconnect.integration;

import com.jayway.jsonpath.JsonPath;
import com.sportconnect.user.entity.Role;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.RoleRepository;
import com.sportconnect.user.repository.UserPreferenceRepository;
import com.sportconnect.user.repository.UserRepository;
import jakarta.servlet.http.Cookie;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.ResultActions;

import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * U22 end-to-end: {@code POST /api/users/me/deactivate} through the real request pipeline, real
 * {@code UserServiceImpl} / {@code AuthServiceImpl} and real Redis (the per-request gate). The users are created
 * directly (A28 removed the register endpoint that used to create them) and given a password in {@link TestKeycloak},
 * the only place a password lives since U24. The emailed-code path is in {@code AccountConfirmationIntegrationTest}.
 * A wrong password changes nothing; the right one deactivates the account, kills the caller's own sessions (access
 * token and refresh cookie), and leaves the re-activation path open (A26: the ticket flow of {@code /api/auth/callback}
 * and {@code /api/auth/reactivate}).
 */
class SelfDeactivationIntegrationTest extends RedisBaseIT {

    private static final String PASSWORD = "password123";

    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserPreferenceRepository userPreferenceRepository;
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
        userPreferenceRepository.deleteAll();
        userRepository.deleteAll();
    }

    private ResultActions postJson(String path, String body) throws Exception {
        return mockMvc.perform(post(path).with(anonymous()).contentType(MediaType.APPLICATION_JSON).content(body));
    }

    /** An active user with a known Keycloak password (what a password user has once the first sign-in provisioned them). */
    private User register(String email) {
        Role userRole = roleRepository.findByName(Role.USER).orElseThrow();
        User saved = userRepository.save(User.builder()
                .email(email)
                .firstName("Auth")
                .lastName("Tester")
                .isActive(true)
                .roles(Set.of(userRole))
                .build());
        TestKeycloak.registerUser(saved.getId(), email, PASSWORD);
        return saved;
    }

    private ResultActions deactivate(User user, String body) throws Exception {
        return mockMvc.perform(post("/api/users/me/deactivate")
                .header("Authorization", bearer(user.getId()))
                .contentType(MediaType.APPLICATION_JSON)
                .content(body));
    }

    private boolean isActive(String email) {
        return userRepository.findByEmail(email).orElseThrow().getIsActive();
    }

    @Test
    void deactivate_withTheRightPassword_deactivatesAndRevokesTheCallersSessions() throws Exception {
        User session = register("u22-ok@example.com");
        // A26: the live session is a Keycloak one; the cookie it would hold is its refresh token.
        String refreshToken = TestKeycloak.startSession(TestKeycloak.Identity.of(session.getId()).email("u22-ok@example.com"));

        deactivate(session, "{\"currentPassword\": \"" + PASSWORD + "\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        assertThat(isActive("u22-ok@example.com")).isFalse();
        // The access token the caller used is dead, and so is the refresh cookie.
        mockMvc.perform(get("/api/users/me").header("Authorization", bearer(session.getId())))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(post("/api/auth/refresh").with(anonymous()).cookie(new Cookie("refreshToken", refreshToken)))
                .andExpect(status().isUnauthorized());
        assertThat(TestKeycloak.sessionEnded(refreshToken)).isTrue();
    }

    @Test
    void deactivate_thenReactivate_bringsTheAccountBack() throws Exception {
        User session = register("u22-back@example.com");
        deactivate(session, "{\"currentPassword\": \"" + PASSWORD + "\"}").andExpect(status().isOk());

        // A26: signing in again with the password answers ACCOUNT_DEACTIVATED plus a ticket; confirming it brings the account back.
        String verifier = "v".repeat(43);
        String code = TestKeycloak.issueCode(TestKeycloak.Identity.of(session.getId()).email("u22-back@example.com"), verifier);
        org.springframework.test.web.servlet.MvcResult denied = postJson("/api/auth/callback", "{\"code\": \"" + code + "\", \"codeVerifier\": \"" + verifier + "\"}")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.errorCode").value("ACCOUNT_DEACTIVATED"))
                .andReturn();
        String ticket = JsonPath.read(denied.getResponse().getContentAsString(), "$.errorParams.reactivationTicket");

        postJson("/api/auth/reactivate", "{\"ticket\": \"" + ticket + "\"}")
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accessToken").isNotEmpty());

        assertThat(isActive("u22-back@example.com")).isTrue();
    }

    @Test
    void deactivate_withAWrongPassword_is400_andNothingChanges() throws Exception {
        User session = register("u22-wrong@example.com");

        deactivate(session, "{\"currentPassword\": \"not-the-password\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("CURRENT_PASSWORD_INCORRECT"));

        assertThat(isActive("u22-wrong@example.com")).isTrue();
        mockMvc.perform(get("/api/users/me").header("Authorization", bearer(session.getId())))
                .andExpect(status().isOk());
    }

    @Test
    void deactivate_withABlankPassword_is400_confirmationRequired() throws Exception {
        User session = register("u22-blank@example.com");

        deactivate(session, "{\"currentPassword\": \"\"}")
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("CONFIRMATION_REQUIRED"));

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
        User caller = register("u22-me@example.com");
        User other = register("u22-other@example.com");

        deactivate(caller, "{\"currentPassword\": \"" + PASSWORD + "\"}").andExpect(status().isOk());

        assertThat(isActive("u22-other@example.com")).isTrue();
        mockMvc.perform(get("/api/users/me").header("Authorization", bearer(other.getId())))
                .andExpect(status().isOk());
    }
}
