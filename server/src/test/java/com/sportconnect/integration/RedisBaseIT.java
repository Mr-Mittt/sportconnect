package com.sportconnect.integration;

import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * {@link BaseIT} (real MockMvc, auth helpers) + a real Redis — for tests whose request path goes
 * through a service that actually touches {@code StringRedisTemplate} (e.g. {@code PostServiceImpl}
 * /{@code CommentServiceImpl}'s like/comment counters and comment-preview cache; verified per test
 * class before moving it here, not assumed from "this test's domain sounds related"). A test on
 * plain {@code BaseIT} whose service is fully mocked (like {@code GroupControllerTest}) or whose
 * domain never touches Redis (like {@code NotificationAccessGateIntegrationTest}) has no reason to
 * pay for this container — {@code @DynamicPropertySource} methods only run once their declaring
 * class is loaded, so keeping this out of {@code BaseIT}'s own ancestry matters, same reasoning as
 * {@code RabbitMqTestContainerBase}. References the same {@link SharedRedisContainer} instance as
 * {@link RedisTestContainerBase} — never a second Redis container.
 */
public abstract class RedisBaseIT extends BaseIT {

    @DynamicPropertySource
    static void redisProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.data.redis.host", SharedRedisContainer.REDIS::getHost);
        registry.add("spring.data.redis.port", () -> SharedRedisContainer.REDIS.getMappedPort(6379));
    }
}
