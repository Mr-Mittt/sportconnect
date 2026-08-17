package com.sportconnect.integration;

import org.testcontainers.containers.GenericContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * The actual Redis Testcontainer, extracted out of {@link RedisTestContainerBase} so both that
 * class (standalone — {@link InternalServiceFilterScopeIT} extends it directly, deliberately
 * independent of {@link BaseIT}, see that class's Javadoc) and {@link RedisBaseIT} (which
 * combines it with {@code BaseIT}) reference the same running container instead of each starting
 * their own. No Spring annotations here — just the container and its one-time startup, same
 * "static field started once per test JVM run" shape as before.
 */
final class SharedRedisContainer {

    static final GenericContainer<?> REDIS =
            new GenericContainer<>(DockerImageName.parse("redis:7-alpine"))
                    .withExposedPorts(6379);

    static {
        REDIS.start();
    }

    private SharedRedisContainer() {
    }
}
