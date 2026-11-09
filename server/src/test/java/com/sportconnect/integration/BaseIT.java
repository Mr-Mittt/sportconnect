package com.sportconnect.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import com.sportconnect.user.entity.User;
import com.sportconnect.user.repository.UserRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

/**
 * Base class for integration tests
 * Provides common configuration and utilities for all integration tests
 * <p>
 * Deliberately has NO real infra (Redis, RabbitMQ) in its own ancestry — a
 * {@code @DynamicPropertySource} method only runs once its declaring class is loaded, so keeping
 * this class infra-free means a test extending it directly starts no container it doesn't use
 * (e.g. {@code GroupControllerTest}, whose service layer is fully mocked; {@code
 * NotificationAccessGateIntegrationTest}, whose domain never touches Redis). A test whose request
 * path genuinely touches real Redis-backed code (verified per class, not assumed by domain name)
 * extends {@link RedisBaseIT} instead; one needing a real RabbitMQ broker extends
 * {@link RabbitMqTestContainerBase}. Both of those extend this class, not the other way around.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class BaseIT {

    /** A25: the real JwtDecoder verifies tokens against {@link TestKeycloak}'s JWKS, fetched over HTTP. */
    @DynamicPropertySource
    static void keycloakProperties(DynamicPropertyRegistry registry) {
        registry.add("app.keycloak.issuer-uri", () -> TestKeycloak.ISSUER);
        registry.add("app.keycloak.jwk-set-uri", () -> TestKeycloak.JWK_SET_URI);
        // A26: the backend's code exchange, refresh and end-session calls go to the same stand-in.
        registry.add("app.keycloak.token-uri", () -> TestKeycloak.TOKEN_URI);
        registry.add("app.keycloak.logout-uri", () -> TestKeycloak.LOGOUT_URI);
        registry.add("app.keycloak.redirect-uri", () -> TestKeycloak.REDIRECT_URI);
        // U24: the password check and the password set go to the same stand-in.
        registry.add("app.keycloak.admin-uri", () -> TestKeycloak.ADMIN_URI);
        registry.add("app.keycloak.credentials-client-secret", () -> TestKeycloak.CREDENTIALS_CLIENT_SECRET);
    }

    /**
     * A37: the realm roles each test user holds in Keycloak, recorded by {@link #createUserWithRoles}. {@link #bearer} puts
     * them in the token's {@code realm_access.roles}. Roles are not stored on the user any more, so this map is the tests'
     * stand-in for Keycloak's role mappings.
     */
    private static final java.util.Map<UUID, String[]> KEYCLOAK_ROLES = new java.util.concurrent.ConcurrentHashMap<>();

    /**
     * The {@code Authorization} header value for a valid Keycloak-style token of {@code userId} (A25). A37: the token carries
     * the roles {@link #createUserWithRoles} recorded for that user, and none for any other id.
     */
    protected static String bearer(UUID userId) {
        return "Bearer " + TestKeycloak.token(userId, KEYCLOAK_ROLES.getOrDefault(userId, new String[0]));
    }

    /**
     * A37: a token for {@code userId} that carries exactly {@code roles} in {@code realm_access.roles}, for a test that builds its
     * user by hand (not through {@link #createUserWithRoles}) and so has no recorded roles.
     */
    protected static String bearerFor(UUID userId, String... roles) {
        return "Bearer " + TestKeycloak.token(userId, roles);
    }

    @Autowired
    private UserRepository baseUsers;

    /**
     * A37: roles are Keycloak's and travel in the token, so the roles given here are recorded for {@link #bearer} and NOT
     * written to the database: a test that authenticates through a real token proves the database no longer matters.
     * Creates the (active or deactivated) user and returns its id.
     */
    protected UUID createUserWithRoles(boolean active, String... roleNames) {
        UUID id = baseUsers.save(User.builder()
                .email("it-" + UUID.randomUUID() + "@example.com")
                .firstName("It")
                .lastName("Tester")
                .username("ittester" + System.nanoTime())
                .isActive(active)
                .build()).getId();
        KEYCLOAK_ROLES.put(id, roleNames);
        return id;
    }

    @Autowired
    protected MockMvc mockMvc;

    @Autowired
    protected ObjectMapper objectMapper;

    @BeforeEach
    void baseSetup() {
        // Common setup for all integration tests
        // Can be overridden by subclasses
    }

    /**
     * Populates the security context so a request authenticates as {@code userId}, matching how
     * the real {@code JwtAuthenticationFilter} does it: principal is the raw userId string, not a
     * Spring Security {@code UserDetails}/{@code User} object. Controllers read the caller back via
     * {@code SecurityUtils.extractUserId(authentication)} or {@code @AuthenticationPrincipal String}
     * — {@code @WithMockUser}'s default principal is a {@code UserDetails} object, which breaks
     * both of those (a {@code ClassCastException} or a silently-null principal, respectively). Use
     * this instead of {@code @WithMockUser} for any endpoint using either mechanism (i.e. all of
     * them — this is the app's one identity convention, not a per-endpoint choice).
     */
    /**
     * <b>Takes effect only before the first {@code MockMvc} request of a test method.</b> Once a
     * request has run, every later request in that same method keeps running as that principal —
     * calling this again does not switch identity (verified while writing
     * {@code SessionSystemCommentIntegrationTest}, where a mid-test switch silently kept the
     * previous identity and made a test pass for the wrong reason). A case needing two identities
     * needs two test methods.
     */
    protected void authenticateAs(UUID userId, String... roles) {
        List<GrantedAuthority> authorities = (roles.length == 0 ? List.of("USER") : List.of(roles))
                .stream().map(role -> (GrantedAuthority) new SimpleGrantedAuthority("ROLE_" + role)).toList();
        SecurityContextHolder.getContext().setAuthentication(
                new UsernamePasswordAuthenticationToken(userId.toString(), null, authorities));
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    /**
     * Helper method to convert object to JSON string
     */
    protected String toJson(Object object) throws Exception {
        return objectMapper.writeValueAsString(object);
    }

    /**
     * Helper method to convert JSON string to object
     */
    protected <T> T fromJson(String json, Class<T> clazz) throws Exception {
        return objectMapper.readValue(json, clazz);
    }
}
