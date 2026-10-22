package com.sportconnect.integration;

import com.nimbusds.jose.JWSAlgorithm;
import com.nimbusds.jose.JWSHeader;
import com.nimbusds.jose.JWSObject;
import com.nimbusds.jose.Payload;
import com.nimbusds.jose.crypto.MACSigner;
import com.sportconnect.user.entity.Role;
import com.sportconnect.user.repository.UserRepository;
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
        userId = createUserWithRoles(true, Role.USER);
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
        me(TestKeycloak.token(userId))
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
        me(TestKeycloak.token(UUID.randomUUID())).andExpect(status().isUnauthorized());
    }

    @Test
    void aDeactivatedUsersValidToken_isUnauthorized() throws Exception {
        UUID inactive = createUserWithRoles(false, Role.USER);

        me(TestKeycloak.token(inactive)).andExpect(status().isUnauthorized());
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

    // ---------- roles come from the database, never from the token ----------

    @Test
    void aRoleClaimInTheToken_isIgnored() throws Exception {
        UUID target = createUserWithRoles(true, Role.USER);

        mockMvc.perform(delete("/api/users/{id}", target).header("Authorization",
                        "Bearer " + TestKeycloak.forUser(userId).rolesClaim("ADMIN").build()))
                .andExpect(status().isForbidden());
    }

    @Test
    void aRoleHeldInTheDatabase_isHonoured() throws Exception {
        UUID admin = createUserWithRoles(true, Role.USER, Role.ADMIN);
        UUID target = createUserWithRoles(true, Role.USER);

        mockMvc.perform(delete("/api/users/{id}", target).header("Authorization", bearer(admin)))
                .andExpect(status().isOk());
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
        me(TestKeycloak.token(userId)).andExpect(status().isOk()); // the decoder now holds the key set
        TestKeycloak.jwksAvailable(false);

        me(TestKeycloak.token(userId)).andExpect(status().isOk());
    }
}
