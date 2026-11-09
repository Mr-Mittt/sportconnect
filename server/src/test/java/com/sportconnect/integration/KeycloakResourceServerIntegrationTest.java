package com.sportconnect.integration;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JWSObject;
import com.nimbusds.jose.Payload;
import com.nimbusds.jose.crypto.MACSigner;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import org.hamcrest.Matchers;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.ResultActions;

import java.time.Duration;
import java.util.Map;
import java.util.UUID;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A25: the backend is a resource server for Keycloak. Real {@code MockMvc} requests through the real filter chain, the real
 * {@code NimbusJwtDecoder} fetching keys over HTTP from {@link TestKeycloak}'s JWKS, the real cached per-request gate
 * ({@code UserService.getAccessState}, a real Redis) and a real DB round-trip.
 *
 * <p>Covers the ticket's matrix: a valid token, an expired one, a wrong issuer, a wrong audience, a forged signature, the
 * legacy HS256 token, a {@code sub} nobody provisioned, a deactivated user, and an unreachable key set. The
 * deactivate-then-reactivate eviction and the Redis outage are pinned in
 * {@code UserDeactivationSessionRevocationIntegrationTest} and {@code RedisOutageAuthenticationIntegrationTest}.
 *
 * <p>Account lifecycle: a deactivated caller gets 401 on every authenticated path, because the gate sits in the filter.
 */
class KeycloakResourceServerIntegrationTest extends RedisBaseIT {

    @Autowired
    private UserRepository userRepository;


    private UUID userId;

    @BeforeEach
    void setUp() {
        userRepository.deleteAll();
        userId = createUserWithRoles(true, "USER");
    }

    @AfterEach
    void tearDown() {
        TestKeycloak.jwksAvailable(true);
        userRepository.deleteAll();
    }

    private ResultActions me(String token) throws Exception {
        return mockMvc.perform(get("/api/users/me").header("Authorization", "Bearer " + token));
    }

