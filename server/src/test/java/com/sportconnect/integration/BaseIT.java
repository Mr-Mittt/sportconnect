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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

/**
 * Base class for integration tests
 * Provides common configuration and utilities for all integration tests
 * <p>
 * The real-Redis/RabbitMQ Testcontainer setup lives in {@link RedisTestContainerBase}/
 * {@link RabbitMqTestContainerBase} (extracted so a test needing {@code webEnvironment =
 * RANDOM_PORT} instead of this class's {@code MOCK} + {@code @AutoConfigureMockMvc} can reuse
 * them without duplicating the containers).
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
public abstract class BaseIT extends RabbitMqTestContainerBase {

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
