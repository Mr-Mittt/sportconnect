package com.sportconnect.integration;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * Shared real-RabbitMQ setup for any integration test needing a reachable broker — same shape and
 * rationale as {@link RedisTestContainerBase} (a plain static field started once per test JVM
 * run, not the {@code @Testcontainers}/{@code @Container} JUnit5 extension). Chained onto
 * {@code RedisTestContainerBase} rather than duplicating it, so {@link BaseIT} gets both real
 * dependencies through one inheritance link and this container's one-time startup cost is paid
 * once for the whole {@code :server:test} run, not per test class.
 */
public abstract class RabbitMqTestContainerBase extends RedisTestContainerBase {

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
