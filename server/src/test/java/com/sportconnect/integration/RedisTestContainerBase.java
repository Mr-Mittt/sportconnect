package com.sportconnect.integration;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Standalone real-Redis setup for a test that can't (or deliberately shouldn't) extend
 * {@link BaseIT} — e.g. {@link InternalServiceFilterScopeIT}, which needs
 * {@code webEnvironment = RANDOM_PORT} and explicitly avoids {@code BaseIT}'s {@code MOCK} +
 * {@code @AutoConfigureMockMvc} setup (see that class's Javadoc). A test that also wants
 * {@code BaseIT}'s MockMvc/auth helpers should extend {@link RedisBaseIT} instead, not this class
 * — both reference the same {@link SharedRedisContainer} instance, so either path gets the same
 * running Redis, never two.
 */
public abstract class RedisTestContainerBase {

    @DynamicPropertySource
    static void redisProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.data.redis.host", SharedRedisContainer.REDIS::getHost);
        registry.add("spring.data.redis.port", () -> SharedRedisContainer.REDIS.getMappedPort(6379));
    }
}
