package com.sportconnect.common.cache;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.Duration;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;
import java.util.function.Supplier;

/**
 * Lets a cache (Redis) be what it is: an optimisation in front of a source of truth, never a hard dependency.
 * Wrap each cache call in {@link #read} or {@link #run}; if the cache is unreachable the call degrades instead of
 * failing the request, so an outage costs speed, not availability.
 *
 * <p>Only {@link DataAccessException} is treated as "the cache is unavailable" (Spring's Redis template translates
 * connection failures, timeouts and other Redis errors into that family). Anything else, a bug in the supplied
 * operation for example, still propagates.
 *
 * <p><b>Logging:</b> a failure logs one {@code WARN} per {@code what} at most once a minute, without a stack trace
 * (these calls can run on every request, and a per-request trace would flood the log); the first success after a
 * failure logs a single {@code INFO} that the cache recovered.
 *
 * <p>Deliberately not a circuit breaker: every call still tries the cache. Bound the cost of a blackholed Redis with
 * the client timeouts ({@code spring.data.redis.timeout} / {@code connect-timeout}), not here.
 */
@Slf4j
@Component
public class CacheGuard {

    static final Duration WARN_INTERVAL = Duration.ofMinutes(1);

    private final Clock clock;
    private final ConcurrentMap<String, State> states = new ConcurrentHashMap<>();

    @Autowired
    public CacheGuard() {
        this(Clock.systemUTC());
    }

    /** For tests: a controllable clock. */
    CacheGuard(Clock clock) {
        this.clock = clock;
    }

    /**
     * Runs a cache read; when the cache is unavailable returns {@code fallback} instead of throwing.
     *
     * @param what     a short label for the log ("revocation watermark read"), also the rate-limit key
     * @param fallback what to return on failure; typically a marker the caller maps to "go to the source of truth"
     */
    public <T> T read(String what, Supplier<T> operation, T fallback) {
        try {
            T result = operation.get();
            recovered(what);
            return result;
        } catch (DataAccessException e) {
            failed(what, e);
            return fallback;
        }
    }

    /** Runs a cache write/delete; when the cache is unavailable the operation is skipped. */
    public void run(String what, Runnable operation) {
        try {
            operation.run();
            recovered(what);
        } catch (DataAccessException e) {
            failed(what, e);
        }
    }

    private void failed(String what, DataAccessException e) {
        State state = states.computeIfAbsent(what, key -> new State());
        long now = clock.millis();
        synchronized (state) {
            state.degraded = true;
            if (state.lastWarnAt == null || now - state.lastWarnAt >= WARN_INTERVAL.toMillis()) {
                state.lastWarnAt = now;
                log.warn("Cache unavailable during '{}', continuing without it: {}", what, e.getMessage());
            }
        }
    }

    private void recovered(String what) {
        State state = states.get(what);
        if (state == null) {
            return;
        }
        synchronized (state) {
            if (state.degraded) {
                state.degraded = false;
                state.lastWarnAt = null;
                log.info("Cache available again for '{}'", what);
            }
        }
    }

    private static final class State {
        private boolean degraded;
        private Long lastWarnAt;
    }
}
