package com.sportconnect.user.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.common.cache.CacheGuard
import com.sportconnect.reference.api.service.ReferenceService
import com.sportconnect.sport.api.service.UserSportProfileService
import com.sportconnect.user.api.dto.UserAccessState
import com.sportconnect.user.api.service.UserFriendService
import com.sportconnect.user.entity.User
import com.sportconnect.user.repository.UserPreferenceRepository
import com.sportconnect.user.repository.UserRepository
import org.springframework.dao.QueryTimeoutException
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.ValueOperations
import com.sportconnect.auth.api.service.KeycloakCredentialService
import spock.lang.Specification
import spock.lang.Subject

import java.time.Duration

/** A25: the cached active-flag lookup behind the per-request authentication gate. */
class UserAccessStateSpec extends Specification {

    UserRepository userRepository = Mock()
    UserAccessStateCache cache = Mock()

    @Subject
    UserServiceImpl userService = new UserServiceImpl(userRepository, Mock(AccountConfirmationService), Mock(KeycloakCredentialService),
            Mock(UserFriendService), Mock(UserSportProfileService), Mock(StringRedisTemplate),
            new ObjectMapper(), Mock(ReferenceService), Mock(UserPreferenceRepository), cache, Mock(UserProvisioningLock))

    private static User user(UUID id, boolean active) {
        User.builder().id(id).email("a@x.com").isActive(active)
                .build()
    }

    def "a cache hit is returned without touching the database"() {
        given:
        def id = UUID.randomUUID()
        def state = new UserAccessState(true)

        when:
        def result = userService.getAccessState(id)

        then:
        1 * cache.get(id) >> Optional.of(state)
        0 * userRepository._
        0 * cache.put(*_)
        result == Optional.of(state)
    }

    def "a miss loads the user (inactive included) and caches only the active flag (A37: no roles)"() {
        given:
        def id = UUID.randomUUID()

        when:
        def result = userService.getAccessState(id)

        then:
        1 * cache.get(id) >> Optional.empty()
        1 * userRepository.findById(id) >> Optional.of(user(id, false))
        1 * cache.put(id, new UserAccessState(false))
        result.get() == new UserAccessState(false)
    }

    def "an unknown user is empty and is not cached, so a newly provisioned account works at once"() {
        given:
        def id = UUID.randomUUID()

        when:
        def result = userService.getAccessState(id)

        then:
        1 * cache.get(id) >> Optional.empty()
        1 * userRepository.findById(id) >> Optional.empty()
        0 * cache.put(*_)
        result.isEmpty()
    }

    // ---- the cache itself ----

    ValueOperations<String, String> ops = Mock()
    StringRedisTemplate redis = Mock() {
        opsForValue() >> ops
    }

    def "the cache round-trips a state through its string format (A37: just the active flag)"() {
        given:
        def real = new UserAccessStateCache(redis, new CacheGuard(), Duration.ofSeconds(60))
        def id = UUID.randomUUID()

        when:
        real.put(id, new UserAccessState(true))
        real.put(id, new UserAccessState(false))

        then:
        1 * ops.set("user:access-state:" + id, "1", Duration.ofSeconds(60))
        1 * ops.set("user:access-state:" + id, "0", Duration.ofSeconds(60))

        when:
        def read = real.get(id)

        then:
        1 * ops.get("user:access-state:" + id) >> "0"
        read.get() == new UserAccessState(false)
    }

    def "a value cached by the previous release (flag|roles) is still read for its remaining TTL, and a garbled one is a miss"() {
        given:
        def real = new UserAccessStateCache(redis, new CacheGuard(), Duration.ofSeconds(60))
        def id = UUID.randomUUID()
        ops.get("user:access-state:" + id) >> cached

        expect:
        real.get(id) == expected

        where:
        cached             | expected
        "1|USER,ADMIN"     | Optional.of(new UserAccessState(true))
        "0|USER"           | Optional.of(new UserAccessState(false))
        "1|"               | Optional.of(new UserAccessState(true))
        "1"                | Optional.of(new UserAccessState(true))
        "0"                | Optional.of(new UserAccessState(false))
        ""                 | Optional.empty()
        "x"                | Optional.empty()
        "2|USER"           | Optional.empty()
        "11"               | Optional.empty()
        null               | Optional.empty()
    }

    def "a Redis outage is a cache miss, and a failed write or evict does not throw"() {
        given:
        def real = new UserAccessStateCache(redis, new CacheGuard(), Duration.ofSeconds(60))
        ops.get(_) >> { throw new QueryTimeoutException("redis down") }
        ops.set(*_) >> { throw new QueryTimeoutException("redis down") }
        redis.delete(_ as String) >> { throw new QueryTimeoutException("redis down") }

        expect:
        real.get(UUID.randomUUID()).isEmpty()

        when:
        real.put(UUID.randomUUID(), new UserAccessState(true))
        real.evict(UUID.randomUUID())

        then:
        noExceptionThrown()
    }

    def "an unreadable cached value is treated as a miss"() {
        given:
        def real = new UserAccessStateCache(redis, new CacheGuard(), Duration.ofSeconds(60))
        ops.get(_) >> "garbage"

        expect:
        real.get(UUID.randomUUID()).isEmpty()
    }
}
