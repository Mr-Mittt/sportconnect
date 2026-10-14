package com.sportconnect.user.service

import com.fasterxml.jackson.databind.ObjectMapper
import com.sportconnect.auth.api.service.AuthService
import com.sportconnect.common.cache.CacheGuard
import com.sportconnect.reference.api.service.ReferenceService
import com.sportconnect.sport.api.service.UserSportProfileService
import com.sportconnect.user.api.dto.UserAccessState
import com.sportconnect.user.api.service.UserFriendService
import com.sportconnect.user.entity.Role
import com.sportconnect.user.entity.User
import com.sportconnect.user.repository.RoleRepository
import com.sportconnect.user.repository.UserPreferenceRepository
import com.sportconnect.user.repository.UserRepository
import org.springframework.dao.QueryTimeoutException
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.ValueOperations
import org.springframework.security.crypto.password.PasswordEncoder
import spock.lang.Specification
import spock.lang.Subject

import java.time.Duration

/** A25: the cached {isActive, roles} lookup behind the per-request authentication gate. */
class UserAccessStateSpec extends Specification {

    UserRepository userRepository = Mock()
    UserAccessStateCache cache = Mock()

    @Subject
    UserServiceImpl userService = new UserServiceImpl(userRepository, Mock(RoleRepository), Mock(PasswordEncoder),
            Mock(UserFriendService), Mock(AuthService), Mock(UserSportProfileService), Mock(StringRedisTemplate),
            new ObjectMapper(), Mock(ReferenceService), Mock(UserPreferenceRepository), cache, Mock(UserProvisioningLock))

    private static User user(UUID id, boolean active, String... roles) {
        User.builder().id(id).email("a@x.com").isActive(active)
                .roles(roles.toList().withIndex().collect { n, i -> new Role(id: i + 1, name: n) } as Set).build()
    }

    def "a cache hit is returned without touching the database"() {
        given:
        def id = UUID.randomUUID()
        def state = new UserAccessState(true, ["USER"])

        when:
        def result = userService.getAccessState(id)

        then:
        1 * cache.get(id) >> Optional.of(state)
        0 * userRepository._
        0 * cache.put(*_)
        result == Optional.of(state)
    }

    def "a miss loads the user (inactive included), sorts the roles and caches the state"() {
        given:
        def id = UUID.randomUUID()

        when:
        def result = userService.getAccessState(id)

        then:
        1 * cache.get(id) >> Optional.empty()
        1 * userRepository.findById(id) >> Optional.of(user(id, false, "USER", "ADMIN"))
        1 * cache.put(id, new UserAccessState(false, ["ADMIN", "USER"]))
        result.get() == new UserAccessState(false, ["ADMIN", "USER"])
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

    def "the cache round-trips a state through its string format"() {
        given:
        def real = new UserAccessStateCache(redis, new CacheGuard(), Duration.ofSeconds(60))
        def id = UUID.randomUUID()

        when:
        real.put(id, new UserAccessState(true, ["USER", "ADMIN"]))

        then:
        1 * ops.set("user:access-state:" + id, "1|USER,ADMIN", Duration.ofSeconds(60))

        when:
        def read = real.get(id)

        then:
        1 * ops.get("user:access-state:" + id) >> "0|USER"
        read.get() == new UserAccessState(false, ["USER"])
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
        real.put(UUID.randomUUID(), new UserAccessState(true, []))
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
