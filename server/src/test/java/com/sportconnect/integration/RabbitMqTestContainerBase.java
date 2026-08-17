package com.sportconnect.integration;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Real-RabbitMQ setup for the (currently few) integration tests that need a reachable broker —
 * same container-lifecycle shape as {@link RedisTestContainerBase} (a plain static field started
 * once per test JVM run, not the {@code @Testcontainers}/{@code @Container} JUnit5 extension), but
 * deliberately positioned differently: this extends {@link BaseIT} (getting Redis, MockMvc, and
 * the auth helpers for free), rather than {@code BaseIT} extending this. A test extends this class
 * specifically — not {@code BaseIT} directly — when it needs real RabbitMQ. Keeping this out of
 * {@code BaseIT}'s own hierarchy matters because a {@code @DynamicPropertySource} method only runs
 * once its declaring class is loaded: if this container lived in {@code BaseIT}'s ancestry, every
 * IT test in the suite would force-load it and start a broker most of them never use.
 */
public abstract class RabbitMqTestContainerBase extends BaseIT {

    private static final GenericContainer<?> RABBITMQ =
            new GenericContainer<>(DockerImageName.parse("rabbitmq:3-management-alpine"))
                    .withExposedPorts(5672);

    static {
        RABBITMQ.start();
    }

    @DynamicPropertySource
    static void rabbitMqProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.rabbitmq.host", RABBITMQ::getHost);
        registry.add("spring.rabbitmq.port", () -> RABBITMQ.getMappedPort(5672));
    }
}
