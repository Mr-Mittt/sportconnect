package com.sportconnect.user.service;

import com.sportconnect.common.cache.CacheGuard;
import com.sportconnect.user.api.dto.UserAccessState;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Duration;
import java.util.Arrays;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * A25: Redis cache in front of the per-request {@code {isActive, roles}} lookup (the authentication gate).
 *
 * <p>Cache-aside through {@link CacheGuard}: a Redis outage turns every call into a miss (the caller then reads the
 * database), and a failed write or eviction is skipped with a throttled WARN. Only a user that exists is cached,
 * never an absence, so an account is usable the moment it is provisioned.
 *
 * <p>Consistency: deactivate and reactivate evict after commit ({@link #evictAfterCommit}), so the next request
 * reloads the new state. A reader that loaded the old state just before the commit can write it back just after the
 * eviction; that stale entry lives at most {@code app.user.access-state-ttl} (60 s by default), the bound on how long
 * a deactivated user can slip through in that race.
 *
 * <p>Entry format: {@code <1|0>|<ROLE>,<ROLE>}, e.g. {@code 1|USER,ADMIN}.
 */
@Component
class UserAccessStateCache {

    private static final String KEY_PREFIX = "user:access-state:";

    private final StringRedisTemplate redis;
    private final CacheGuard cacheGuard;
    private final Duration ttl;

    UserAccessStateCache(StringRedisTemplate redis, CacheGuard cacheGuard,
                         @Value("${app.user.access-state-ttl:60s}") Duration ttl) {
        this.redis = redis;
        this.cacheGuard = cacheGuard;
        this.ttl = ttl;
    }

    /** The cached state, or empty on a miss, an unreadable entry, or when Redis is unreachable. */
    Optional<UserAccessState> get(UUID userId) {
        String cached = cacheGuard.read("user access state read",
                () -> redis.opsForValue().get(KEY_PREFIX + userId), null);
        return cached == null ? Optional.empty() : decode(cached);
    }

    void put(UUID userId, UserAccessState state) {
        cacheGuard.run("user access state write",
                () -> redis.opsForValue().set(KEY_PREFIX + userId, encode(state), ttl));
    }

    void evict(UUID userId) {
        cacheGuard.run("user access state evict", () -> redis.delete(KEY_PREFIX + userId));
    }

    /**
     * {@link #evict} once the surrounding transaction commits, so a request cannot reload the old database value
     * between the eviction and the commit. With no active transaction it evicts immediately; a rollback never evicts.
     */
    void evictAfterCommit(UUID userId) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            evict(userId);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                evict(userId);
            }
        });
    }

    private static String encode(UserAccessState state) {
        return (state.isActive() ? "1" : "0") + "|" + String.join(",", state.roles());
    }

    private static Optional<UserAccessState> decode(String value) {
        int bar = value.indexOf('|');
        if (bar != 1) {
            return Optional.empty();
        }
        String roles = value.substring(bar + 1);
        List<String> names = roles.isEmpty() ? List.of() : Arrays.asList(roles.split(","));
        return Optional.of(new UserAccessState(value.charAt(0) == '1', names));
    }
}
