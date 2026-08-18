package com.sportconnect.integration;

import java.time.Duration;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.utility.DockerImageName;

/**
 * Real-RabbitMQ setup for NTF-3's live-delivery test, with the {@code rabbitmq_stomp} plugin
 * additionally enabled and its STOMP port exposed. Deliberately a separate container from
 * {@link RabbitMqTestContainerBase}'s, not a shared one — same reasoning as that class's own
 * Javadoc: a test that only needs plain AMQP shouldn't force a STOMP-capable broker to start, and
 * vice versa.
 *
 * <p>Enables the plugin via {@code execInContainer} (a live {@code rabbitmq-plugins enable} call —
 * RabbitMQ loads a plugin into a running node without a restart) rather than mounting/copying a
 * custom {@code enabled_plugins} file (the approach {@code infra/docker-compose.dev.yml} uses for
 * real dev infra). The file-copy approach hit an unrelated, pre-existing classpath conflict in this
 * project's test dependencies — {@code testcontainers:2.0.5}'s {@code MountableFile.transferTo}
 * (used by both {@code withCopyFileToContainer} and {@code withClasspathResourceMapping}) calls
 * {@code commons-compress}'s tar writer, which needs a newer {@code commons-lang3} API
 * ({@code SystemProperties.getUserName}) than the version {@code server/build.gradle} pins
 * elsewhere — `NoSuchMethodError` at runtime. Nothing in this test actually needs a *file* enabling
 * the plugin; a live enable call sidesteps that dependency entirely.
 */
public abstract class RabbitMqStompTestContainerBase extends BaseIT {

    private static final GenericContainer<?> RABBITMQ =
            new GenericContainer<>(DockerImageName.parse("rabbitmq:3-management-alpine"))
                    .withExposedPorts(5672, 61613)
                    // Log-based rather than the default host-port-probe wait strategy: the default
                    // opens a raw socket from the JVM host to each mapped port, which proved flaky
                    // against Docker Desktop's network proxy on this Windows host even though the
                    // container was verifiably listening (confirmed via `docker exec ... ss -ltn`
                    // against a manually-started equivalent container). Reading the container's own
                    // stdout via the Docker API sidesteps that host-side probe entirely.
                    .waitingFor(Wait.forLogMessage(".*Server startup complete.*", 1))
                    .withStartupTimeout(Duration.ofSeconds(120));

    static {
        RABBITMQ.start();
        try {
            RABBITMQ.execInContainer("rabbitmq-plugins", "enable", "rabbitmq_stomp");
        } catch (Exception e) {
            throw new IllegalStateException("Failed to enable rabbitmq_stomp on the test container", e);
        }
    }

    @DynamicPropertySource
    static void rabbitMqProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.rabbitmq.host", RABBITMQ::getHost);
        registry.add("spring.rabbitmq.port", () -> RABBITMQ.getMappedPort(5672));
        registry.add("app.stomp-relay.host", RABBITMQ::getHost);
        registry.add("app.stomp-relay.port", () -> RABBITMQ.getMappedPort(61613));
    }
}