    @Test
    void aValidToken_authenticates_asTheSubjectUser() throws Exception {
        me(TestKeycloak.token(userId, "USER"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(userId.toString()));
    }

    @Test
    void anExpiredToken_isUnauthorized() throws Exception {
        me(TestKeycloak.forUser(userId).lifetime(Duration.ofMinutes(-10)).build()).andExpect(status().isUnauthorized());
    }

    @Test
    void aTokenFromAnotherIssuer_isUnauthorized() throws Exception {
        me(TestKeycloak.forUser(userId).issuer("http://evil.example/realms/sportconnect").build())
                .andExpect(status().isUnauthorized());
    }

    @Test
    void aTokenNotMeantForThisApi_isUnauthorized() throws Exception {
        // A genuine Keycloak token for another client of the realm: right issuer and signature, wrong audience.
        me(TestKeycloak.forUser(userId).audience("account").build()).andExpect(status().isUnauthorized());
    }

    @Test
    void aTokenSignedWithAnotherKey_isUnauthorized() throws Exception {
        me(TestKeycloak.forUser(userId).signedByAnotherKey().build()).andExpect(status().isUnauthorized());
    }

    @Test
    void theLegacyHs256Token_isNoLongerAccepted() throws Exception {
        // What the pre-Keycloak login minted (removed by A28): an HS256 token signed with the shared secret. The
        // resource server accepts RS256 from the realm's JWKS only.
        JWSObject jws = new JWSObject(new JWSHeader(JWSAlgorithm.HS256), new Payload(Map.of(
                "sub", userId.toString(), "email", "legacy@example.com", "roles", java.util.List.of("USER"),
                "exp", System.currentTimeMillis() / 1000 + 300)));
        jws.sign(new MACSigner("legacy-secret-key-for-the-removed-hs256-mint-min-256-bits".getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        String legacy = jws.serialize();

        me(legacy).andExpect(status().isUnauthorized());
    }

    @Test
    void aValidTokenForASubNobodyProvisioned_isUnauthorized() throws Exception {
        me(TestKeycloak.token(UUID.randomUUID(), "USER")).andExpect(status().isUnauthorized());
    }

    @Test
    void aDeactivatedUsersValidToken_isUnauthorized() throws Exception {
        UUID inactive = createUserWithRoles(false, "USER");

        me(TestKeycloak.token(inactive, "USER")).andExpect(status().isUnauthorized());
    }

    @Test
    void noToken_isUnauthorized() throws Exception {
        mockMvc.perform(get("/api/users/me")).andExpect(status().isUnauthorized());
    }

    @Test
    void aPublicEndpoint_ignoresABadToken() throws Exception {
        mockMvc.perform(get("/api/reference/languages").header("Authorization", "Bearer garbage"))
                .andExpect(status().isOk());
    }

    // ---------- A37: roles come from the token's realm_access.roles, never from our database ----------

    private ResultActions deleteUser(UUID target, String bearerValue) throws Exception {
        return mockMvc.perform(delete("/api/users/{id}", target).header("Authorization", bearerValue));
    }

    @Test
    void aUserToken_reachesAUserEndpoint_butNotAnAdminOne() throws Exception {
        UUID target = createUserWithRoles(true, "USER");

        me(TestKeycloak.token(userId, "USER")).andExpect(status().isOk());
        deleteUser(target, "Bearer " + TestKeycloak.token(userId, "USER")).andExpect(status().isForbidden());
    }

    @Test
    void anAdminToken_reachesAnAdminEndpoint() throws Exception {
        UUID admin = createUserWithRoles(true, "USER", "ADMIN");
        UUID target = createUserWithRoles(true, "USER");

        deleteUser(target, bearer(admin)).andExpect(status().isOk());
    }

    @Test
    void aTokenWithoutRoles_isForbiddenEverywhereThatNeedsOne() throws Exception {
        me(TestKeycloak.token(userId)).andExpect(status().isForbidden());
        me(TestKeycloak.forUser(userId).build()).andExpect(status().isForbidden());
    }

    @Test
    void roleNamesThatAreNotUserOrAdmin_grantNothing() throws Exception {
        me(TestKeycloak.token(userId, "VENDOR", "offline_access", "uma_authorization", "default-roles-sportconnect", "user"))
                .andExpect(status().isForbidden());
    }

    @Test
    void aDeactivatedUser_withAValidAdminToken_isStillRefused() throws Exception {
        UUID inactiveAdmin = createUserWithRoles(false, "USER", "ADMIN");
        UUID target = createUserWithRoles(true, "USER");

        me(TestKeycloak.token(inactiveAdmin, "USER", "ADMIN")).andExpect(status().isUnauthorized());
        deleteUser(target, bearer(inactiveAdmin)).andExpect(status().isUnauthorized());
    }

    @Test
    void theProfileResponseCarriesTheTokenRoles_notTheDatabaseOnes() throws Exception {
        UUID admin = createUserWithRoles(true, "USER", "ADMIN");

        mockMvc.perform(get("/api/users/me").header("Authorization", bearer(admin)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.roles.length()").value(2))
                .andExpect(jsonPath("$.data.roles", Matchers.containsInAnyOrder("USER", "ADMIN")));
    }

    // ---------- Keycloak unreachable ----------

    @Test
    void whenTheKeySetCannotBeFetched_anAuthenticatedEndpointAnswers503_notA401() throws Exception {
        TestKeycloak.jwksAvailable(false);

        // An unknown kid forces the decoder to re-fetch the key set, which is down.
        me(TestKeycloak.forUser(userId).unknownKeyId().build())
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.errorCode").value("SERVICE_UNAVAILABLE"));
    }

    @Test
    void whenTheKeySetCannotBeFetched_aPublicEndpointStillWorks() throws Exception {
        TestKeycloak.jwksAvailable(false);

        mockMvc.perform(get("/api/reference/languages")
                        .header("Authorization", "Bearer " + TestKeycloak.forUser(userId).unknownKeyId().build()))
                .andExpect(status().isOk());
    }

    @Test
    void aKeyAlreadyCached_keepsWorking_whenKeycloakGoesDown() throws Exception {
        me(TestKeycloak.token(userId, "USER")).andExpect(status().isOk()); // the decoder now holds the key set
        TestKeycloak.jwksAvailable(false);

        me(TestKeycloak.token(userId, "USER")).andExpect(status().isOk());
    }
}
