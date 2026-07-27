package com.sportconnect.integration;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Shared real-Redis setup for any integration test needing a reachable Redis — extracted out of
 * {@link BaseIT} so a test that can't extend {@code BaseIT} (e.g. one needing
 * {@code webEnvironment = RANDOM_PORT} instead of {@code BaseIT}'s {@code MOCK} +
 * {@code @AutoConfigureMockMvc}) can still get the same container without duplicating it.
 * <p>
 * A plain static field started once per test JVM run (not the {@code @Testcontainers}/
 * {@code @Container} JUnit5 extension, which would start/stop it per test class). Testcontainers'
 * Ryuk sidecar reaps this container automatically at JVM exit — no manual teardown needed.
 */
public abstract class RedisTestContainerBase {

    private static final GenericContainer<?> REDIS =
            new GenericContainer<>(DockerImageName.parse("redis:7-alpine"))
                    .withExposedPorts(6379);

    static {
        REDIS.start();
    }

    @DynamicPropertySource
    static void redisProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.data.redis.host", REDIS::getHost);
        registry.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
    }
}
