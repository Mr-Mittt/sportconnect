package com.sportconnect.integration;

import com.sportconnect.user.entity.Role;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.RoleRepository;
import com.sportconnect.user.repository.UserPreferenceRepository;
import com.sportconnect.user.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.test.web.servlet.ResultActions;

import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A33 end-to-end: email verification is an optional request, never a gate. Through the real request pipeline, the real
 * {@code UserServiceImpl} and {@code ConfirmationCodeStore} on a real Redis, and the real Keycloak client talking to
 * {@link TestKeycloak}: one mail per wait, nothing sent for an email Keycloak already holds as verified (and the app's
 * copy follows), a deactivated caller refused, a Keycloak outage that does not cost the user their wait.
 */
class EmailVerificationIntegrationTest extends RedisBaseIT {

    @Autowired
    private UserRepository userRepository;
    @Autowired
    private UserPreferenceRepository userPreferenceRepository;
    @Autowired
    private RoleRepository roleRepository;
    @Autowired
    private StringRedisTemplate redis;

    @BeforeEach
    void setUp() {
        clean();
        if (roleRepository.findByName(Role.USER).isEmpty()) {
            roleRepository.save(Role.builder().name(Role.USER).description("test").build());
        }
        TestKeycloak.adminAvailable(true);
        TestKeycloak.resetVerification();
    }

    @AfterEach
    void tearDown() {
        TestKeycloak.adminAvailable(true);
        TestKeycloak.resetVerification();
        clean();
    }

    private void clean() {
        userPreferenceRepository.deleteAll();
        userRepository.deleteAll();
        var keys = redis.keys("user:confirm:*");
        if (keys != null && !keys.isEmpty()) {
            redis.delete(keys);
        }
    }

    private User register(String email, boolean active) {
        Role userRole = roleRepository.findByName(Role.USER).orElseThrow();
        User saved = userRepository.save(User.builder()
                .email(email)
                .firstName("Verify")
                .lastName("Tester")
                .isActive(active)
                .roles(Set.of(userRole))
                .build());
        TestKeycloak.registerUser(saved.getId(), email, "password123");
        return saved;
    }

    private ResultActions requestVerification(User user) throws Exception {
        return mockMvc.perform(post("/api/users/me/email-verification").header("Authorization", bearer(user.getId())));
    }

    @Test
    void anUnverifiedAccount_getsOneMail_backToTheWebApp_andTheAppCopyIsUntouched() throws Exception {
        User user = register("unverified@example.com", true);

        requestVerification(user).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.alreadyVerified").value(false))
                .andExpect(jsonPath("$.data.resendAfterSeconds").value(60));

        assertThat(TestKeycloak.verificationRequests(user.getId())).hasSize(1);
        String query = TestKeycloak.verificationRequests(user.getId()).get(0);
        assertThat(query).contains("client_id=sportconnect-web").contains("redirect_uri=http://localhost:5173/").contains("lifespan=43200");
        assertThat(userRepository.findById(user.getId()).orElseThrow().getIsEmailVerified()).isFalse();
    }

    @Test
    void aSecondRequestInsideTheWait_is429_withTheSecondsLeft_andSendsNothing() throws Exception {
        User user = register("twice@example.com", true);
        requestVerification(user).andExpect(status().isOk());

        requestVerification(user).andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.errorCode").value("VERIFICATION_RESEND_TOO_SOON"))
                .andExpect(jsonPath("$.errorParams.seconds").isNumber());

        assertThat(TestKeycloak.verificationRequests(user.getId())).hasSize(1);
    }

    @Test
    void anEmailKeycloakAlreadyHoldsAsVerified_sendsNothing_andTheAppCopyFollows() throws Exception {
        User user = register("done@example.com", true);
        TestKeycloak.setEmailVerified(user.getId(), true);

        requestVerification(user).andExpect(status().isOk())
                .andExpect(jsonPath("$.data.alreadyVerified").value(true))
                .andExpect(jsonPath("$.data.resendAfterSeconds").value(0));

        assertThat(TestKeycloak.verificationRequests(user.getId())).isEmpty();
        assertThat(userRepository.findById(user.getId()).orElseThrow().getIsEmailVerified()).isTrue();
    }

    @Test
    void aDeactivatedCaller_isRefused_andNothingIsSent() throws Exception {
        User user = register("off@example.com", false);

        requestVerification(user).andExpect(status().is4xxClientError());

        assertThat(TestKeycloak.verificationRequests(user.getId())).isEmpty();
    }

    @Test
    void withoutAToken_is401() throws Exception {
        mockMvc.perform(post("/api/users/me/email-verification")).andExpect(status().isUnauthorized());
    }

    @Test
    void aKeycloakOutage_is503_andDoesNotCostTheUserTheirWait() throws Exception {
        User user = register("outage@example.com", true);
        TestKeycloak.adminAvailable(false);

        requestVerification(user).andExpect(status().isServiceUnavailable());

        TestKeycloak.adminAvailable(true);
        requestVerification(user).andExpect(status().isOk());
        assertThat(TestKeycloak.verificationRequests(user.getId())).hasSize(1);
    }
}
